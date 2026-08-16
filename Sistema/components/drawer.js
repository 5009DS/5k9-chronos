/* ═══════════════════════════════════════════════════════════════════════════
   DRAWER — painel lateral do design system.
   Primitiva genérica: recebe título, corpo e rodapé em HTML e devolve um
   painel deslizante à direita, com scrim, ESC, clique fora e trava de
   rolagem do fundo. Não sabe nada sobre formulários — quem usa é que monta
   o conteúdo (ver pages/home.js).
   ═══════════════════════════════════════════════════════════════════════════ */

let active = null;   // { root, onClose, prevFocus }

export const closeDrawer = () => {
    if (!active) return;
    const { root, prevFocus } = active;
    root.classList.remove('is-open');
    document.body.style.overflow = '';
    const done = () => root.remove();
    root.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);                     // rede de segurança
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    active = null;
};

/**
 * @param {object}   opts
 * @param {string}   opts.title      Título do painel
 * @param {string}   [opts.subtitle] Linha de apoio sob o título
 * @param {string}   opts.body       HTML do corpo (rolável)
 * @param {string}   [opts.footer]   HTML do rodapé fixo
 * @param {function} [opts.onMount]  Recebe o elemento do painel após montar
 */
export const openDrawer = ({ title, subtitle = '', body, footer = '', onMount }) => {
    closeDrawer();
    injectStyles();

    const prevFocus = document.activeElement;
    const root = document.createElement('div');
    root.className = 'dw';
    root.innerHTML = `
        <div class="dw__scrim" data-dw-close></div>
        <aside class="dw__panel" role="dialog" aria-modal="true" aria-label="${title}">
            <header class="dw__head">
                <div class="dw__head-text">
                    <h2 class="dw__title">${title}</h2>
                    ${subtitle ? `<span class="dw__subtitle">${subtitle}</span>` : ''}
                </div>
                <button class="ds-icon-btn dw__close" data-dw-close aria-label="Fechar painel">
                    <i data-lucide="x"></i>
                </button>
            </header>
            <div class="dw__body">${body}</div>
            ${footer ? `<footer class="dw__footer">${footer}</footer>` : ''}
        </aside>
    `;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';

    root.querySelectorAll('[data-dw-close]').forEach(el =>
        el.addEventListener('click', closeDrawer));

    const onKey = (e) => {
        if (e.key === 'Escape') { closeDrawer(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    /* O painel mora no <body>, fora do #app que o roteador reescreve —
       então sobrevive à troca de página e fica flutuando sobre uma tela que
       não é a dele (o "Nova pergunta" aparecia por cima de Formulários).
       Mesmo motivo pelo qual o menu de contexto fecha na navegação. */
    const onNavegar = () => { closeDrawer(); window.removeEventListener('popstate', onNavegar); };
    window.addEventListener('popstate', onNavegar);

    active = { root, prevFocus };

    // força reflow para a transição de entrada rodar
    requestAnimationFrame(() => {
        root.classList.add('is-open');
        const first = root.querySelector('input, textarea, select, button:not([data-dw-close])');
        if (first) first.focus();
    });

    if (window.lucide) lucide.createIcons();
    if (onMount) onMount(root.querySelector('.dw__panel'));

    return root.querySelector('.dw__panel');
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('drawer-styles')) return;
    const style = document.createElement('style');
    style.id = 'drawer-styles';
    style.textContent = `
        .dw { position: fixed; inset: 0; z-index: 500; font-family: var(--font-sans); }

        /* Scrim leve: escurece só o suficiente para dar foco ao painel, sem
           apagar o conteúdo que o vidro precisa refratar. */
        .dw__scrim {
            position: absolute; inset: 0;
            background: var(--surface-scrim);
            opacity: 0;
            transition: opacity var(--dur-base) var(--ease-out);
        }
        .dw.is-open .dw__scrim { opacity: 1; }

        /* ── Painel de vidro ────────────────────────────────────────────────
           O desfoque vem do backdrop-filter; a borda clara à esquerda e o
           brilho no topo (::before) são o que faz ler como vidro e não como
           painel translúcido chapado. */
        .dw__panel {
            position: absolute; top: 0; right: 0; bottom: 0;
            width: min(460px, 100vw);
            display: flex; flex-direction: column;
            background: var(--glass-bg);
            -webkit-backdrop-filter: var(--glass-blur);
            backdrop-filter: var(--glass-blur);
            border-left: 1px solid var(--glass-border);
            box-shadow: var(--shadow-lg);
            transform: translateX(100%);
            transition: transform var(--dur-slow) var(--ease-out);
        }
        .dw__panel::before {
            content: '';
            position: absolute; inset: 0;
            background: var(--glass-sheen);
            pointer-events: none;
        }
        .dw.is-open .dw__panel { transform: translateX(0); }

        /* Sem suporte a backdrop-filter, vidro vira superfície opaca —
           translúcido sem desfoque só deixa o texto ilegível. */
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .dw__panel { background: var(--surface-1); }
            .dw__panel::before { display: none; }
        }

        /* Conteúdo acima do brilho do ::before */
        .dw__head, .dw__body, .dw__footer { position: relative; z-index: 1; }

        .dw__head {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: var(--space-4);
            padding: var(--space-6);
            border-bottom: 1px solid var(--glass-border);
        }
        .dw__head-text { display: flex; flex-direction: column; gap: 2px; }
        .dw__title { font-size: var(--text-h3); font-weight: 600; letter-spacing: var(--tracking-tight); margin: 0; color: var(--text-primary); }
        .dw__subtitle { font-size: var(--text-sm); color: var(--text-tertiary); }

        .dw__body { flex: 1; overflow-y: auto; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-5); }

        /* flex-wrap é rede de segurança, não estética: o painel tem 460px e cai
           para a largura da tela no celular. Três botões com rótulo em
           português não cabem numa linha só, e sem a quebra o último era
           cortado pela borda — o botão principal, justamente. Quebrar é feio;
           sumir é pior. Quem tiver três ações deve pensar duas vezes antes de
           deixá-las todas aqui. */
        .dw__footer {
            display: flex; align-items: center; justify-content: flex-end;
            gap: var(--space-3); flex-wrap: wrap;
            padding: var(--space-4) var(--space-6);
            border-top: 1px solid var(--glass-border);
            background: rgba(255, 255, 255, 0.04);
        }

        /* Campos sobre vidro: superfície opaca viraria um bloco morto no meio
           da translucidez. Aqui eles são véus claros sobre o próprio vidro. */
        .dw__panel .ds-input,
        .dw__panel .nf-mode,
        .dw__panel .ds-hint {
            background: rgba(255, 255, 255, 0.06);
            border-color: var(--glass-border);
        }
        .dw__panel .ds-input:focus { border-color: var(--accent); }

        /* Compensação de contraste: sobre vidro, o fundo efetivo depende do
           que passa atrás. Texto de apoio sobe um degrau para não depender
           de sorte quando um card claro fica sob o painel. */
        .dw__panel .nf-field__label,
        .dw__panel .dw__subtitle { color: var(--text-primary); }
        .dw__panel .ds-hint { color: var(--text-secondary); }
        .dw__panel .ds-input::placeholder { color: var(--text-secondary); }

        @media (prefers-reduced-motion: reduce) {
            .dw__panel, .dw__scrim { transition: none; }
        }
    `;
    document.head.appendChild(style);
}
