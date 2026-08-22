import { esc, semAcento } from './formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ETIQUETAS — o vocabulário de produção, e tudo o mais.

   Etiqueta continua sendo texto livre: o sistema não decide nada com base
   nela, nada quebra quando ela muda e ninguém precisa de código para inventar
   uma nova. Isso não mudou e é o ponto todo do recurso.

   O que este arquivo acrescenta é VISUAL. Um punhado de etiquetas se repete em
   todo cliente — "a gravar", "gravado", "roteiro em aprovação" — e elas
   merecem ser reconhecidas de longe, com ícone e cor, como o chip de status já
   é. Um cartão com quatro etiquetas cinzas idênticas obriga a ler as quatro
   para achar a que interessa.

   ── A LINHA QUE NÃO SE ATRAVESSA ──────────────────────────────────────────
   Este mapa serve para DESENHAR, nunca para decidir. Nenhuma regra do sistema
   pergunta se um conteúdo está "gravado" — se um dia perguntar, isso vira
   status, com migração e tela, e não uma entrada aqui. Etiqueta fora da lista
   funciona igual, só sai com o desenho neutro.

   ── A ORDEM É O FLUXO ─────────────────────────────────────────────────────
   A lista está na ordem em que as coisas acontecem: escrever, aprovar, gravar,
   editar, publicar. É essa ordem que aparece no formulário, e é ela que
   transforma uma lista de palavras numa explicação do processo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* `publica` decide se o CLIENTE vê. Sete das oito dizem em que pé está a
   produção — é informação que ele quer e que hoje ele pede por WhatsApp.
   "refazer" fica de fora: é crítica nossa ao nosso próprio trabalho, e o
   cliente lendo isso no cronograma dele não ajuda ninguém.

   Etiqueta que a equipe inventar NUNCA sai. Não por desconfiança do texto,
   mas porque o campo livre é exatamente onde mora o recado interno — e um
   recurso que às vezes vaza é pior que um que nunca vaza.

   O recorte de verdade acontece no banco (db/migracao-etiquetas-cliente.sql).
   Esta marcação existe para a interna e a pública concordarem; se as duas
   discordarem, quem manda é o banco, e é ele que precisa ser corrigido. */
/* ── A ESTEIRA ────────────────────────────────────────────────────────────
   Sete destas etiquetas são ETAPAS: uma peça está em uma delas de cada vez, e
   avançar significa sair da anterior. Marcar "gravado" tira "a gravar" e
   "roteiro aprovado" sozinho — antes elas se acumulavam e o cartão passava a
   dizer três coisas contraditórias ao mesmo tempo.

   `etapa` é a ordem no caminho feliz e `proxima` diz para onde o botão de
   avançar leva. "revisão" tem etapa mas volta para "em edição": é o desvio de
   quando a gravação não passa, e o caminho de volta é o corte, não a câmera.

   As que NÃO têm `etapa` são paralelas — "aguardando data" e "aguardando
   material" convivem com qualquer etapa, porque descrevem uma pendência, não
   um estágio. Marcar uma delas não tira nada.

   Continua valendo o que o resto do arquivo diz: etiqueta é texto livre, e
   qualquer palavra que a equipe inventar funciona, fora da esteira e com o
   desenho neutro. */
export const ETIQUETAS = [
    { nome: 'roteiro em aprovação', publica: true, etapa: 1, proxima: 'roteiro aprovado',
      icone: 'file-clock', tom: 'espera',
      dica: 'A médica está lendo o roteiro.' },

    { nome: 'roteiro aprovado', publica: true, etapa: 2, proxima: 'a gravar',
      icone: 'file-check', tom: 'ok',
      dica: 'Liberado para gravar.' },

    { nome: 'a gravar', publica: true, etapa: 3, proxima: 'gravado',
      icone: 'video', tom: 'atencao',
      dica: 'Ainda não foi para a câmera.' },

    /* Esta é a ÚNICA etiqueta que DECIDE algo, e a exceção está registrada de
       propósito: ela faz o cliente perder o botão de pedir ajuste.

       O motivo é físico, não organizacional — depois de gravado, mudar uma
       fala custa uma diária de estúdio. Deixar o botão ali é convidar para um
       pedido que a equipe vai ter de recusar, e recusar depois é pior que não
       oferecer. A trava de verdade mora no banco (db/migracao-gravado.sql). */
    { nome: 'gravado', publica: true, travaAjuste: true, etapa: 4, proxima: 'em edição',
      icone: 'circle-check', tom: 'ok',
      dica: 'Material bruto na mão.' },

    { nome: 'em edição', publica: true, etapa: 5, proxima: 'gravação aguardando aprovação',
      icone: 'scissors', tom: 'info',
      dica: 'Na mesa de corte.' },

    { nome: 'gravação aguardando aprovação', publica: true, etapa: 6, proxima: 'publicado',
      icone: 'monitor-play', tom: 'espera',
      dica: 'O vídeo pronto está com a médica.' },

    /* Fora do caminho feliz: some quando a peça avança, e leva de volta ao
       corte porque é lá que o problema se resolve. */
    { nome: 'revisão', publica: false, etapa: 6.5, proxima: 'em edição',
      icone: 'rotate-ccw', tom: 'risco',
      dica: 'A gravação não passou — volta para o corte.' },

    { nome: 'publicado', publica: true, etapa: 7,
      icone: 'send', tom: 'ok',
      dica: 'No ar.' },

    /* Paralelas: descrevem pendência, não estágio, e convivem com qualquer
       etapa da esteira. */
    { nome: 'aguardando data', publica: true, icone: 'calendar-clock', tom: 'espera',
      dica: 'Pronto, sem dia definido.' },

    { nome: 'aguardando material', publica: true, icone: 'image', tom: 'espera',
      dica: 'Falta algo que vem do cliente.' },
];

/** As etapas da esteira, na ordem do caminho feliz. */
export const ETAPAS = ETIQUETAS.filter(e => e.etapa).sort((a, b) => a.etapa - b.etapa);

/* Comparação sem acento, sem caixa e sem pontuação: "A Gravar", "a gravar" e
   "à gravar" são a mesma etiqueta para os olhos de quem lê o cartão, e seria
   estranho que só uma delas ganhasse ícone. */
const chave = (s) => semAcento(s || '').replace(/[^a-z0-9]/g, '');

const MAPA = new Map(ETIQUETAS.map(e => [chave(e.nome), e]));

/** O desenho de uma etiqueta. Devolve o neutro quando ela é da casa. */
export const etiquetaMeta = (nome) =>
    MAPA.get(chave(nome)) || { nome, icone: 'tag', tom: 'neutro', dica: '' };

/** As que o cliente pode ver. Desconhecida some — é a regra, não a exceção. */
export const etiquetasPublicas = (lista) =>
    (lista || []).filter(nome => etiquetaMeta(nome).publica);

/** O conteúdo já foi gravado? Então o roteiro dele virou passado. */
export const ajusteTravado = (lista) =>
    (lista || []).some(nome => etiquetaMeta(nome).travaAjuste);

/* ── O QUE A APROVAÇÃO DO CLIENTE MUDA ────────────────────────────────────
   Aprovar o roteiro põe a peça na etapa "a gravar" — que é a etapa seguinte
   e, por estar depois de "roteiro aprovado" na esteira, já diz que o roteiro
   passou. Guardar as duas seria dizer a mesma coisa em duplicado, e foi
   exatamente isso que empilhou etiquetas contraditórias no cartão.

   Que o roteiro foi aprovado não se perde: está no `status` do conteúdo, que
   é onde a conversa com o cliente mora.

   Peça já GRAVADA fica intocada — aprovar um assunto pendente depois da
   gravação é legítimo, e voltar para "a gravar" mandaria gravar de novo o que
   está pronto.

   A regra decide no banco (db/migracao-esteira.sql); aqui ela existe para o
   adaptador local responder igual. */
export const etiquetasAoAprovar = (lista) => {
    const atuais = lista || [];
    if (ajusteTravado(atuais)) return atuais;
    return comEtapa(atuais, 'a gravar');
};

/** Em que etapa a peça está, ou null quando ainda não entrou na esteira. */
export const etapaAtual = (lista) => {
    const achadas = (lista || [])
        .map(etiquetaMeta)
        .filter(m => m.etapa)
        .sort((a, b) => b.etapa - a.etapa);
    return achadas[0] || null;
};

/**
 * A lista depois de marcar uma etapa: a nova entra, as OUTRAS etapas saem, e
 * as paralelas ficam. Uma peça não está gravada e a gravar ao mesmo tempo.
 */
export const comEtapa = (lista, nome) => {
    const paralelas = (lista || []).filter(e => !etiquetaMeta(e).etapa);
    return nome ? [...paralelas, nome] : paralelas;
};

/** A próxima etapa do caminho feliz. Sem etapa nenhuma, o começo. */
export const proximaEtapa = (lista) => {
    const atual = etapaAtual(lista);
    if (!atual) return ETAPAS[0]?.nome || null;
    return atual.proxima || null;
};

export const chipEtiqueta = (nome) => {
    const m = etiquetaMeta(nome);
    return `<span class="vz-etiqueta vz-etiqueta--${esc(m.tom)}"${m.dica ? ` title="${esc(m.dica)}"` : ''}>
        <i data-lucide="${esc(m.icone)}"></i>${esc(nome)}
    </span>`;
};

/* Estilos das etiquetas. Vivem aqui, e não no CSS de uma página, porque o chip
   aparece no cronograma, no quadro e no painel de edição — três arquivos que
   divergiriam no primeiro ajuste de cor. */
export const injectEstilosEtiqueta = () => {
    if (document.getElementById('etiquetas-styles')) return;
    const style = document.createElement('style');
    style.id = 'etiquetas-styles';
    style.textContent = `
        .vz-etiqueta {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 3px 10px; border-radius: var(--radius-pill);
            border: 1px solid transparent;
            font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
        }
        .vz-etiqueta i, .vz-etiqueta svg { width: 13px; height: 13px; }
        /* Os tons dizem de quem é a vez, não o que é a etiqueta: amarelo é
           trabalho nosso parado, azul é trabalho andando, verde é etapa
           vencida, roxo é espera por terceiro, vermelho é problema. */
        .vz-etiqueta--atencao { background: var(--warning-muted); color: var(--warning); }
        .vz-etiqueta--info    { background: color-mix(in oklch, var(--info) 14%, transparent); color: var(--info); }
        .vz-etiqueta--ok      { background: var(--success-muted); color: var(--success); }
        .vz-etiqueta--espera  { background: var(--accent-muted);  color: var(--accent); }
        .vz-etiqueta--risco   { background: var(--danger-muted);  color: var(--danger); }
        .vz-etiqueta--neutro  { background: var(--surface-3); color: var(--text-secondary); border-color: var(--border-subtle); }

        /* Os botões do formulário. Mesmo desenho do chip, mais o estado de
           marcado — o que se vê ao escolher é o que vai aparecer no cartão. */
        .vz-etiqueta--botao { cursor: pointer; opacity: 0.5; font-family: var(--font-sans); }
        .vz-etiqueta--botao:hover { opacity: 0.85; }
        .vz-etiqueta--botao.is-marcada { opacity: 1; box-shadow: inset 0 0 0 1px currentColor; }
    `;
    document.head.appendChild(style);
};
