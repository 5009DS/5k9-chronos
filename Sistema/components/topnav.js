import { navegar } from '../lib/rotas.js';
import { store } from '../store.js';
import { theme } from '../theme.js';
import { renderTrocador } from './trocador.js';

/* ═══════════════════════════════════════════════════════════════════════════
   TOPNAV — a mesma barra do 5K9 Forms e do Gestor, com os destinos daqui.

   Herda a gramática do design system: marca à esquerda, links ao centro com
   o ativo sublinhado por um gradiente que corre devagar, ações circulares à
   direita. Quem usa os três sistemas não precisa reaprender nada.

   ESTA BARRA É SÓ DAS TELAS INTERNAS. A tela do cliente (/c/…) tem cabeçalho
   próprio, sem trocador de ferramenta, sem avatar e sem link para o painel —
   quem abre aquele endereço é o cliente, e nada ali deve sugerir que existe
   um sistema por trás para explorar.

   O selo de MODO LOCAL existe porque a consequência de confundir os dois
   modos é grave, e aqui mais que no Gestor: em modo local o link do cliente
   só abre neste mesmo navegador. Mandar esse link por WhatsApp e o cliente
   ver "não encontrado" é o erro que este aviso evita.
   ═══════════════════════════════════════════════════════════════════════════ */

const NAV_ITEMS = [
    { href: '/',             label: 'Clientes',  match: (p) => p === '/' || p.startsWith('/cliente') || p.startsWith('/conteudo') },
    { href: '/diretorio',    label: 'Diretório', match: (p) => p.startsWith('/diretorio') },
];

export const renderTopnav = (container, caminhoAtual) => {
    const user = store.usuario();
    const iniciais = user
        ? user.nome.split(' ').map(s => s.charAt(0)).slice(0, 2).join('').toUpperCase()
        : '5K';
    const escuro = theme.get() === 'dark';

    container.innerHTML = `
        <header class="tn">
            <div class="tn__brand">
                <a href="/" class="tn__marca" aria-label="5K9 Visualizador — início">
                    <img class="tn__logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                         alt="5K9 Studio" width="816" height="185">
                </a>
                <div id="tn-trocador"></div>
            </div>

            <nav class="tn__nav">
                ${NAV_ITEMS.map(it => `
                    <a href="${it.href}" class="tn__link ${it.match(caminhoAtual) ? 'tn__link--active' : ''}">
                        ${it.label}
                    </a>`).join('')}
            </nav>

            <div class="tn__actions">
                ${store.modo === 'local' ? `
                    <a href="/configuracoes" class="tn__modo" title="Os dados estão salvos apenas neste navegador. Clique para conectar um banco.">
                        <i data-lucide="hard-drive"></i> Modo local
                    </a>` : ''}

                <div class="tn__user">
                    <button class="tn__avatar" id="tn-avatar" aria-haspopup="menu" aria-expanded="false"
                            aria-label="Conta de ${user ? user.nome : 'acesso local'}">${iniciais}</button>
                    <div class="tn__menu" id="tn-menu" role="menu" hidden>
                        <div class="tn__menu-head">
                            <span class="tn__menu-name">${user ? user.nome : '5K9 Studio'}</span>
                            <span class="tn__menu-mail">${user ? user.email : 'acesso local'}</span>
                        </div>
                        <hr class="ds-divider">
                        <a href="/configuracoes" class="tn__menu-item" role="menuitem">
                            <i data-lucide="settings"></i> Configurações
                        </a>
                        <button class="tn__menu-item" id="tn-theme" role="menuitem">
                            <i data-lucide="${escuro ? 'sun' : 'moon'}"></i> ${escuro ? 'Modo claro' : 'Modo escuro'}
                        </button>
                        ${store.exigeLogin ? `
                        <button class="tn__menu-item tn__menu-item--danger" id="tn-logout" role="menuitem">
                            <i data-lucide="log-out"></i> Sair
                        </button>` : ''}
                    </div>
                </div>
            </div>
        </header>
    `;

    injectStyles();
    renderTrocador(container.querySelector('#tn-trocador'));
    ligarEventos(container, caminhoAtual);
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────
function ligarEventos(container, caminhoAtual) {
    const menu   = container.querySelector('#tn-menu');
    const avatar = container.querySelector('#tn-avatar');

    const fechar = () => {
        menu.hidden = true;
        avatar.setAttribute('aria-expanded', 'false');
    };
    avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        const abrir = menu.hidden;
        menu.hidden = !abrir;
        avatar.setAttribute('aria-expanded', String(abrir));
    });
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
    menu.addEventListener('click', (e) => e.stopPropagation());

    container.querySelector('#tn-theme').addEventListener('click', () => {
        theme.alternar();
        renderTopnav(container, caminhoAtual);
    });

    const sair = container.querySelector('#tn-logout');
    if (sair) sair.addEventListener('click', async () => {
        await store.sair();
        navegar('/login');
    });
}

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('topnav-styles')) return;
    const style = document.createElement('style');
    style.id = 'topnav-styles';
    style.textContent = `
        .tn {
            display: flex; align-items: center; justify-content: space-between;
            gap: var(--space-6);
            height: 56px;
            font-family: var(--font-sans);
        }

        /* ── Marca ──────────────────────────────────────────────────────────
           A marca virou dois elementos: o logo, que leva ao início, e o
           trocador de ferramenta ao lado. Antes era um <a> só englobando o
           nome do produto — com o botão dentro, seria um botão aninhado num
           link, e o clique disputaria entre navegar e abrir o painel. */
        .tn__brand { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
        .tn__marca { display: flex; align-items: center; text-decoration: none; }
        /* Lockup horizontal (4.41:1). Regra do DS: dimensionar pela ALTURA,
           largura em auto, align-self centrado — em container de coluna o
           stretch deforma a marca. */
        .tn__logo { height: 22px; width: auto; align-self: center; display: block; }
        html[data-theme="light"] .tn__logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }

        /* ── Links ─────────────────────────────────────────────────────── */
        .tn__nav { display: flex; align-items: center; gap: var(--space-6); flex: 1; justify-content: center; }
        .tn__link {
            position: relative; padding: 4px 0;
            font-size: var(--text-sm); font-weight: 500;
            color: var(--text-tertiary); text-decoration: none; white-space: nowrap;
            transition: color var(--dur-fast);
        }
        .tn__link:hover { color: var(--text-primary); }
        .tn__link--active { color: var(--text-primary); font-weight: 600; }
        .tn__link--active::after {
            content: ''; position: absolute;
            left: 0; right: 0; bottom: -6px; height: 2px;
            border-radius: var(--radius-pill);
            background: var(--gradient-flow-x);
            background-size: 200% 100%;
            animation: ds-flow 7s var(--ease-inout) infinite;
        }

        /* ── Ações ─────────────────────────────────────────────────────── */
        .tn__actions { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }

        /* Selo de modo local. Âmbar, não vermelho: não é erro, é um estado
           que a pessoa escolheu — mas precisa saber que está nele. */
        .tn__modo {
            display: inline-flex; align-items: center; gap: 6px;
            height: 28px; padding: 0 var(--space-3);
            border-radius: var(--radius-pill);
            background: var(--warning-muted); color: var(--warning);
            border: 1px solid transparent;
            font-size: var(--text-xs); font-weight: 600; text-decoration: none;
            white-space: nowrap;
            transition: border-color var(--dur-fast);
        }
        .tn__modo:hover { border-color: var(--warning); }
        .tn__modo i, .tn__modo svg { width: 13px; height: 13px; }

        /* ── Avatar + menu ─────────────────────────────────────────────── */
        .tn__user { position: relative; }
        .tn__avatar {
            width: 38px; height: 38px; border-radius: 50%;
            border: 1px solid var(--border-default);
            background: var(--gradient-violet); color: var(--accent-contrast);
            font-family: var(--font-sans); font-size: var(--text-xs); font-weight: 700;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: transform var(--dur-fast) var(--ease-out);
            /* background-size DEPOIS do shorthand, que o reseta. */
            background-size: 200% 200%;
            animation: ds-drift 24s var(--ease-inout) infinite;
        }
        .tn__avatar:hover { transform: translateY(-1px); }

        .tn__menu {
            position: absolute; top: calc(100% + 10px); right: 0;
            width: 232px; z-index: 200;
            display: flex; flex-direction: column; gap: 2px;
            padding: var(--space-2);
            background: var(--surface-2);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
        }
        .tn__menu[hidden] { display: none; }
        .tn__menu-head { display: flex; flex-direction: column; padding: var(--space-2) var(--space-3) var(--space-3); }
        .tn__menu-name { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
        .tn__menu-mail { font-size: var(--text-xs); color: var(--text-tertiary); }
        .tn__menu .ds-divider { margin: 0 0 var(--space-2); }
        .tn__menu-item {
            display: flex; align-items: center; gap: var(--space-3);
            width: 100%; height: 38px; padding: 0 var(--space-3);
            border: none; border-radius: var(--radius-xs);
            background: none; color: var(--text-secondary);
            font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 500;
            text-align: left; text-decoration: none; cursor: pointer;
            transition: background-color var(--dur-fast), color var(--dur-fast);
        }
        .tn__menu-item i, .tn__menu-item svg { width: 16px; height: 16px; flex-shrink: 0; }
        .tn__menu-item:hover { background: var(--surface-3); color: var(--text-primary); }
        .tn__menu-item--danger:hover { background: var(--danger-muted); color: var(--danger); }

        @media (prefers-reduced-motion: reduce) {
            .tn__link--active::after, .tn__avatar { animation: none !important; }
        }

        /* ── Responsivo ────────────────────────────────────────────────────
           No Forms a barra simplesmente esconde os links no celular — lá são
           quatro destinos e a Home dá atalho para todos. Aqui são cinco e
           não há atalho para Cadastros; sumir com o menu deixaria seções
           inalcançáveis. Então a navegação desce para uma linha própria e
           rola na horizontal. */
        @media (max-width: 1080px) { .tn__nav { gap: var(--space-4); } }
        @media (max-width: 900px)  {
            .tn { flex-wrap: wrap; height: auto; gap: var(--space-3); padding-bottom: var(--space-2); }
            /* O trocador SOBREVIVE ao celular, ao contrário do rótulo
               estático que ele substituiu: é o único caminho para as outras
               ferramentas, e esconder navegação em tela pequena é como
               seções inteiras somem sem ninguém notar. */
            .tn__nav {
                order: 3; width: 100%; flex: 0 0 100%;
                justify-content: flex-start; gap: var(--space-5);
                overflow-x: auto; padding-bottom: var(--space-2);
                scrollbar-width: none;
            }
            .tn__nav::-webkit-scrollbar { display: none; }
            /* O sublinhado do ativo fica a -6px; dentro de um container que
               rola, isso vazava para fora da caixa e era cortado. */
            .tn__link--active::after { bottom: -4px; }
        }
    `;
    document.head.appendChild(style);
}
