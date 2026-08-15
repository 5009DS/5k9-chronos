/* ═══════════════════════════════════════════════════════════════════════════
   PONTE COM O 5K9 GESTOR — a cartela do estúdio.

   O Gestor é onde um cliente novo aparece primeiro: ele é cadastrado no dia em
   que assina, porque é aí que começa a haver dinheiro. Sem esta ponte, o mesmo
   cliente seria digitado de novo aqui — e nome digitado duas vezes vira
   "Instituto Dr Tigre" num sistema e "Instituto Dr. Tigre" no outro, o que só
   aparece quando alguém tenta cruzar os dois.

   ── POR QUE UM SEGUNDO CLIENTE SUPABASE ───────────────────────────────────
   O Gestor mora em OUTRO projeto Supabase — dinheiro não divide banco com
   sistema que tem porta pública. Projetos diferentes têm URL e chave
   diferentes, e a biblioteca guarda a sessão por projeto. Então aqui existe um
   cliente próprio, separado do que o store usa, criado só quando alguém pede a
   cartela.

   ── O QUE VEM ─────────────────────────────────────────────────────────────
   Nome, empresa e cor dos clientes; nome, papel e cor dos integrantes ativos.
   Nada de documento, contato, chave pix, nota ou qualquer valor — a função do
   lado de lá (db/migracao-cartela.sql, no repositório do Gestor) devolve só
   isso, e é ela que decide, não este arquivo.

   ── O QUE ESTA PONTE NÃO FAZ ──────────────────────────────────────────────
   Não sincroniza: copia, quando alguém manda copiar. Não há gatilho, não há
   fila, não há "atualizar automaticamente". Um cliente renomeado no Gestor
   continua com o nome antigo aqui até alguém importar de novo — e isso é
   deliberado. Este sistema manda link para gente de fora; um nome que muda
   sozinho num cronograma já publicado é pior que um nome desatualizado.
   ═══════════════════════════════════════════════════════════════════════════ */

/* As credenciais do projeto do GESTOR, não as deste sistema. São as mesmas que
   estão em `Sistema/lib/supabase-config.js` do repositório do 5K9 Gestor — a
   chave `anon` é pública por natureza e não protege nada sozinha; quem protege
   é o RLS de lá, mais o recorte da função `cartela()`.

   Vazio desliga a ponte, e a tela diz isso em vez de dar erro. */
export const GESTOR_URL  = 'https://vwgxrufjlalqshixalmo.supabase.co';
export const GESTOR_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Z3hydWZqbGFscXNoaXhhbG1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NTE5NjIsImV4cCI6MjEwMjIyNzk2Mn0.6QfO8DLYsF6hiKpqSfeZclz2oi4WoT8cTWPKHWkhXAM';

export const PONTE_LIGADA = !!(GESTOR_URL && GESTOR_ANON);

let sb = null;

const cliente = async () => {
    if (sb) return sb;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    /* persistSession: false — esta ponte só lê uma função pública e nunca faz
       login. Sem isso a biblioteca instala um segundo GoTrueClient no mesmo
       navegador, e dois deles disputando o localStorage derrubam a sessão do
       sistema principal em silêncio. */
    sb = createClient(GESTOR_URL, GESTOR_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return sb;
};

/**
 * A cartela do Gestor.
 *
 * @returns {Promise<{clientes: object[], integrantes: object[]}>}
 * @throws  quando a ponte está desligada, a rede falha ou a função ainda não
 *          foi criada no banco do Gestor — as três com mensagem própria,
 *          porque as três têm conserto diferente.
 */
export const lerCartela = async () => {
    if (!PONTE_LIGADA) {
        throw new Error('A ponte com o Gestor está desligada. Preencha GESTOR_URL e '
                      + 'GESTOR_ANON em Sistema/lib/gestor.js.');
    }

    const s = await cliente();
    const { data, error } = await s.rpc('cartela');

    if (error) {
        console.error('[gestor] falha ao ler a cartela:', error);
        /* "função não existe" chega com dois códigos: 42883 é o do Postgres,
           PGRST202 é o do PostgREST quando a função não está no cache de
           schema dele. É o erro esperado enquanto a migração não tiver sido
           rodada no Gestor, e merece instrução em vez de código. */
        if (error.code === '42883' || error.code === 'PGRST202'
            || /function .*cartela/i.test(error.message || '')) {
            throw new Error('O Gestor ainda não tem a função de cartela. Rode '
                          + 'Sistema/db/migracao-cartela.sql no SQL Editor do projeto dele.');
        }
        throw new Error('Não consegui falar com o Gestor agora. Verifique a conexão.');
    }

    const cartela = {
        clientes: data?.clientes || [],
        integrantes: data?.integrantes || [],
    };
    guardarTime(cartela.integrantes);
    return cartela;
};

/* ── O time, guardado neste navegador ────────────────────────────────────
   O formulário de conteúdo oferece um responsável, e a lista de nomes vem do
   Gestor. Buscar do outro projeto toda vez que alguém abre o formulário
   colocaria uma requisição de rede — e uma falha dela — no caminho de uma
   ação que não depende disso. Então a última cartela lida fica no navegador, e
   o formulário usa o que tiver.

   Fica no localStorage e não no banco de propósito: é conveniência de quem
   está usando, não dado do sistema. Se sumir, a única consequência é o campo
   virar texto livre até alguém importar a cartela de novo. */
const CHAVE_TIME = '5k9_visualizador_time';

const guardarTime = (integrantes) => {
    try {
        if (integrantes?.length) localStorage.setItem(CHAVE_TIME, JSON.stringify(integrantes));
    } catch { /* navegador sem localStorage: o campo vira texto livre */ }
};

/** Os integrantes da última cartela lida. Lista vazia se nunca leu. */
export const timeSalvo = () => {
    try { return JSON.parse(localStorage.getItem(CHAVE_TIME)) || []; }
    catch { return []; }
};
