import { renderTopnav } from './topnav.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE SHELL — esqueleto comum de todas as telas.
   Topnav + container + herói (título display, subtítulo, ações). Cada página
   preenche só o miolo.

     const { content } = renderShell(container, {
         path: '/cliente/abc',
         crumbs: [{ href: '/', label: 'Clientes' }],
         title: 'Instituto Dr. Tigre',
         subtitle: 'Cronograma e roteiros deste cliente',
         actions: `<button class="ds-btn ds-btn--primary">Novo conteúdo</button>`,
     });

   ── POR QUE EXISTE O RASTRO (crumbs) ──────────────────────────────────────
   Metade das telas deste sistema NÃO está na topnav: o cronograma de um
   cliente, o roteiro de um conteúdo, a importação. São telas às quais se
   chega por dentro — clicando num pedido de ajuste no painel, por exemplo — e
   sem um caminho de volta visível a pessoa fica numa página que a barra de
   cima não explica. O sublinhado em "Clientes" diz em que seção ela está, não
   como voltar.

   O rastro resolve isso mostrando a hierarquia inteira e tornando cada degrau
   clicável. É o único elemento de navegação do sistema que sabe de onde a
   pessoa veio.
   ═══════════════════════════════════════════════════════════════════════════ */

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const crumbsHTML = (crumbs, titulo) => {
    if (!crumbs?.length) return '';
    return `
        <nav class="sh-crumbs" aria-label="Você está em">
            ${crumbs.map(c => `
                <a class="sh-crumb" href="${esc(c.href)}">${esc(c.label)}</a>
                <span class="sh-crumb__sep" aria-hidden="true">/</span>
            `).join('')}
            <span class="sh-crumb sh-crumb--atual" aria-current="page">${esc(titulo)}</span>
        </nav>`;
};

export const renderShell = (container, { path, title, subtitle = '', actions = '', crumbs = null }) => {
    injectStyles();

    container.innerHTML = `
        <div class="sh-page animate-fade-in">
            <div class="sh-scroll">
                <div class="sh-wrap">
                    <div id="topnav-container"></div>

                    <header class="sh-hero">
                        <div class="sh-hero__text">
                            ${crumbsHTML(crumbs, title)}
                            <h1 class="ds-display">${title}</h1>
                            ${subtitle ? `<p class="sh-hero__sub">${subtitle}</p>` : ''}
                        </div>
                        ${actions ? `<div class="sh-hero__actions">${actions}</div>` : ''}
                    </header>

                    <div id="sh-content" class="sh-content"></div>
                </div>
            </div>
        </div>
    `;

    renderTopnav(document.getElementById('topnav-container'), path);
    return { content: document.getElementById('sh-content') };
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('pageshell-styles')) return;
    const style = document.createElement('style');
    style.id = 'pageshell-styles';
    style.textContent = `
        /* Vão único da grade bento: todo card-para-card usa este valor. */
        .sh-page { --bento-gap: var(--space-4); }

        /* #app é display:flex — sem flex:1 a página encolhe até o conteúdo
           em vez de ocupar a viewport. */
        .sh-page {
            flex: 1; min-width: 0;
            height: 100vh; overflow: hidden;
            background-color: var(--surface-base);
            font-family: var(--font-sans);
            color: var(--text-primary);
        }
        .sh-scroll { height: 100vh; overflow-y: auto; padding: var(--space-6) var(--space-8) var(--space-12); }
        .sh-wrap {
            max-width: 1320px; margin: 0 auto;
            display: flex; flex-direction: column; gap: var(--bento-gap);
        }

        /* Herói: o único ponto com respiro maior que --bento-gap. */
        .sh-hero {
            display: flex; align-items: flex-end; justify-content: space-between;
            gap: var(--space-8); flex-wrap: wrap;
            padding: var(--space-6) 0;
        }
        .sh-hero__sub { font-size: var(--text-body); color: var(--text-secondary); margin: var(--space-3) 0 0; }

        /* ── Rastro ─────────────────────────────────────────────────────────
           Fica ACIMA do título display, em corpo pequeno: é orientação, não
           conteúdo. O degrau atual não é link — um link para a página em que
           já se está é ruído que só se descobre depois de clicar. */
        .sh-crumbs {
            display: flex; align-items: center; gap: var(--space-2);
            flex-wrap: wrap; margin-bottom: var(--space-3);
            font-size: var(--text-xs);
        }
        .sh-crumb {
            color: var(--text-tertiary); text-decoration: none;
            /* 32px de alvo mínimo: no celular estes são os links mais úteis da
               tela e os menores de todos. */
            min-height: 32px; display: inline-flex; align-items: center;
            transition: color var(--dur-fast);
        }
        a.sh-crumb:hover { color: var(--accent); }
        .sh-crumb--atual {
            color: var(--text-secondary); font-weight: 600;
            max-width: 46ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sh-crumb__sep { color: var(--text-disabled); }
        .sh-hero__actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }

        .sh-content { display: flex; flex-direction: column; gap: var(--bento-gap); }

        .animate-fade-in { animation: sh-fade var(--dur-base) var(--ease-out); }
        @keyframes sh-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

        @media (max-width: 860px) {
            .sh-scroll { padding: var(--space-4) var(--space-5) var(--space-10); }
            .sh-hero { align-items: flex-start; padding: var(--space-5) 0; }
            .sh-hero__actions { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) { .animate-fade-in { animation: none; } }
    `;
    document.head.appendChild(style);
}
