import { etapaAtual, etapaEsperaCliente, ETAPAS, ETAPA_ESCRITA } from './etiquetas.js';
import { daEquipe } from './conversa.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSISTÊNCIA — onde o sistema se contradiz.

   Uma demanda aprovada pelo cliente aparecia como "em revisão" para a equipe,
   e o painel dela dizia "esperando você" numa peça que, ao abrir, mostrava-se
   aprovada. Três telas, três respostas para a mesma pergunta.

   A causa não foi uma delas estar errada: foi "aprovado" ter DUAS FONTES —
   a coluna `status` e o histórico de retornos — e cada tela consultar a que
   tinha à mão. Enquanto as duas concordam, ninguém percebe; quando divergem,
   cada tela mente de um jeito diferente.

   Este arquivo faz duas coisas, e a segunda é a que importa a longo prazo:

     1. `precisaDoCliente()` — UMA função para a pergunta "isto está esperando
        alguém?". Toda tela chama esta; nenhuma reimplementa.

     2. `auditar()` — a varredura que compara as fontes entre si e devolve o
        que não fecha, com o conserto ao lado. É o que transforma "encontrei um
        bug" em "o sistema me avisa antes de você encontrar".

   ── O QUE É PROBLEMA E O QUE É SÓ AVISO ───────────────────────────────────
   `grave` é contradição: duas fontes dizendo coisas diferentes sobre o mesmo
   fato, ou um estado impossível. `aviso` é falta — algo que ainda não foi
   preenchido e que pode estar apenas esperando a vez.

   Misturar os dois faria a lista encher de pendências normais e ninguém
   olharia as contradições, que são as que quebram tela.
   ═══════════════════════════════════════════════════════════════════════════ */

/** O cliente aprovou o conteúdo INTEIRO em algum momento? */
export const aprovouNoHistorico = (retornos, conteudoId) =>
    (retornos || []).some(r =>
        r.conteudo_id === conteudoId
        && r.tipo === 'aprovado'
        && !r.bloco_id
        && (r.origem || 'cliente') === 'cliente');

/** O último pedido de ajuste do cliente veio DEPOIS da última aprovação? */
export const pediuAjusteDepois = (retornos, conteudoId) => {
    const meus = (retornos || [])
        .filter(r => r.conteudo_id === conteudoId && !r.bloco_id
                  && (r.origem || 'cliente') === 'cliente')
        .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    return meus[meus.length - 1]?.tipo === 'ajuste';
};

/**
 * A equipe devolveu a bola ao cliente depois da última fala dele?
 *
 * Uma aprovação de ontem não responde a um roteiro reescrito hoje. Quando a
 * equipe põe a peça de volta em "roteiro em aprovação", fica um registro no
 * histórico — e é ele que reabre a conversa, não uma coluna nova.
 *
 * "Assunto encerrado" (tipo 'aprovado' vindo da equipe) fica de fora de
 * propósito: encerrar é fechar a conversa, não devolvê-la. É a mesma leitura
 * de estadoDaConversa() em lib/conversa.js, aplicada ao conteúdo inteiro.
 */
export const equipeDevolveu = (retornos, conteudoId) => {
    const doConteudo = (retornos || [])
        .filter(r => r.conteudo_id === conteudoId && !r.bloco_id)
        .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
    const ultimo = doConteudo[doConteudo.length - 1];
    return !!ultimo && daEquipe(ultimo) && ultimo.tipo !== 'aprovado';
};

/**
 * Está esperando o cliente?
 *
 * A pergunta que o painel dele, o cartão e a barra faziam cada um do seu
 * jeito. Agora é uma só, e ela olha as DUAS fontes: o status manda, e o
 * histórico corrige quando o status ficou para trás.
 */
export const precisaDoCliente = (c, retornos) => {
    if (!c || c.banco_em) return false;
    if (c.status === 'rascunho') return false;

    /* Liberada, e ainda assim não é a vez dele: o roteiro está sendo escrito.
       É para isso que "roteiro em desenvolvimento" existe — o cronograma sai
       sem esperar todos os textos, e a peça aparece na tela dele sem cobrar
       uma leitura que ainda não tem o que ler. */
    if (etapaAtual(c.etiquetas)?.nome === ETAPA_ESCRITA) return false;

    /* A peça PRONTA esperando o olho dele é a outra forma de "sua vez" — o
       vídeo montado ou a arte diagramada, conforme a esteira. A etapa é quem
       diz isso (esperaCliente, em lib/etiquetas.js); citar o nome de uma delas
       aqui deixaria a outra esteira de fora sem ninguém perceber. */
    if (etapaEsperaCliente(c.etiquetas)) return true;

    /* A equipe falou por último, e não foi para encerrar: o roteiro voltou
       para ele. Vem ANTES das duas leituras abaixo porque as duas olham só o
       que o cliente disse — e o que ele disse já foi respondido. */
    if (equipeDevolveu(retornos, c.id)) return c.status === 'em_revisao';

    /* O último movimento dele foi PEDIR mudança: a bola é nossa, não dele.
       Isto vale mesmo com status "em revisão", e foi o segundo caso que a
       varredura encontrou — a peça aparecia na lista dele logo depois de ele
       ter pedido o ajuste, como se faltasse algo da parte dele. */
    if (pediuAjusteDepois(retornos, c.id)) return false;

    /* E aqui o caso que originou tudo: status "em revisão" numa peça que ele
       já aprovou e sobre a qual não pediu mais nada não espera ninguém. O
       status ficou para trás — o histórico é quem sabe. */
    if (aprovouNoHistorico(retornos, c.id)) return false;

    return c.status === 'em_revisao';
};

/* ═══════════════════════════════════════════════════════════════════════════
   A VARREDURA
   ═══════════════════════════════════════════════════════════════════════════ */

const problema = (nivel, id, conteudo, titulo, texto, conserto = null) =>
    ({ nivel, id, conteudo, titulo, texto, conserto });

/**
 * @param {object[]} conteudos
 * @param {object[]} blocos
 * @param {object[]} retornos
 * @returns {object[]} problemas, os graves primeiro
 */
export const auditar = (conteudos, blocos, retornos) => {
    const achados = [];
    const temRoteiro = new Set((blocos || []).map(b => b.conteudo_id));

    for (const c of conteudos || []) {
        const etapa = etapaAtual(c.etiquetas);
        const aprovou = aprovouNoHistorico(retornos, c.id);
        const pediuDepois = pediuAjusteDepois(retornos, c.id);
        const devolveu = equipeDevolveu(retornos, c.id);
        const etapasNaPeca = (c.etiquetas || [])
            .filter(e => ETAPAS.some(x => x.nome.toLowerCase() === String(e).toLowerCase()));

        /* ── Contradições ──────────────────────────────────────────────── */

        /* O bug que originou este arquivo. `devolveu` fora: se a equipe
           reabriu o roteiro para aprovação, "em revisão" é o estado certo — e
           acusar contradição aqui faria o sistema apontar a própria ação. */
        if (c.status === 'em_revisao' && aprovou && !pediuDepois && !devolveu) {
            achados.push(problema('grave', 'aprovacao-perdida', c,
                'Aprovado pelo cliente, mas marcado como em revisão',
                'O histórico tem a aprovação dele e o status ficou para trás. A tela dele mostra '
              + 'aprovado; a nossa, esperando resposta.',
                { rotulo: 'Marcar como aprovado', campo: 'status', valor: 'aprovado' }));
        }

        if (c.status === 'aprovado' && pediuDepois) {
            achados.push(problema('grave', 'ajuste-ignorado', c,
                'Marcado como aprovado depois de um pedido de ajuste',
                'O último retorno dele foi um pedido de mudança, e o conteúdo está como aprovado.',
                { rotulo: 'Marcar como ajuste', campo: 'status', valor: 'ajuste' }));
        }

        if (c.status === 'aprovado' && !aprovou) {
            achados.push(problema('grave', 'aprovacao-sem-dono', c,
                'Aprovado sem aprovação no histórico',
                'Alguém da equipe marcou como aprovado à mão. Não é erro se foi combinado por fora — '
              + 'mas o cliente não vai encontrar registro disso.'));
        }

        if (etapasNaPeca.length > 1) {
            achados.push(problema('grave', 'duas-etapas', c,
                'Duas etapas de produção ao mesmo tempo',
                `A peça está marcada como ${etapasNaPeca.join(' e ')}. Só uma pode valer.`,
                { rotulo: `Manter só ${etapa?.nome}`, campo: 'etiquetas', valor: null }));
        }

        // Rascunho com o roteiro sendo escrito é o começo normal de tudo.
        if (c.status === 'rascunho' && etapa && etapa.nome !== ETAPA_ESCRITA) {
            achados.push(problema('grave', 'rascunho-em-producao', c,
                'Em produção, mas invisível para o cliente',
                `Está marcado como ${etapa.nome} e o status é rascunho — ele não vê esta peça.`,
                { rotulo: 'Liberar para o cliente', campo: 'status', valor: 'em_revisao' }));
        }

        if (c.banco_em && etapa) {
            achados.push(problema('grave', 'banco-em-producao', c,
                'No banco de temas com etapa de produção',
                `Guardado fora do cronograma e marcado como ${etapa.nome}. A produção não vai achá-lo.`));
        }

        /* O caso relatado: produção andou e a conversa com o cliente ficou
           para trás. Na tela dele, uma peça já gravada pedindo aprovação de
           roteiro. */
        if (etapa && etapa.etapa >= 3 && ['rascunho', 'em_revisao'].includes(c.status)) {
            achados.push(problema('grave', 'etapa-sem-status', c,
                `Já está em "${etapa.nome}" e ainda consta como ${c.status === 'rascunho' ? 'rascunho' : 'em revisão'}`,
                'A produção avançou e o status ficou para trás. O cliente vê uma peça já gravada '
              + 'pedindo aprovação de roteiro.',
                { rotulo: 'Marcar como aprovado', campo: 'status', valor: 'aprovado' }));
        }

        /* O espelho do caso acima: a etapa diz que o roteiro está com o
           cliente e o status diz que ele já respondeu.

           O conserto mexe na ETAPA, não no status, e a razão importa: quando a
           volta para aprovação é feita pelo sistema, ela reabre a conversa e
           deixa registro (lib/etapas.js). Aqui não há registro nenhum — o que
           existe é uma aprovação no histórico e uma etiqueta que ficou para
           trás. Demote o status e a varredura acusaria, com toda razão, o
           problema contrário na volta seguinte; um conserto que cria a próxima
           contradição não é conserto. */
        if (etapa && etapa.etapa === 1 && ['aprovado', 'publicado'].includes(c.status)) {
            const destino = c.status === 'publicado' ? 'publicado' : 'a gravar';
            achados.push(problema('grave', 'aprovacao-sem-volta', c,
                'Na etapa de aprovação e já marcado como aprovado',
                'A etapa diz que o roteiro está com o cliente e o status diz que ele já respondeu. '
              + 'A tela dele mostra o selo de aprovado onde deveria estar o botão de aprovar.',
                { rotulo: `Marcar como ${destino}`, campo: 'etiquetas', valor: destino }));
        }

        if (etapa && etapa.etapa >= 4 && c.status === 'ajuste') {
            achados.push(problema('grave', 'gravado-com-ajuste', c,
                `Gravado com um pedido de ajuste em aberto`,
                'A peça foi gravada e o cliente tinha pedido mudança no roteiro. Vale conferir se '
              + 'o pedido entrou na gravação antes de encerrar.'));
        }

        /* Sem roteiro e esperando aprovação é contradição — MENOS quando a
           etiqueta diz, na cara do cliente, que o texto está sendo escrito.
           Essa é a peça liberada de propósito antes do roteiro existir. */
        if (c.status === 'em_revisao' && !temRoteiro.has(c.id) && etapa?.nome !== ETAPA_ESCRITA) {
            achados.push(problema('grave', 'revisao-sem-roteiro', c,
                'Esperando aprovação sem roteiro escrito',
                'O cliente abre e encontra "roteiro ainda não escrito".',
                { rotulo: 'Voltar para rascunho', campo: 'status', valor: 'rascunho' }));
        }

        /* ── Faltas ────────────────────────────────────────────────────── */

        if (!c.fase) {
            achados.push(problema('aviso', 'sem-fase', c, 'Sem fase do funil',
                'O cliente não vê o papel desta peça, e a leitura estratégica não aparece.'));
        }
        if (!c.objetivo) {
            achados.push(problema('aviso', 'sem-objetivo', c, 'Sem objetivo',
                'Sem ele, o cartão que explica o conteúdo para o cliente fica pela metade.'));
        }
        /* O mesmo perdão da regra grave, pelo mesmo motivo: com a etiqueta de
           desenvolvimento, abrir e não achar texto é o combinado — a tela dele
           diz isso com todas as letras. Sem esta linha, toda peça liberada
           antes do roteiro viraria um aviso, e a conferência encheria de
           pendência normal justamente para quem usa o recurso direito. */
        if (c.status !== 'rascunho' && !c.banco_em && !temRoteiro.has(c.id)
            && etapa?.nome !== ETAPA_ESCRITA) {
            achados.push(problema('aviso', 'sem-roteiro', c, 'Publicado ao cliente sem roteiro',
                'Ele consegue abrir e não há texto para ler.'));
        }
    }

    const peso = { grave: 0, aviso: 1 };
    return achados.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
};

/** Resumo para o topo da tela. */
export const resumoAuditoria = (achados) => ({
    graves: achados.filter(a => a.nivel === 'grave').length,
    avisos: achados.filter(a => a.nivel === 'aviso').length,
});
