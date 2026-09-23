import { store } from '../store.js';
import { comEtapa, statusDaEtapa, etiquetaMeta, ETAPA_ESCRITA, ETAPA_APROVACAO } from './etiquetas.js';
import { entradaDaEquipe } from './conversa.js';
import { aprovouNoHistorico, equipeDevolveu } from './consistencia.js';

/* ═══════════════════════════════════════════════════════════════════════════
   MOVER DE ETAPA — a operação, num lugar só.

   Três telas movem uma peça de etapa: o botão "Mover para" da demanda, o
   arraste da esteira e o menu do cartão no cronograma. Até aqui, cada uma
   repetia a mesma sequência — trocar a etiqueta, puxar o status, montar o
   desfazer. Três cópias de uma regra que já mudou duas vezes; a terceira
   mudança encontraria uma delas desatualizada, e o sintoma seria o pior
   possível: arrastar e clicar deixando a peça em estados diferentes.

   Aqui a operação é uma. As telas decidem o que dizer; esta função decide o
   que acontece.

   ── POR QUE ELA ESCREVE NO HISTÓRICO ──────────────────────────────────────
   Voltar uma peça para "roteiro em aprovação" depois de o cliente já ter
   aprovado é reabrir um assunto fechado. O status sozinho não dá conta disso:
   o painel do cliente pergunta ao HISTÓRICO se ele já aprovou, e uma aprovação
   de ontem silenciaria o roteiro reescrito hoje — a peça sumiria da lista dele
   com o status dizendo que era a vez dele.

   Então a volta deixa registro, como qualquer outra coisa que a equipe faz: um
   "ajustamos" no histórico do conteúdo. O painel volta a mostrar a peça, o
   cliente lê o que aconteceu, e a conferência não acusa contradição — porque
   não há nenhuma.
   ═══════════════════════════════════════════════════════════════════════════ */

const AVISO_DE_VOLTA = 'O roteiro voltou para aprovação — dê mais uma olhada.';

/**
 * Move uma peça de etapa, com tudo que isso implica.
 *
 * @param {object} c        o conteúdo
 * @param {?string} nome    a etapa de destino, ou null para tirar da esteira
 * @param {object} [opcoes]
 * @param {string} [opcoes.autor]  quem está mexendo, para o histórico
 * @returns {Promise<{novoStatus: ?string, reabriu: boolean, desfazer: function}>}
 */
export const moverParaEtapa = async (c, nome, { autor = '' } = {}) => {
    const antes = { etiquetas: [...(c.etiquetas || [])], status: c.status };
    const retornos = await store.retornos.listar();

    /* "O cliente aprovou o roteiro" é o que separa "aprovado" de "em
       desenvolvimento" nas etapas de produção. Vale a aprovação que está no
       histórico e não foi devolvida depois — ou o status que a peça já tinha,
       para quem marcou "roteiro aprovado" à mão. */
    const aprovouRoteiro = (aprovouNoHistorico(retornos, c.id) && !equipeDevolveu(retornos, c.id))
        || ['aprovado', 'pronto', 'publicado'].includes(c.status);
    const novoStatus = statusDaEtapa(nome, { aprovouRoteiro });

    await store.conteudos.salvar({
        ...c,
        etiquetas: comEtapa(c.etiquetas, nome),
        status: novoStatus,
    });

    /* Só quando há aprovação para reabrir. Sem ela, o cliente já vê a peça na
       lista dele pelo status, e uma entrada a mais seria ruído no histórico. */
    let reabertura = null;
    if (nome && etiquetaMeta(nome).etapa === 1) {
        if (aprovouNoHistorico(retornos, c.id) && !equipeDevolveu(retornos, c.id)) {
            reabertura = entradaDaEquipe({
                conteudoId: c.id, blocoId: null, tipo: 'ajustado',
                texto: AVISO_DE_VOLTA, autor,
            });
            // O id sai daqui, e não da resposta do banco: o desfazer precisa
            // saber o que apagar mesmo se a gravação devolver pouco.
            reabertura.id = crypto.randomUUID();
            await store.retornos.salvar(reabertura);
        }
    }

    return {
        novoStatus: novoStatus !== antes.status ? novoStatus : null,
        reabriu: !!reabertura,
        desfazer: async () => {
            if (reabertura) await store.retornos.excluir(reabertura.id);
            await store.conteudos.salvar({ ...c, ...antes });
        },
    };
};

/* ── LIBERAR PARA O CLIENTE ───────────────────────────────────────────────
   Liberar é tirar do rascunho, e o destino depende de haver texto: com
   roteiro escrito a peça vai para aprovação; sem ele, para "roteiro em
   desenvolvimento" — o cliente vê a data e o tema, e nada lhe é pedido. */
export const etapaAoLiberar = (temRoteiro) => temRoteiro ? ETAPA_APROVACAO : ETAPA_ESCRITA;

/* A frase que as telas mostram depois de mover. Uma só, para o clique, o
   arraste e o menu do cartão dizerem a mesma coisa. */
const PARA_O_CLIENTE = {
    rascunho: 'fora do link do cliente',
    desenvolvimento: 'o cliente vê "em produção"',
    em_revisao: 'o cliente vê "aguardando você"',
    aprovado: 'o cliente vê "aprovado"',
    pronto: 'o cliente vê "pronto para publicar"',
    publicado: 'o cliente vê "publicado"',
};
export const mensagemDeMovimento = (nome, novoStatus, reabriu) =>
    `Agora: ${nome || 'rascunho'}.`
    + (novoStatus && PARA_O_CLIENTE[novoStatus] ? ` Agora ${PARA_O_CLIENTE[novoStatus]}.` : '')
    + (reabriu ? ' A volta ficou registrada no histórico.' : '');
