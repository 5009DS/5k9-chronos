/* ═══════════════════════════════════════════════════════════════════════════
   ADAPTADOR REMOTO — Supabase.

   Espelha a interface do adaptador local. A biblioteca é importada de forma
   PREGUIÇOSA (import dinâmico dentro de cliente()): em modo local o arquivo
   até é carregado pelo store, mas nada deve ir buscar 100kB de CDN para um
   banco que não existe.

   ── A DIFERENÇA PARA O FORMS E O GESTOR ───────────────────────────────────
   Este sistema tem uma tela que gente de fora abre sem login, e por isso a
   leitura pública NÃO passa por `select` direto nas tabelas. Ela passa por
   duas funções do banco — `visualizacao(token)` e `registrar_retorno(...)` —
   declaradas `security definer` (ver db/schema.sql).

   O motivo é concreto: RLS decide o que uma linha permite, não o que a
   consulta pediu. Uma política que liberasse `vz_clientes` para o papel
   anônimo liberaria a TABELA inteira, e qualquer pessoa com a chave `anon` —
   que é pública por natureza, vai no código do navegador — poderia listar
   todos os clientes do estúdio com seus tokens. Com função, o anônimo não tem
   acesso a tabela nenhuma: ele só consegue perguntar "o que existe para ESTE
   token", e a resposta já vem recortada.

   ── POR QUE TODA TABELA COMEÇA COM vz_ ────────────────────────────────────
   Este sistema COMPARTILHA o projeto Supabase do 5K9 Forms, em vez de ter um
   próprio: o plano gratuito limita quantos projetos a organização pode ter, e
   um banco a mais custaria uma assinatura para guardar algumas centenas de
   linhas. Dividir o projeto é de graça e não tem contrapartida técnica — o
   Postgres não fica mais lento por ter mais tabelas.

   O que ele NÃO pode ter é colisão de nome: o Forms já tem uma tabela
   `clientes`, e são outros clientes. Por isso tudo daqui carrega o prefixo, e
   o mapa abaixo é o único lugar do código que sabe disso. As páginas
   continuam pedindo `store.clientes` — se um dia o sistema ganhar projeto
   próprio, este mapa é o que muda.
   ═══════════════════════════════════════════════════════════════════════════ */

import { SUPABASE_URL, SUPABASE_ANON } from '../lib/supabase-config.js';

/** Coleção do app → tabela no banco compartilhado. */
const TABELAS = {
    clientes:  'vz_clientes',
    conteudos: 'vz_conteudos',
    blocos:    'vz_blocos',
    retornos:  'vz_retornos',
    diretorio: 'vz_diretorio',
};

const tabela = (colecao) => TABELAS[colecao] || colecao;

let sb = null;

/* Uma instância só, para sempre. Dois createClient() no mesmo navegador geram
   dois GoTrueClient disputando a mesma sessão salva — o segundo derruba o
   primeiro em silêncio e a pessoa é deslogada do nada. */
const cliente = async () => {
    if (sb) return sb;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON);
    return sb;
};

const falhar = (contexto, error) => {
    console.error(`[db] ${contexto}:`, error);
    throw error;
};

/* ═══════════════════════════════════════════════════════════════════════════
   "JWT ISSUED AT FUTURE" — e por que ele vira uma tentativa, não uma tela de
   erro.

   O token de sessão é emitido pelo serviço de autenticação e conferido pelo
   PostgREST. São duas máquinas, e o relógio de uma pode estar alguns segundos
   à frente do da outra: o token nasce carimbado com um instante que, para
   quem confere, ainda não chegou. A conferência não tem folga nenhuma, então
   ela recusa — e o recado que sobra é "JWT issued at future", no meio de um
   clique qualquer.

   O que torna isso pior do que precisa ser: o erro é TRANSITÓRIO por
   definição. Um segundo depois, o mesmo token passa. Mas ele subia até o
   roteador e virava "Algo quebrou ao montar esta tela", com uma frase em
   inglês sobre JWT e um botão de voltar ao início — para um problema que se
   resolve sozinho enquanto a pessoa lê a mensagem.

   Então a chamada tenta de novo, em vez de desistir:

     1ª falha transitória → espera um segundo e repete (cobre o desencontro
                            de relógio, que é de segundos);
     2ª falha             → renova a sessão e repete (cobre o token vencido
                            de verdade, que a renovação resolve);
     3ª falha             → aí sim é erro, e a mensagem diz o que fazer.

   ── QUANDO NÃO É DESENCONTRO DE SEGUNDOS ──────────────────────────────────
   Se o relógio DESTE computador estiver errado de minutos, nenhuma tentativa
   resolve: todo token vai nascer no futuro. Nesse caso a mensagem para de
   falar de JWT e diz a única coisa acionável que existe — que horas o
   servidor acha que são. O desvio é medido no cabeçalho Date da própria
   resposta, que é a hora do servidor sem custo de mais uma consulta.
   ═══════════════════════════════════════════════════════════════════════════ */
const TRANSITORIO = /issued at future|jwt expired|token is expired|jwsinvalid|pgrst301|invalid claim/i;

const ehTransitorio = (error) =>
    !!error && TRANSITORIO.test(`${error.message || ''} ${error.code || ''}`);

const espera = (ms) => new Promise(r => setTimeout(r, ms));

/** Quantos segundos este computador está adiantado em relação ao servidor. */
const desvioDeRelogio = async () => {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD', headers: { apikey: SUPABASE_ANON },
        });
        const doServidor = Date.parse(r.headers.get('date') || '');
        if (!doServidor) return null;
        return Math.round((Date.now() - doServidor) / 1000);
    } catch { return null; }
};

const erroDeRelogio = async () => {
    const desvio = await desvioDeRelogio();
    if (desvio === null || Math.abs(desvio) < 30) {
        return new Error('A sessão precisou ser renovada e o banco recusou. Recarregue a página.');
    }
    const minutos = Math.round(Math.abs(desvio) / 60);
    const quanto = minutos >= 1 ? `${minutos} minuto${minutos === 1 ? '' : 's'}` : `${Math.abs(desvio)} segundos`;
    return new Error(`O relógio deste computador está ${desvio > 0 ? 'adiantado' : 'atrasado'} `
        + `${quanto} em relação ao servidor, e por isso o acesso é recusado. `
        + 'Acerte a hora do sistema e recarregue a página.');
};

/**
 * Executa uma consulta e insiste quando a falha é de relógio ou de sessão.
 *
 * @param {string} contexto  para o console, quando não der
 * @param {function} consulta  devolve a promessa do supabase-js ({data, error})
 */
const executar = async (contexto, consulta) => {
    let r = await consulta();
    if (!ehTransitorio(r.error)) {
        if (r.error) falhar(contexto, r.error);
        return r.data;
    }

    await espera(1200);
    r = await consulta();

    if (ehTransitorio(r.error)) {
        console.warn(`[db] ${contexto}: token recusado duas vezes, renovando a sessão`);
        try { await (await cliente()).auth.refreshSession(); } catch { /* segue mesmo assim */ }
        r = await consulta();
    }

    if (ehTransitorio(r.error)) {
        console.error(`[db] ${contexto}:`, r.error);
        throw await erroDeRelogio();
    }
    if (r.error) falhar(contexto, r.error);
    return r.data;
};

export const remoto = {
    modo: 'remoto',

    sessao: async () => {
        const s = await cliente();
        const { data: { session } } = await s.auth.getSession();
        return session?.user
            ? { id: session.user.id, email: session.user.email,
                nome: session.user.user_metadata?.nome
                      || (session.user.email || '').split('@')[0] }
            : null;
    },

    entrar: async (email, senha) => {
        const s = await cliente();
        return s.auth.signInWithPassword({ email, password: senha });
    },

    sair: async () => {
        const s = await cliente();
        return s.auth.signOut();
    },

    aoMudarSessao: async (fn) => {
        const s = await cliente();
        s.auth.onAuthStateChange(() => fn());
    },

    /* ── LER A TABELA INTEIRA, E NÃO A PRIMEIRA PÁGINA DELA ───────────────
       Um select sem faixa não devolve necessariamente tudo: o PostgREST tem um
       teto de linhas por resposta, configurado no projeto, e o que passa dele
       simplesmente não vem. Sem erro, sem aviso — a resposta chega com 200 e
       menos linhas do que existe.

       O sintoma disso é cruel: um conteúdo existe no banco, aparece na tela do
       cliente (que é montada por uma função, num select só, sem essa regra) e
       some das telas internas, que leem a tabela. Duas telas, dois caminhos,
       uma delas cortada em silêncio.

       Então a leitura pede em páginas até a página vir curta. Uma tabela menor
       que o teto continua custando UMA consulta — o laço só paga por si mesmo
       quando existe mais dado do que cabe na primeira resposta.

       A ordem é a mesma de antes, e ela é o que torna a paginação segura: sem
       ORDER BY, o banco não promete estabilidade entre páginas e a mesma linha
       pode aparecer duas vezes ou nenhuma. */
    listar: async (colecao) => {
        const s = await cliente();
        const PAGINA = 1000;
        const tudo = [];

        for (let inicio = 0; ; inicio += PAGINA) {
            const pagina = await executar(`listar(${colecao})`,
                () => s.from(tabela(colecao)).select('*')
                    .order('criado_em', { ascending: false })
                    .range(inicio, inicio + PAGINA - 1));

            if (!pagina?.length) break;
            tudo.push(...pagina);
            if (pagina.length < PAGINA) break;

            /* Trava de segurança: uma coleção que não termina é sinal de que a
               faixa não está sendo respeitada, e é melhor parar com o que se
               tem do que girar para sempre num navegador. */
            if (tudo.length >= 50_000) {
                console.warn(`[db] listar(${colecao}): parei em ${tudo.length} linhas`);
                break;
            }
        }
        return tudo;
    },

    salvar: async (colecao, registro) => {
        const s = await cliente();
        const linha = { ...registro, id: registro.id || crypto.randomUUID() };
        /* A repetição é segura aqui porque o upsert é idempotente: o id vem
           decidido de casa, então gravar duas vezes escreve a mesma linha. */
        return executar(`salvar(${colecao})`,
            () => s.from(tabela(colecao)).upsert(linha).select().maybeSingle());
    },

    excluir: async (colecao, id) => {
        const s = await cliente();
        await executar(`excluir(${colecao})`,
            () => s.from(tabela(colecao)).delete().eq('id', id));
    },

    substituir: async (colecao, linhas) => {
        const s = await cliente();
        await executar(`substituir(${colecao})`,
            () => s.from(tabela(colecao)).upsert(linhas));
        return linhas;
    },

    // ── Tela pública ────────────────────────────────────────────────────
    /** Cronograma de um token ou apelido, sem rascunhos. `null` se não vale. */
    visualizacao: (token) => chamarRPC('vz_visualizacao', { p_token: token }),

    registrarRetorno: (token, retorno) => chamarRPC('vz_registrar_retorno', {
        p_token:    token,
        p_conteudo: retorno.conteudo_id,
        p_tipo:     retorno.tipo,
        p_texto:    retorno.texto || null,
        p_autor:    retorno.autor || null,
        p_bloco:    retorno.bloco_id || null,
        p_trecho:   retorno.trecho || null,
    }),
};

/* ═══════════════════════════════════════════════════════════════════════════
   AS DUAS CHAMADAS PÚBLICAS NÃO USAM A BIBLIOTECA — usam fetch puro.

   Elas são as únicas que a tela do CLIENTE faz, e ele abre o link no celular,
   em rede de operadora, quase sempre sem cache. Passar pelo supabase-js
   custava baixar ~100kB de um CDN de terceiro ANTES de a primeira letra
   aparecer — para depois fazer um POST de duas linhas.

   O endpoint REST de uma função é um POST com a chave no cabeçalho. Não há o
   que a biblioteca resolva aqui: não há sessão a renovar, nem query a montar,
   nem tipo a inferir. Ela continua servindo o painel interno, onde há login,
   assinatura de mudança de sessão e uma dúzia de consultas — e onde o
   download acontece uma vez e fica em cache.

   Efeito colateral bom: a tela do cliente deixa de depender do esm.sh estar
   no ar. Um CDN fora do ar passa a quebrar o painel da equipe, não o link que
   está na mão do cliente.
   ═══════════════════════════════════════════════════════════════════════════ */
const chamarRPC = async (funcao, corpo) => {
    const resposta = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcao}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON,
            Authorization: `Bearer ${SUPABASE_ANON}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(corpo),
    });

    // Corpo vazio é resposta válida (a função pode devolver null).
    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : null;

    if (!resposta.ok) {
        console.error(`[db] ${funcao}:`, dados || resposta.status);
        /* A função levanta exceção com mensagem escrita para ser lida por
           gente ("Este link não está mais válido"). O PostgREST devolve essa
           frase em `message`, e ela vai direto para a tela — virar um "erro ao
           salvar" genérico jogaria fora a única explicação útil. */
        const erro = new Error(dados?.message || `Falha ao falar com o banco (${resposta.status}).`);
        erro.code = dados?.code;
        throw erro;
    }
    return dados;
};
