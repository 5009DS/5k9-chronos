/* ═══════════════════════════════════════════════════════════════════════════
   MENU SUSPENSO — ancorado no <body>, não no card.

   POR QUE ASSIM
   O menu de ações da lista de formulários era filho de .ds-card, que tem
   overflow:hidden (necessário para o fio de luz e o brilho recortarem nos
   cantos arredondados). Resultado: o menu abria e era cortado pela borda do
   card — "uma caixa dentro de outra caixa".

   Aumentar o z-index não resolve: overflow recorta independente de camada.
   Tirar o overflow do card quebraria a decoração de todos os outros. Então o
   menu passa a ser renderizado no <body> e posicionado com position:fixed,
   alinhado ao botão que o abriu. Fora do card, nada o corta.

   Reposiciona no scroll e no resize, e vira para cima quando não cabe abaixo.
   ═══════════════════════════════════════════════════════════════════════════ */

import { seguirAncora } from '../lib/ancorar.js';

let aberto = null;   // { el, ancora, soltar }

export const fecharMenu = () => {
    if (!aberto) return;
    aberto.soltar?.();
    aberto.el.remove();
    aberto.ancora?.setAttribute('aria-expanded', 'false');
    aberto = null;
};

/**
 * @param {HTMLElement} ancora  botão que abriu
 * @param {Array} itens  [{ label, icon, href?, onClick?, variante?, separadorAntes? }]
 */
export const abrirMenu = (ancora, itens) => {
    const jaEra = aberto && aberto.ancora === ancora;
    fecharMenu();
    if (jaEra) return;   // clicar de novo no mesmo botão fecha

    const el = document.createElement('div');
    el.className = 'ds-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = itens.map(it => {
        const cls = `ds-menu__item ${it.variante ? `ds-menu__item--${it.variante}` : ''}`;
        const corpo = `<i data-lucide="${it.icon}"></i> ${it.label}`;
        return (it.separadorAntes ? '<hr class="ds-divider ds-menu__sep">' : '')
            + (it.href
                ? `<a class="${cls}" role="menuitem" href="${it.href}"
                     ${it.externo ? 'target="_blank" rel="noopener"' : ''}>${corpo}</a>`
                : `<button class="${cls}" role="menuitem" data-acao="${it.id}">${corpo}</button>`);
    }).join('');

    document.body.appendChild(el);
    ancora.setAttribute('aria-expanded', 'true');
    aberto = { el, ancora };

    el.querySelectorAll('[data-acao]').forEach(b =>
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = itens.find(i => i.id === b.dataset.acao);
            fecharMenu();
            item?.onClick?.();
        }));
    el.addEventListener('click', (e) => e.stopPropagation());

    if (window.lucide) lucide.createIcons();
    aberto.soltar = seguirAncora(el, ancora, fecharMenu);
    requestAnimationFrame(() => el.classList.add('is-aberto'));
};

/* Fecha ao clicar fora, no Esc e ao trocar de rota — um listener só, para a
   vida toda. O de rota importa: como o menu vive no <body> e não no #app,
   ele SOBREVIVE ao innerHTML do router e ficava flutuando sobre a página
   nova. Era `hashchange`, que parou de disparar quando as URLs deixaram de
   usar # e passaram para a History API — o menu voltou a sobreviver à
   navegação sem que ninguém notasse. */
document.addEventListener('click', () => fecharMenu());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
window.addEventListener('popstate', () => fecharMenu());
