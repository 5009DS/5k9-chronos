/* ═══════════════════════════════════════════════════════════════════════════
   STORE — camada de dados do 5K9 Client Visualizer.

   Escolhe o adaptador (Supabase ou localStorage) uma vez, no boot, e expõe a
   mesma API para as quatro coleções. As páginas nunca importam adaptador
   nenhum: pedem `store.conteudos.listar()` e pronto.

   As coleções:
     clientes   — quem recebe um link de cronograma
     conteudos  — cada item do cronograma, com fase, objetivo e data
     blocos     — os pedaços do roteiro de um conteúdo
     retornos   — aprovações e pedidos de ajuste vindos do cliente

   E duas portas que não são coleção:
     visualizacao(token)   a tela pública, montada e recortada pelo banco
     diretorio             o conhecimento estratégico enviado por Configurações
   ═══════════════════════════════════════════════════════════════════════════ */

import { CONFIGURADO } from './lib/supabase-config.js';
import { local } from './db/local.js';
import { remoto } from './db/remoto.js';
import { usarDiretorio, restaurarDiretorio } from './lib/diretorio.js';

const db = CONFIGURADO ? remoto : local;

/* ── Cache de leitura ────────────────────────────────────────────────────
   O painel monta uma tela a partir de três coleções ao mesmo tempo, e o
   cronograma pede clientes só para resolver nomes. Sem cache, navegar entre
   painel e cronograma custa dez consultas para os mesmos dados.

   30s é curto de propósito. O banco é compartilhado; o cache existe para não
   repetir a mesma consulta dentro de uma navegação, não para guardar estado.
   Toda escrita derruba a coleção afetada, então o que VOCÊ acabou de gravar
   aparece na hora — o atraso só pode existir para mudança feita por outra
   pessoa. */
const TTL = 30_000;
const cache = new Map();

const comCache = async (chave, buscar) => {
    const guardado = cache.get(chave);
    if (guardado && Date.now() - guardado.em < TTL) return guardado.dados;
    // Guarda a PROMESSA, não o resultado: duas telas pedindo o mesmo
    // compartilham a ida ao banco em vez de disparar duas.
    const promessa = buscar();
    cache.set(chave, { dados: promessa, em: Date.now() });
    try { return await promessa; }
    catch (e) { cache.delete(chave); throw e; }
};

const COLECOES = ['clientes', 'conteudos', 'blocos', 'retornos'];

const colecao = (nome) => ({
    listar: () => comCache(nome, () => db.listar(nome)),
    salvar: async (registro) => {
        const linha = await db.salvar(nome, registro);
        cache.delete(nome);
        return linha;
    },
    excluir: async (id) => {
        await db.excluir(nome, id);
        cache.delete(nome);
    },
    substituir: async (linhas) => {
        await db.substituir(nome, linhas);
        cache.delete(nome);
    },
});

// ── Sessão ──────────────────────────────────────────────────────────────
// Em modo local não existe login: `usuario` fica null e o app trata isso como
// acesso aberto. Em modo remoto, null significa "precisa entrar" — exceto na
// rota pública /c/, que nunca pede sessão (ver app.js).
let usuario = null;
const ouvintes = [];

/**
 * Token de link público.
 *
 * 10 caracteres de um alfabeto sem 0/O e 1/I/l: o token é lido em voz alta
 * por telefone e digitado à mão com mais frequência do que se imagina, e um
 * "zero ou ó" custa um suporte inteiro. 32^10 ≈ 10^15 combinações — não é
 * adivinhável por força bruta, e a unicidade ainda é garantida pelo índice
 * único da coluna.
 */
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
export const gerarToken = () => Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (n) => ALFABETO[n % ALFABETO.length]).join('');

export const store = {
    modo: db.modo,
    exigeLogin: CONFIGURADO,

    iniciarSessao: async () => {
        usuario = await db.sessao();
        if (db.aoMudarSessao) {
            await db.aoMudarSessao(async () => {
                usuario = await db.sessao();
                cache.clear();
                ouvintes.forEach(fn => fn(usuario));
            });
        }
        return usuario;
    },
    aoMudarSessao: (fn) => ouvintes.push(fn),
    usuario: () => usuario,

    entrar: async (email, senha) => {
        const r = await db.entrar(email, senha);
        if (!r.error) usuario = await db.sessao();
        return r;
    },
    sair: async () => {
        usuario = null;
        cache.clear();
        if (db.sair) await db.sair();
    },

    // ── Coleções ────────────────────────────────────────────────────────
    clientes:  colecao('clientes'),
    conteudos: colecao('conteudos'),
    blocos:    colecao('blocos'),
    retornos:  colecao('retornos'),

    /** Tudo de uma vez, em paralelo — é o que o painel consome. */
    tudo: async () => {
        const [clientes, conteudos, blocos, retornos] =
            await Promise.all(COLECOES.map(c => store[c].listar()));
        return { clientes, conteudos, blocos, retornos };
    },

    /** Um cliente com o cronograma inteiro dele, para as telas internas. */
    doCliente: async (clienteId) => {
        const { clientes, conteudos, blocos, retornos } = await store.tudo();
        const meus = conteudos.filter(c => c.cliente_id === clienteId);
        const ids = new Set(meus.map(c => c.id));
        return {
            cliente:   clientes.find(c => c.id === clienteId) || null,
            conteudos: meus,
            blocos:    blocos.filter(b => ids.has(b.conteudo_id)),
            retornos:  retornos.filter(r => ids.has(r.conteudo_id)),
        };
    },

    // ── Tela pública ────────────────────────────────────────────────────
    /**
     * O cronograma de um token. Devolve null quando o link não vale.
     *
     * Não usa o cache das coleções: é outra origem (uma função do banco, não
     * um select) e é a tela que mais precisa estar fresca — o cliente recarrega
     * justamente porque espera ver a mudança que acabou de ser combinada.
     */
    visualizacao: (token) => db.visualizacao(token),

    registrarRetorno: async (token, retorno) => {
        const linha = await db.registrarRetorno(token, retorno);
        // O retorno muda o status do conteúdo; o painel interno precisa
        // enxergar isso na próxima leitura.
        cache.delete('conteudos');
        cache.delete('retornos');
        return linha;
    },

    // ── Diretório ───────────────────────────────────────────────────────
    /**
     * Carrega a sobreposição do diretório, se houver, e a aplica.
     *
     * Roda no boot, ANTES do primeiro desenho: a explicação de um objetivo é
     * parte do conteúdo da página, não um enfeite que pode chegar depois.
     * Falha em silêncio de propósito — sem a sobreposição o sistema continua
     * inteiro, com o diretório do arquivo, e derrubar a tela por causa de um
     * JSON malformado seria trocar um problema pequeno por um grande.
     */
    aplicarDiretorio: async () => {
        try {
            const linhas = await db.listar('diretorio');
            const pacote = linhas?.[0]?.pacote;
            if (pacote) usarDiretorio(pacote);
            return !!pacote;
        } catch (e) {
            console.warn('[store] diretório personalizado não carregou:', e);
            return false;
        }
    },

    salvarDiretorio: async (pacote) => {
        await db.salvar('diretorio', { id: 'atual', pacote, criado_em: new Date().toISOString() });
        usarDiretorio(pacote);
    },

    limparDiretorio: async () => {
        await db.excluir('diretorio', 'atual');
        restaurarDiretorio();
    },

    diretorioEnviado: async () => {
        const linhas = await db.listar('diretorio');
        return linhas?.[0] || null;
    },

    limparCache: () => cache.clear(),

    /** Exportação/importação de segurança (ver pages/configuracoes.js). */
    exportar: async () => {
        const dados = await store.tudo();
        return { versao: 1, exportado_em: new Date().toISOString(), ...dados };
    },
    importar: async (pacote) => {
        for (const c of COLECOES) {
            if (Array.isArray(pacote[c])) await store[c].substituir(pacote[c]);
        }
        cache.clear();
    },
};
