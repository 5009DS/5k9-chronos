import { FERRAMENTAS, urlDe, ATUAL } from '../lib/ferramentas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   TROCADOR DE FERRAMENTA — o seletor ao lado da marca.

   Mesmo gesto do seletor de projeto da Vercel: o nome do que está aberto,
   uma seta dupla, e um painel curto com as outras opções. Fica colado na
   marca, e não no menu do avatar, porque é navegação e não configuração —
   trocar de ferramenta é irmão de trocar de página, não de trocar de senha.

   Cada sistema é um deploy independente, em subdomínio próprio. Então os
   itens são links absolutos e a troca RECARREGA a página; não há como fazer
   navegação sem recarga entre origens diferentes, e fingir que há só
   produziria uma tela que parece travada enquanto o navegador carrega.

   Este arquivo é idêntico nos dois sistemas. O que muda é ATUAL, em
   lib/ferramentas.js.
   ═══════════════════════════════════════════════════════════════════════════ */

let aberto = null;   // { painel, botao, soltar }

export const fecharTrocador = () => {
    if (!aberto) return;
    const { painel, botao, soltar } = aberto;

    // Solta os listeners globais ANTES de qualquer espera. Amarrá-los ao fim
    // da transição deixava uma janela em que o painel já não existia e os
    // ouvintes ainda respondiam — e, se alguém reabrisse nesse intervalo, o
    // par antigo nunca era removido e vazava a cada abertura.
    soltar();
    aberto = null;

    painel.classList.remove('is-aberto');
    botao.setAttribute('aria-expanded', 'false');
    const remover = () => painel.remove();
    painel.addEventListener('transitionend', remover, { once: true });
    setTimeout(remover, 300);          // rede de segurança
};

/** Monta o botão dentro do container informado (a topnav). */
export const renderTrocador = (container) => {
    injectStyles();

    const atual = FERRAMENTAS.find(f => f.id === ATUAL) || FERRAMENTAS[0];

    container.innerHTML = `
        <button class="tr-botao" id="tr-botao" aria-haspopup="menu" aria-expanded="false"
                aria-label="Trocar de ferramenta — ${atual.nome} selecionado">
            <span class="tr-botao__nome">${atual.nome}</span>
            <i data-lucide="chevrons-up-down" class="tr-botao__seta"></i>
        </button>`;

    const botao = container.querySelector('#tr-botao');
    botao.addEventListener('click', (e) => {
        e.stopPropagation();
        aberto ? fecharTrocador() : abrir(botao);
    });

    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────
function abrir(botao) {
    const painel = document.createElement('div');
    painel.className = 'tr-painel';
    painel.setAttribute('role', 'menu');

    painel.innerHTML = `
        <span class="tr-painel__titulo">Ferramentas do estúdio</span>
        ${FERRAMENTAS.map(f => {
            const ehAtual = f.id === ATUAL;
            return `
            <a class="tr-item ${ehAtual ? 'tr-item--atual' : ''}"
               href="${ehAtual ? '/' : urlDe(f)}" role="menuitem"
               ${ehAtual ? 'aria-current="true"' : ''}>
                <span class="tr-item__icone"><i data-lucide="${f.icone}"></i></span>
                <span class="tr-item__texto">
                    <b>${f.nome}</b>
                    <small>${f.descricao}</small>
                </span>
                ${ehAtual ? '<i data-lucide="check" class="tr-item__check"></i>' : ''}
            </a>`;
        }).join('')}`;

    document.body.appendChild(painel);

    /* Posiciona sob o botão, em coordenadas de viewport (o painel é
       position:fixed e mora no <body>, para não ser cortado pelo overflow
       da topnav). Se não couber à direita, encosta na borda: em telas
       estreitas o painel vazava para fora e ficava inalcançável. */
    const r = botao.getBoundingClientRect();
    const largura = 268;
    painel.style.top  = `${r.bottom + 8}px`;
    painel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - largura - 8))}px`;

    botao.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => painel.classList.add('is-aberto'));

    if (window.lucide) lucide.createIcons();

    // Foco no item atual: quem abre com o teclado precisa de um ponto de
    // partida, e o item atual é o que orienta ("estou aqui, posso ir ali").
    painel.querySelector('.tr-item--atual, .tr-item')?.focus();

    const foraDoPainel = (e) => { if (!painel.contains(e.target)) fecharTrocador(); };
    const noEsc = (e) => {
        if (e.key !== 'Escape') return;
        fecharTrocador();
        botao.focus();
    };
    // Reposiciona em vez de acompanhar: o painel é fixed, então rolar a
    // página o deixaria flutuando longe do botão. Fechar é a resposta certa
    // e é o que os menus do sistema fazem.
    const aoRolar = () => fecharTrocador();

    document.addEventListener('click', foraDoPainel);
    document.addEventListener('keydown', noEsc);
    window.addEventListener('popstate', fecharTrocador);
    window.addEventListener('resize', aoRolar);
    document.addEventListener('scroll', aoRolar, true);

    aberto = {
        painel, botao,
        soltar: () => {
            document.removeEventListener('click', foraDoPainel);
            document.removeEventListener('keydown', noEsc);
            window.removeEventListener('popstate', fecharTrocador);
            window.removeEventListener('resize', aoRolar);
            document.removeEventListener('scroll', aoRolar, true);
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('trocador-styles')) return;
    const style = document.createElement('style');
    style.id = 'trocador-styles';
    style.textContent = `
        /* ── Botão ─────────────────────────────────────────────────────────
           Discreto em repouso: é uma âncora de contexto, não uma chamada
           para ação. O filete à esquerda vem do .tn__product que ele
           substitui — a marca é "5K9 Studio", o nome ao lado é o produto. */
        .tr-botao {
            display: inline-flex; align-items: center; gap: var(--space-2);
            height: 30px; padding: 0 var(--space-2) 0 var(--space-3);
            margin-left: var(--space-1);
            border: 1px solid transparent; border-radius: var(--radius-sm);
            border-left: 1px solid var(--border-default);
            background: none; color: var(--text-primary);
            font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 600;
            letter-spacing: var(--tracking-tight);
            cursor: pointer; white-space: nowrap;
            transition: background-color var(--dur-fast) var(--ease-out),
                        border-color var(--dur-fast) var(--ease-out);
        }
        .tr-botao:hover { background: var(--surface-2); border-color: var(--border-default); }
        .tr-botao[aria-expanded="true"] { background: var(--surface-3); border-color: var(--border-default); }
        .tr-botao__seta { width: 13px; height: 13px; color: var(--text-tertiary); flex-shrink: 0; }

        /* ── Painel ────────────────────────────────────────────────────── */
        .tr-painel {
            position: fixed; z-index: 470;
            width: 268px;
            display: flex; flex-direction: column; gap: 2px;
            padding: var(--space-2);
            background: var(--surface-2);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            font-family: var(--font-sans);
            opacity: 0; transform: translateY(-6px) scale(0.98);
            transform-origin: top left;
            transition: opacity var(--dur-fast) var(--ease-out),
                        transform var(--dur-fast) var(--ease-out);
        }
        .tr-painel.is-aberto { opacity: 1; transform: translateY(0) scale(1); }

        .tr-painel__titulo {
            padding: var(--space-2) var(--space-3) var(--space-3);
            font-size: var(--text-xs); font-weight: 600;
            letter-spacing: var(--tracking-wide); text-transform: uppercase;
            color: var(--text-tertiary);
        }

        .tr-item {
            display: flex; align-items: center; gap: var(--space-3);
            padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-xs);
            text-decoration: none; color: var(--text-secondary);
            transition: background-color var(--dur-fast) var(--ease-out);
        }
        .tr-item:hover { background: var(--surface-3); }
        .tr-item__icone {
            width: 32px; height: 32px; flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: var(--radius-sm);
            background: var(--surface-3); color: var(--text-secondary);
        }
        .tr-item__icone i, .tr-item__icone svg { width: 16px; height: 16px; }
        .tr-item__texto { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .tr-item__texto b {
            font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);
            line-height: var(--leading-snug);
        }
        .tr-item__texto small {
            font-size: var(--text-xs); color: var(--text-tertiary);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .tr-item__check { width: 15px; height: 15px; color: var(--accent); flex-shrink: 0; }

        /* O item atual usa o roxo da marca no ícone: é o "você está aqui"
           lido antes de qualquer texto. */
        .tr-item--atual .tr-item__icone { background: var(--accent-muted); color: var(--accent); }

        @media (prefers-reduced-motion: reduce) { .tr-painel { transition: none; } }
    `;
    document.head.appendChild(style);
}
