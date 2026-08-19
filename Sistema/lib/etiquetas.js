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
export const ETIQUETAS = [
    { nome: 'roteiro em aprovação', publica: true, icone: 'file-clock',    tom: 'espera',
      dica: 'A médica está lendo o roteiro.' },
    { nome: 'roteiro aprovado', publica: true,     icone: 'file-check',    tom: 'ok',
      dica: 'Liberado para gravar.' },
    { nome: 'a gravar', publica: true,             icone: 'video',         tom: 'atencao',
      dica: 'Ainda não foi para a câmera.' },
    /* Esta é a ÚNICA etiqueta do arquivo que DECIDE algo, e a exceção está
       registrada de propósito. O resto do vocabulário serve para desenhar;
       esta faz o cliente perder o botão de pedir ajuste.

       O motivo é físico, não organizacional: depois de gravado, mudar uma
       fala custa uma diária de estúdio. Deixar o botão ali é convidar para
       um pedido que a equipe vai ter de recusar — e recusar depois é pior
       que não oferecer.

       Está declarado como DADO, num lugar só, em vez de espalhado em
       condições pelas telas. E a trava de verdade mora no banco: a função
       pública recusa o pedido mesmo que alguém a chame direto
       (db/migracao-gravado.sql). */
    { nome: 'gravado', publica: true, travaAjuste: true, icone: 'circle-check',  tom: 'ok',
      dica: 'Material bruto na mão.' },
    { nome: 'em edição', publica: true,            icone: 'scissors',      tom: 'info',
      dica: 'Na mesa de corte.' },
    { nome: 'aguardando data', publica: true,      icone: 'calendar-clock', tom: 'espera',
      dica: 'Pronto, sem dia definido.' },
    { nome: 'aguardando material', publica: true,  icone: 'image',          tom: 'espera',
      dica: 'Falta algo que vem do cliente.' },
    { nome: 'refazer',              icone: 'rotate-ccw',     tom: 'risco',
      dica: 'Não ficou bom, volta para o começo.' },
];

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
