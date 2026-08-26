/* ═══════════════════════════════════════════════════════════════════════════
   STORE — camada de dados do 5K9 Chronos.

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

    /* Guarda a PROMESSA, não o resultado: duas telas pedindo o mesmo
       compartilham a ida ao banco em vez de disparar duas. Quando ela resolve,
       a lista toma o lugar da promessa na MESMA entrada — é o que permite
       remendar o cache depois (ver mexerNoCache). */
    const promessa = buscar();
    const entrada = { dados: promessa, em: Date.now() };
    cache.set(chave, entrada);
    try {
        const lista = await promessa;
        /* Só troca se ninguém mexeu no meio do voo: uma escrita pode ter
           apagado esta entrada, e ressuscitá-la seria devolver dado velho. */
        if (cache.get(chave) === entrada) entrada.dados = lista;
        return lista;
    } catch (e) {
        if (cache.get(chave) === entrada) cache.delete(chave);
        throw e;
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   O CACHE ACOMPANHA A ESCRITA, EM VEZ DE SE JOGAR FORA

   Toda escrita derrubava a coleção inteira. Correto e caro: trocar o status de
   UM conteúdo obrigava a próxima tela a reler os 240 conteúdos do estúdio, e
   apagar UMA fala, a reler os 1.900 blocos de todos os clientes. Medido antes
   de mexer, com um estúdio de seis clientes.

   Agora a escrita aplica no cache o que aplicou no banco: a linha salva entra
   no lugar dela, a excluída sai. A leitura seguinte não vai ao banco e devolve
   exatamente o que o banco tem.

   ── O QUE NÃO MUDA, E É O PONTO DELICADO ─────────────────────────────────
   `em` fica intacto. O TTL conta desde a LEITURA, não desde a última escrita —
   senão uma aba ocupada nunca releria, e mudança feita por outra pessoa
   demoraria para aparecer. O remendo economiza rede; ele não estende a
   validade do que está guardado.

   ── CASCATA ──────────────────────────────────────────────────────────────
   O banco apaga em cascata (db/schema.sql): conteúdo leva blocos e retornos,
   cliente leva conteúdos. Um cache que não soubesse disso guardaria filhos de
   um pai que não existe mais — e a tela mostraria roteiro de conteúdo apagado
   até o TTL vencer. A cascata está espelhada aqui, com a mesma regra do
   esquema, inclusive o `on delete set null` do bloco no retorno: o comentário
   sobrevive à fala, órfão.
   ═══════════════════════════════════════════════════════════════════════════ */
const mexerNoCache = (nome, transformar) => {
    const guardado = cache.get(nome);
    if (!guardado) return;
    /* Ainda voando: a lista nem chegou, e remendar promessa é convite a erro.
       Jogar fora é o que o código fazia sempre, e continua correto. */
    if (!Array.isArray(guardado.dados)) { cache.delete(nome); return; }
    guardado.dados = transformar(guardado.dados);
};

const cascatearNoCache = (nome, id) => {
    if (nome === "conteudos") {
        mexerNoCache("blocos",   (l) => l.filter(b => b.conteudo_id !== id));
        mexerNoCache("retornos", (l) => l.filter(r => r.conteudo_id !== id));
    }
    if (nome === "blocos") {
        // on delete set null: o retorno fica, sem a fala que ele comentava.
        mexerNoCache("retornos", (l) => l.map(r => r.bloco_id === id ? { ...r, bloco_id: null } : r));
    }
    if (nome === "clientes") {
        const guardado = cache.get("conteudos");
        // Os filhos precisam ser lidos ANTES de sumirem da lista.
        const filhos = Array.isArray(guardado?.dados)
            ? guardado.dados.filter(c => c.cliente_id === id).map(c => c.id)
            : null;
        mexerNoCache("conteudos", (l) => l.filter(c => c.cliente_id !== id));
        if (filhos) filhos.forEach(idFilho => cascatearNoCache("conteudos", idFilho));
        // Sem saber quais conteúdos eram, reler é mais honesto que adivinhar.
        else { cache.delete("blocos"); cache.delete("retornos"); }
    }
};

const COLECOES = ['clientes', 'conteudos', 'blocos', 'retornos'];

const colecao = (nome) => ({
    listar: () => comCache(nome, () => db.listar(nome)),

    salvar: async (registro) => {
        const linha = await db.salvar(nome, registro);
        /* A linha vem do BANCO, não do que foi enviado: ela traz id gerado,
           carimbo de criação e o que mais o servidor tenha decidido. */
        mexerNoCache(nome, (lista) => {
            const i = lista.findIndex(x => x.id === linha.id);
            if (i < 0) return [linha, ...lista];   // nova entra na frente, como o banco devolve
            const nova = [...lista];
            nova[i] = linha;
            return nova;
        });
        return linha;
    },

    excluir: async (id) => {
        await db.excluir(nome, id);
        mexerNoCache(nome, (lista) => lista.filter(x => x.id !== id));
        cascatearNoCache(nome, id);
    },

    /* Substituir troca a coleção inteira e só é usada pela restauração de
       backup, que limpa o cache logo depois. Remendar aqui seria escrever
       regra para um caso que já é resolvido de forma mais simples. */
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

    /* ── A SESSÃO AVISA MUITO MAIS DO QUE MUDA ────────────────────────────
       O supabase-js dispara onAuthStateChange em situações que não têm nada a
       ver com trocar de usuário: assim que a assinatura é feita
       (INITIAL_SESSION), a cada renovação de token, quando a aba volta a ficar
       visível e — o caso que incomoda — quando OUTRA aba renova a sessão e a
       sincroniza pelo armazenamento local.

       Como cada aviso limpava o cache e mandava as telas se redesenharem, a
       aba que estava parada no fundo piscava sozinha: ela apagava e remontava
       a página inteira porque a outra aba renovou um token. E toda abertura de
       página já nascia com um redesenho a mais, de graça (medido: um aviso por
       carregamento, mesmo deslogado).

       Agora o gatilho é o que a assinatura sempre quis dizer: MUDOU DE PESSOA.
       Comparar o id cobre os dois casos reais — entrou em outra aba (null → id)
       e saiu em outra aba (id → null) — e ignora renovação, foco e eco entre
       abas, onde o id é o mesmo.

       Entrar e sair NESTA aba não dependem daqui: as duas telas navegam por
       conta própria depois da chamada (pages/login.js e components/topnav.js). */
    iniciarSessao: async () => {
        usuario = await db.sessao();
        if (db.aoMudarSessao) {
            await db.aoMudarSessao(async () => {
                const antes = usuario?.id ?? null;
                usuario = await db.sessao();
                if ((usuario?.id ?? null) === antes) return;

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
