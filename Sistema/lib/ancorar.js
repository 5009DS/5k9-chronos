/* ═══════════════════════════════════════════════════════════════════════════
   ANCORAGEM DE POPOVERS

   Coloca um elemento do <body> junto ao botão que o abriu. Vive aqui porque
   dois componentes precisam exatamente disto — o menu de ações e a central
   de notificações — e uma cópia em cada um acabaria divergindo no primeiro
   ajuste de folga ou de limite de tela.

   Por que no <body> e não dentro do card: .ds-card tem overflow:hidden para
   recortar o fio de luz nos cantos, e isso corta qualquer filho que
   ultrapasse a borda. z-index não resolve — overflow recorta em qualquer
   camada.
   ═══════════════════════════════════════════════════════════════════════════ */

const FOLGA = 6;
const MARGEM = 8;   // respiro mínimo até a borda da janela

/**
 * @returns {boolean} false quando a âncora saiu da tela (quem chama fecha)
 */
export const posicionarJunto = (el, ancora, { alinhar = 'direita' } = {}) => {
    const a = ancora.getBoundingClientRect();

    /* offsetWidth/Height, não getBoundingClientRect: o popover entra com
       uma animação de `scale`, e o rect devolve o tamanho JÁ ESCALADO. Ao
       posicionar com o valor encolhido, o cálculo errava a borda direita e
       o painel assentava alguns pixels fora do alinhamento com o botão
       assim que a animação terminava. offset* ignora transform. */
    const largura = el.offsetWidth;
    const altura  = el.offsetHeight;

    // Âncora rolou para fora: manter o popover flutuando sozinho seria pior
    // que fechá-lo, porque ele perde a relação com o que o originou.
    if (a.bottom < 0 || a.top > window.innerHeight) return false;

    const cabeAbaixo = a.bottom + FOLGA + altura <= window.innerHeight - MARGEM;
    el.style.top = cabeAbaixo
        ? `${a.bottom + FOLGA}px`
        : `${Math.max(MARGEM, a.top - FOLGA - altura)}px`;

    if (alinhar === 'esquerda') {
        el.style.left = `${Math.min(Math.max(MARGEM, a.left), window.innerWidth - MARGEM - largura)}px`;
    } else {
        const direita = Math.min(window.innerWidth - MARGEM, a.right);
        el.style.left = `${Math.max(MARGEM, direita - largura)}px`;
    }
    return true;
};

/**
 * Mantém o popover colado à âncora enquanto ela se move (scroll, resize).
 * Devolve a função que desliga tudo — quem abriu é responsável por chamá-la.
 */
export const seguirAncora = (el, ancora, aoPerder, opcoes) => {
    const atualizar = () => { if (!posicionarJunto(el, ancora, opcoes)) aoPerder(); };
    // captura: pega o scroll de qualquer contêiner interno, não só da janela
    document.addEventListener('scroll', atualizar, true);
    window.addEventListener('resize', atualizar);
    atualizar();
    return () => {
        document.removeEventListener('scroll', atualizar, true);
        window.removeEventListener('resize', atualizar);
    };
};
