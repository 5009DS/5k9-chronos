/* ═══════════════════════════════════════════════════════════════════════════
   TOAST — confirmação efêmera no canto inferior.
   Usado quando uma ação termina sem trocar de página (ex.: criar formulário
   pelo painel lateral da Home).
   ═══════════════════════════════════════════════════════════════════════════ */

export const toast = (message, action) => {
    injectStyles();

    document.querySelectorAll('.ts').forEach(t => t.remove());

    const el = document.createElement('div');
    el.className = 'ts';
    el.setAttribute('role', 'status');
    el.innerHTML = `
        <span class="ts__dot"></span>
        <span class="ts__msg">${message}</span>
        ${action ? `<a href="${action.href}" class="ts__action">${action.label}</a>` : ''}
        <button class="ts__close" aria-label="Fechar aviso"><i data-lucide="x"></i></button>
    `;
    document.body.appendChild(el);
    if (window.lucide) lucide.createIcons();

    const dismiss = () => {
        el.classList.remove('is-open');
        setTimeout(() => el.remove(), 260);
    };
    el.querySelector('.ts__close').addEventListener('click', dismiss);
    requestAnimationFrame(() => el.classList.add('is-open'));
    setTimeout(dismiss, 6000);
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        .ts {
            position: fixed; z-index: 600;
            left: 50%; bottom: var(--space-8);
            display: flex; align-items: center; gap: var(--space-3);
            padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
            background: var(--surface-2);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-pill);
            box-shadow: var(--shadow-lg);
            font-family: var(--font-sans); font-size: var(--text-sm);
            color: var(--text-primary);
            opacity: 0; transform: translate(-50%, 12px);
            transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out);
        }
        .ts.is-open { opacity: 1; transform: translate(-50%, 0); }
        .ts__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); flex-shrink: 0; }
        .ts__msg { white-space: nowrap; }
        .ts__action {
            font-weight: 600; color: var(--accent); text-decoration: none;
            padding: 0 var(--space-2); white-space: nowrap;
        }
        .ts__action:hover { text-decoration: underline; }
        .ts__close {
            width: 28px; height: 28px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            border: none; border-radius: 50%; background: none;
            color: var(--text-tertiary); cursor: pointer;
            transition: background-color var(--dur-fast), color var(--dur-fast);
        }
        .ts__close:hover { background: var(--surface-4); color: var(--text-primary); }
        .ts__close i, .ts__close svg { width: 14px; height: 14px; }

        @media (prefers-reduced-motion: reduce) { .ts { transition: none; } }
    `;
    document.head.appendChild(style);
}
