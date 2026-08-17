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

    listar: async (colecao) => {
        const s = await cliente();
        const { data, error } = await s.from(tabela(colecao)).select('*')
            .order('criado_em', { ascending: false });
        if (error) falhar(`listar(${colecao})`, error);
        return data || [];
    },

    salvar: async (colecao, registro) => {
        const s = await cliente();
        const linha = { ...registro, id: registro.id || crypto.randomUUID() };
        const { data, error } = await s.from(tabela(colecao)).upsert(linha).select().maybeSingle();
        if (error) falhar(`salvar(${colecao})`, error);
        return data;
    },

    excluir: async (colecao, id) => {
        const s = await cliente();
        const { error } = await s.from(tabela(colecao)).delete().eq('id', id);
        if (error) falhar(`excluir(${colecao})`, error);
    },

    substituir: async (colecao, linhas) => {
        const s = await cliente();
        const { error } = await s.from(tabela(colecao)).upsert(linhas);
        if (error) falhar(`substituir(${colecao})`, error);
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
