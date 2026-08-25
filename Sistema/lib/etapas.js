import { store } from '../store.js';
import { comEtapa, statusParaEtapa, etiquetasParaStatus, etiquetaMeta, etapaAtual, esteiraDe } from './etiquetas.js';
import { STATUS } from './pecas.js';
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
    const novoStatus = nome ? statusParaEtapa(c.status, nome) : null;

    await store.conteudos.salvar({
        ...c,
        etiquetas: comEtapa(c.etiquetas, nome),
        ...(novoStatus ? { status: novoStatus } : {}),
    });

    /* Só quando há aprovação para reabrir. Sem ela, o cliente já vê a peça na
       lista dele pelo status, e uma entrada a mais seria ruído no histórico. */
    let reabertura = null;
    if (nome && etiquetaMeta(nome).etapa === 1) {
        const retornos = await store.retornos.listar();
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
        novoStatus,
        reabriu: !!reabertura,
        desfazer: async () => {
            if (reabertura) await store.retornos.excluir(reabertura.id);
            await store.conteudos.salvar({ ...c, ...antes });
        },
    };
};

/**
 * Muda o status de uma peça, com a etapa acompanhando quando a leitura é única.
 *
 * O par (status, etapa) é a fonte crônica de contradição neste sistema: são
 * dois vocabulários sobre a mesma peça, e mexer num sem olhar o outro é o que
 * põe "rascunho" numa peça marcada como se estivesse com o cliente. As duas
 * direções agora existem — `moverParaEtapa` puxa o status, esta puxa a etapa —
 * e as duas moram aqui, para a terceira mudança não encontrar uma cópia velha.
 *
 * @returns {Promise<{mensagem: string, mexeuNaEtapa: boolean, desfazer: function}>}
 */
export const mudarStatus = async (c, status) => {
    const antes = { etiquetas: [...(c.etiquetas || [])], status: c.status };
    /* A esteira sai do formato da PEÇA, não de um parâmetro: quem chama não
       precisa saber que existem duas, e não há como esquecer de passar. */
    const novas = etiquetasParaStatus(status, c.etiquetas, esteiraDe(c.formato));

    await store.conteudos.salvar({ ...c, status, ...(novas ? { etiquetas: novas } : {}) });

    /* A mensagem diz as DUAS coisas quando as duas mudaram. Uma etiqueta que
       some sem aviso é indistinguível de um bug — e foi assim que este par
       ganhou fama de quebrado. */
    const nomeStatus = STATUS[status]?.rotulo || status;
    const etapaNova = novas ? etapaAtual(novas) : null;
    const mensagem = `Status: ${nomeStatus}.`
        + (!novas ? ''
            : etapaNova ? ` Etapa: ${etapaNova.nome}.`
            : ' Saiu da esteira de produção.');

    return {
        mensagem,
        mexeuNaEtapa: !!novas,
        desfazer: async () => { await store.conteudos.salvar({ ...c, ...antes }); },
    };
};
