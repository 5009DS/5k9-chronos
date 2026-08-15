/* ═══════════════════════════════════════════════════════════════════════════
   AJUDANTES DE INTERFACE

   Existem por causa de um defeito específico: trocar um filtro chamava o
   draw() da página, que passa por renderShell() e reconstrói TUDO — topnav
   inclusive. O efeito era a tela inteira piscar e o scroll saltar para o
   topo a cada clique, como se estivesse recarregando. Pior: a topnav
   recriada refazia a consulta do contador de notificações, então um clique
   em "Completas" ia ao banco sem necessidade.

   Filtro não muda a página, muda o que a lista mostra. Estas funções fazem
   exatamente isso e nada mais.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Marca visualmente o botão escolhido dentro de um grupo de filtros.
 * @param {ParentNode} escopo   onde procurar os botões
 * @param {string} atributo     data-attr que identifica o grupo (ex.: 'filtro')
 * @param {string} valor        valor do escolhido
 */
export const marcarAtivo = (escopo, atributo, valor) => {
    escopo.querySelectorAll(`[data-${atributo}]`).forEach(b => {
        const ativo = b.dataset[atributo] === valor;
        b.classList.toggle('is-active', ativo);
        // aria-pressed em botão de alternância, aria-current em navegação —
        // só atualiza o que o elemento já usava, sem inventar semântica.
        if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(ativo));
        if (b.hasAttribute('aria-current')) b.setAttribute('aria-current', String(ativo));
    });
};

/**
 * Substitui o conteúdo com um amortecimento curto, em vez do corte seco.
 *
 * 90ms é deliberado: tempo de perceber que algo mudou, curto demais para
 * parecer espera. Acima de ~150ms a troca começa a passar impressão de
 * carregamento, que é justamente o que estamos tirando.
 */
export const trocarSuave = (el, preencher) => {
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        preencher();
        return;
    }
    el.classList.add('is-trocando');
    setTimeout(() => {
        preencher();
        // Dois frames: o primeiro aplica o estado inicial, o segundo dispara
        // a transição. Num só, o navegador agrupa tudo e não anima nada.
        requestAnimationFrame(() => requestAnimationFrame(() =>
            el.classList.remove('is-trocando')));
    }, 90);
};
