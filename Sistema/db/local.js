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

import { etiquetasPublicas, ajusteTravado, etiquetasAoAprovar, esteiraDe } from '../lib/etiquetas.js';

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

        /* Cascata, como no banco: vz_blocos e vz_retornos apontam para
           vz_conteudos com `on delete cascade`. Sem isto, apagar um conteúdo
           aqui deixava roteiro e conversa órfãos — o mesmo dado com dois
           comportamentos, que é o tipo de divergência que só aparece quando
           alguém liga o banco de verdade. */
        if (colecao === 'conteudos') {
            gravar('blocos', ler('blocos').filter(b => b.conteudo_id !== id));
            gravar('retornos', ler('retornos').filter(r => r.conteudo_id !== id));
        }

        /* E aqui o Postgres faz o outro lado: `bloco_id references vz_blocos
           on delete set null`. Sem esta parte o comentário continuaria
           apontando para um bloco que não existe mais — e sumiria das duas
           telas, porque cada uma só desenha conversa de bloco presente. */
        if (colecao === 'blocos') {
            const retornos = ler('retornos');
            let mexeu = false;
            for (const r of retornos) {
                if (r.bloco_id === id) { r.bloco_id = null; mexeu = true; }
            }
            if (mexeu) gravar('retornos', retornos);
        }
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
        // Token OU apelido, exatamente como a função vz_visualizacao do banco.
        // Quando os dois lados divergem, a prévia mente sobre o que o cliente
        // vê — que é o único trabalho desta função.
        const cliente = ler('clientes').find(c =>
            (c.token === token || (c.apelido && c.apelido === token)) && c.ativo !== false);
        if (!cliente) return null;

        /* O mesmo recorte da função do banco, inclusive as etiquetas: nota
           interna fora, etiqueta de produção dentro, texto livre fora. Os dois
           adaptadores precisam mostrar a mesma coisa ao cliente — divergência
           aqui vira "no meu está diferente" numa reunião. */
        const conteudos = ler('conteudos')
            .filter(c => c.cliente_id === cliente.id
                      && c.status !== 'rascunho'
                      && !c.banco_em)
            .map(({ nota, banco_em, ...c }) => ({
                ...c, etiquetas: etiquetasPublicas(c.etiquetas),
            }));
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

        /* A mesma trava da função do banco: gravado fecha o pedido de
           MUDANÇA, e aprovar continua valendo. Repetida aqui porque os dois
           adaptadores precisam recusar o mesmo clique — a prévia existe para
           mostrar o que o cliente vive. */
        const alvo = ler('conteudos').find(c => c.id === retorno.conteudo_id);
        if (retorno.tipo === 'ajuste' && ajusteTravado(alvo?.etiquetas)) {
            throw new Error('Este conteúdo já foi gravado — o roteiro não muda mais. '
                          + 'Fale com a equipe se precisar de algo.');
        }

        const linha = await local.salvar('retornos', {
            ...retorno,
            // Quem entra por aqui é o cliente, como na função do banco. O lado
            // não vem por parâmetro de propósito (ver db/migracao-conversa.sql).
            origem: 'cliente',
            id: crypto.randomUUID(),
            criado_em: new Date().toISOString(),
        });

        /* O status do conteúdo acompanha o último retorno: é o que faz a
           decisão do cliente aparecer no painel sem ninguém transcrever.

           SÓ QUANDO O RETORNO É DO CONTEÚDO INTEIRO. "Esta fala ficou boa" é o
           fim de um assunto, não a aprovação da peça. A regra vale igual no
           banco; está repetida aqui porque os dois adaptadores precisam
           responder a mesma coisa ao mesmo clique — divergência entre eles
           aparece como bug que só acontece em produção. */
        if (!retorno.bloco_id) {
            /* `alvo` e não o conteúdo da visão: a visão já saiu recortada para
               o cliente, sem nota e só com as etiquetas públicas — gravar a
               partir dela apagaria as internas. */
            await local.salvar('conteudos', {
                ...alvo,
                status: retorno.tipo === 'aprovado' ? 'aprovado' : 'ajuste',
                etiquetas: retorno.tipo === 'aprovado'
                    ? etiquetasAoAprovar(alvo?.etiquetas, esteiraDe(alvo?.formato))
                    : alvo?.etiquetas,
            });
        }
        return linha;
    },
};
