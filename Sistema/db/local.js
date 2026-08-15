/* ═══════════════════════════════════════════════════════════════════════════
   ADAPTADOR LOCAL — localStorage.

   Usado enquanto lib/supabase-config.js estiver vazio. Mesma interface do
   adaptador remoto, então o store não sabe qual dos dois está em uso e as
   páginas nunca precisam perguntar.

   Limite conhecido e assumido: os dados vivem NESTE navegador. Aqui isso
   pesa mais que no Gestor, porque este sistema tem uma tela feita para gente
   de fora — o link do cliente só abre o cronograma no MESMO navegador que o
   criou. Em modo local ele serve para conferir a visão do cliente antes de
   publicar, não para mandar por WhatsApp. A topnav avisa o tempo todo, e
   Configurações oferece exportar em JSON.
   ═══════════════════════════════════════════════════════════════════════════ */

const CHAVE = (colecao) => `5k9_visualizador_${colecao}`;

const ler = (colecao) => {
    try { return JSON.parse(localStorage.getItem(CHAVE(colecao))) || []; }
    catch { return []; }
};

const gravar = (colecao, linhas) =>
    localStorage.setItem(CHAVE(colecao), JSON.stringify(linhas));

export const local = {
    modo: 'local',

    // Sem banco não há sessão. O app trata `null` como "modo aberto" e pula
    // a tela de login inteira (ver app.js).
    sessao: async () => null,

    listar: async (colecao) => ler(colecao),

    /**
     * Insere ou atualiza pelo id. Devolve a linha gravada.
     *
     * `criado_em` só é carimbado na inserção: reescrever a data a cada edição
     * faria toda a base parecer criada hoje e quebraria a ordenação.
     */
    salvar: async (colecao, registro) => {
        const linhas = ler(colecao);
        const id = registro.id || crypto.randomUUID();
        const i = linhas.findIndex(l => l.id === id);
        const linha = {
            ...(i > -1 ? linhas[i] : { criado_em: new Date().toISOString() }),
            ...registro,
            id,
        };
        if (i > -1) linhas[i] = linha; else linhas.unshift(linha);
        gravar(colecao, linhas);
        return linha;
    },

    excluir: async (colecao, id) => {
        gravar(colecao, ler(colecao).filter(l => l.id !== id));
    },

    /** Troca a coleção inteira de uma vez — usado pela importação de JSON. */
    substituir: async (colecao, linhas) => {
        gravar(colecao, linhas);
        return linhas;
    },

    /**
     * A visão do cliente, montada por token.
     *
     * Espelha, em memória, exatamente o que a função `visualizacao()` do
     * Postgres devolve em modo remoto — inclusive o recorte: rascunho NÃO
     * sai daqui. Se as duas versões divergissem, a prévia mentiria sobre o
     * que o cliente vê, que é o único trabalho desta tela.
     */
    visualizacao: async (token) => {
        const cliente = ler('clientes').find(c => c.token === token && c.ativo !== false);
        if (!cliente) return null;

        const conteudos = ler('conteudos')
            .filter(c => c.cliente_id === cliente.id && c.status !== 'rascunho');
        const ids = new Set(conteudos.map(c => c.id));

        return {
            cliente,
            conteudos,
            blocos:   ler('blocos').filter(b => ids.has(b.conteudo_id)),
            retornos: ler('retornos').filter(r => ids.has(r.conteudo_id)),
            // O diretório vigente viaja junto, como no remoto: a tela do
            // cliente é feita de explicação estratégica e precisa mostrar a
            // que a equipe publicou, não a embutida no código.
            diretorio: ler('diretorio')[0]?.pacote || null,
        };
    },

    /** Aprovação ou pedido de ajuste vindo da tela pública. */
    registrarRetorno: async (token, retorno) => {
        const visao = await local.visualizacao(token);
        if (!visao) throw new Error('Este link não está mais válido.');
        if (!visao.conteudos.some(c => c.id === retorno.conteudo_id)) {
            throw new Error('Este conteúdo não pertence a este cronograma.');
        }

        const linha = await local.salvar('retornos', {
            ...retorno,
            id: crypto.randomUUID(),
            criado_em: new Date().toISOString(),
        });
        // O status do conteúdo acompanha o último retorno: é o que faz a
        // decisão do cliente aparecer no painel sem ninguém transcrever.
        const conteudo = visao.conteudos.find(c => c.id === retorno.conteudo_id);
        await local.salvar('conteudos', {
            ...conteudo,
            status: retorno.tipo === 'aprovado' ? 'aprovado' : 'ajuste',
        });
        return linha;
    },
};
