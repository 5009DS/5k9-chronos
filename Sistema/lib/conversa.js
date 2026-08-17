/* ═══════════════════════════════════════════════════════════════════════════
   CONVERSA — o que já foi dito sobre uma fala, e de quem é a vez.

   Uma conversa é a lista de entradas de `vz_retornos` que apontam para o mesmo
   bloco, em ordem cronológica. As que não apontam para bloco nenhum formam a
   conversa do conteúdo inteiro.

   ── O ESTADO É DERIVADO, E ISSO É O PONTO ─────────────────────────────────
   Não existe coluna dizendo se o assunto foi resolvido. O estado é a ÚLTIMA
   entrada:

       cliente pediu por último    → PENDENTE   (a bola está com a equipe)
       equipe falou por último     → RESPONDIDO (a bola está com o cliente)
       alguém aprovou por último   → FECHADO

   Uma coluna `resolvido` seria uma segunda verdade sobre o mesmo fato. Bastava
   um comentário novo gravado sem atualizar a flag para a tela dizer "resolvido"
   embaixo de uma reclamação de ontem. Derivando, isso é impossível: a leitura
   é o próprio histórico.

   ── POR QUE UM MÓDULO SÓ PARA ISTO ────────────────────────────────────────
   As duas telas precisam da MESMA leitura. Se a equipe vê "pendente" e o
   cliente vê "resolvido" sobre a mesma fala, o sistema perdeu a única coisa
   que ele tinha para oferecer — um lugar onde os dois lados olham o mesmo
   estado. Uma implementação em cada página divergiria na segunda pressa.

   Tudo aqui é função pura: recebe registros, devolve leitura. Nada consulta o
   store.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Os cinco tipos de entrada. `origem` diz o lado; `tipo` diz o ato.

   'resposta' existe separado de 'ajustado' porque "mudamos o texto" e "não
   vamos mudar, e aqui está o motivo" são desfechos diferentes, e o segundo é
   frequente demais para ficar sem palavra própria. Colapsar os dois ensinaria
   a equipe a marcar como ajustado o que não foi ajustado. */
export const ATOS = {
    ajuste:   { origem: 'cliente', rotulo: 'Pediu ajuste',    icone: 'message-circle',      tom: 'atencao' },
    ajustado: { origem: 'equipe',  rotulo: 'Ajustamos',       icone: 'pencil-line',         tom: 'ok' },
    resposta: { origem: 'equipe',  rotulo: 'A equipe respondeu', icone: 'message-square-reply', tom: 'info' },
    aprovado: { origem: null,      rotulo: 'Aprovado',        icone: 'circle-check',        tom: 'ok' },
};

export const ato = (r) => ATOS[r?.tipo] || ATOS.resposta;

/** A entrada veio da equipe? Registros antigos não têm `origem` — são do cliente. */
export const daEquipe = (r) => (r?.origem || 'cliente') === 'equipe';

export const ESTADOS = {
    pendente: {
        rotulo: 'Aguardando a equipe', curto: 'pendente',
        icone: 'message-circle-warning', tom: 'atencao',
        // O que cada lado lê. A mesma conversa, ditas para quem tem o dever de
        // agir e para quem está esperando — dizer "pendente" ao cliente o
        // deixaria achando que a bola é dele.
        cliente: 'A equipe está vendo isto',
    },
    respondido: {
        rotulo: 'Respondido', curto: 'respondido',
        icone: 'message-square-reply', tom: 'info',
        cliente: 'A equipe respondeu — veja se ficou bom',
    },
    fechado: {
        rotulo: 'Assunto encerrado', curto: 'encerrado',
        icone: 'circle-check', tom: 'ok',
        cliente: 'Assunto encerrado',
    },
};

export const estadoMeta = (id) => ESTADOS[id] || ESTADOS.pendente;

/** Do mais antigo para o mais novo — a ordem em que a conversa aconteceu. */
export const emOrdem = (entradas) =>
    [...(entradas || [])].sort((a, b) =>
        String(a.criado_em).localeCompare(String(b.criado_em)));

/**
 * De quem é a vez.
 *
 * @param {object[]} entradas  as entradas de UMA conversa, em qualquer ordem
 * @returns {'pendente'|'respondido'|'fechado'|null}  null quando não há conversa
 */
export const estadoDaConversa = (entradas) => {
    const lista = emOrdem(entradas);
    if (!lista.length) return null;

    const ultima = lista[lista.length - 1];
    if (ultima.tipo === 'aprovado') return 'fechado';
    return daEquipe(ultima) ? 'respondido' : 'pendente';
};

/** A equipe chegou a mexer no texto por causa desta conversa? */
export const foiEditado = (entradas) =>
    (entradas || []).some(r => r.tipo === 'ajustado');

/**
 * As conversas de um conteúdo, agrupadas.
 *
 * @returns {{
 *   porBloco: Map<string, {entradas: object[], estado: string, editado: boolean}>,
 *   doConteudo: {entradas: object[], estado: string|null},
 *   pendentes: number,   conversas esperando a equipe
 *   respondidas: number, conversas esperando o cliente
 * }}
 */
export const conversas = (historico) => {
    const porBloco = new Map();
    const soltas = [];

    for (const r of historico || []) {
        if (!r.bloco_id) { soltas.push(r); continue; }
        if (!porBloco.has(r.bloco_id)) porBloco.set(r.bloco_id, []);
        porBloco.get(r.bloco_id).push(r);
    }

    let pendentes = 0;
    let respondidas = 0;

    for (const [id, entradas] of porBloco) {
        const ordenadas = emOrdem(entradas);
        const estado = estadoDaConversa(ordenadas);
        if (estado === 'pendente') pendentes++;
        if (estado === 'respondido') respondidas++;
        porBloco.set(id, { entradas: ordenadas, estado, editado: foiEditado(ordenadas) });
    }

    const doConteudo = { entradas: emOrdem(soltas), estado: estadoDaConversa(soltas) };
    if (doConteudo.estado === 'pendente') pendentes++;
    if (doConteudo.estado === 'respondido') respondidas++;

    return { porBloco, doConteudo, pendentes, respondidas };
};

/**
 * O texto que o bloco tinha quando a conversa começou.
 *
 * Cada entrada congela em `trecho` o texto vigente naquele instante — a do
 * cliente porque a equipe vai reescrever a fala, a da equipe porque é o
 * "depois". A primeira entrada que tem trecho é o começo da história.
 *
 * Devolve null quando o texto nunca mudou: mostrar "antes: X / depois: X" é
 * ruído com cara de informação.
 */
export const textoOriginal = (entradas, textoAtual) => {
    const primeiro = emOrdem(entradas).find(r => r.trecho)?.trecho || null;
    if (!primeiro || primeiro === (textoAtual || '')) return null;
    return primeiro;
};

/**
 * O que a equipe fez desde a última visita do cliente.
 *
 * `desde` é ISO, e vem do navegador dele. Sem `desde` — primeira visita, ou
 * navegador que apagou o dado — devolve lista vazia, e não a lista inteira:
 * marcar tudo como "novidade" na primeira visita é a maneira mais rápida de
 * ensinar que o destaque não significa nada.
 */
export const novidadesPara = (historico, desde) => {
    if (!desde) return [];
    return (historico || []).filter(r =>
        daEquipe(r) && String(r.criado_em) > String(desde));
};

/**
 * Uma entrada da equipe, pronta para gravar.
 *
 * O `trecho` é o texto do bloco AGORA — depois da edição, quando o ato é
 * 'ajustado'. É o que transforma o histórico em antes-e-depois legível meses
 * depois, sem depender de o bloco ainda existir com aquele texto.
 */
export const entradaDaEquipe = ({ conteudoId, blocoId = null, tipo, texto, autor, trecho = null }) => ({
    conteudo_id: conteudoId,
    bloco_id: blocoId,
    tipo,
    texto: (texto || '').trim() || null,
    autor: (autor || '').trim() || null,
    trecho: (trecho || '').trim() || null,
    origem: 'equipe',
    criado_em: new Date().toISOString(),
});
