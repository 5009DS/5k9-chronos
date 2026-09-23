import { store } from '../store.js';
import { buscar } from '../lib/busca.js';
import { caminhoDoConteudo, navegar } from '../lib/rotas.js';
import { esc, diaCurto } from '../lib/formato.js';
import { chipsEstado, injectEstilosEtiqueta } from '../lib/etiquetas.js';
import { tipo } from '../lib/roteiro.js';

/* ═══════════════════════════════════════════════════════════════════════════
   BUSCA — a paleta que abre por cima de qualquer tela interna.

   Abre pelo campo da topnav, por ⌘K / Ctrl+K ou pela barra "/" (quando a
   pessoa não está digitando em outro campo). Procura em todos os clientes de
   uma vez: quem procura um roteiro pela frase quase nunca lembra de quem era.

   É um painel por cima, e não uma página: achar e voltar para onde estava é
   metade do uso, e uma rota nova jogaria fora a rolagem e o contexto da tela
   de baixo.

   Nunca aparece na rota do cliente (/c/…): a topnav nem existe lá, e o atalho
   de teclado confere a rota antes de abrir.

   A lógica de casar e ordenar mora em lib/busca.js; aqui é só desenho.
   ═══════════════════════════════════════════════════════════════════════════ */

let aberta = null;   // { fundo, soltar }

export const fecharBusca = () => {
    if (!aberta) return;
    const { fundo, soltar, focoAntes } = aberta;
    soltar();
    aberta = null;
    fundo.remove();
    focoAntes?.focus?.();
};

export const abrirBusca = async (consultaInicial = '') => {
    if (aberta) { aberta.fundo.querySelector('.bs-input').focus(); return; }
    injectStyles();
    injectEstilosEtiqueta();

    const fundo = document.createElement('div');
    fundo.className = 'bs-fundo';
    fundo.innerHTML = `
        <div class="bs-painel" role="dialog" aria-modal="true" aria-label="Buscar conteúdo">
            <label class="bs-campo">
                <i data-lucide="search"></i>
                <input class="bs-input" type="search" autocomplete="off" spellcheck="false"
                       placeholder="Buscar por título, frase do roteiro, tema…"
                       role="combobox" aria-expanded="true" aria-controls="bs-lista"
                       aria-autocomplete="list">
                <kbd class="bs-kbd">esc</kbd>
            </label>
            <div class="bs-lista" id="bs-lista" role="listbox"></div>
            <div class="bs-rodape">
                <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
                <span><kbd>↵</kbd> abrir</span>
                <span><kbd>esc</kbd> fechar</span>
            </div>
        </div>`;
    document.body.appendChild(fundo);

    const input = fundo.querySelector('.bs-input');
    const lista = fundo.querySelector('.bs-lista');
    let resultados = [];
    let ativo = 0;
    let dados = null;
    let espera = null;

    const onTecla = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); fecharBusca(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!resultados.length) return;
            const d = e.key === 'ArrowDown' ? 1 : -1;
            marcar((ativo + d + resultados.length) % resultados.length);
        }
        if (e.key === 'Enter' && resultados[ativo] && e.target === input) {
            e.preventDefault();
            abrirResultado(resultados[ativo].conteudo, e.metaKey || e.ctrlKey);
        }
    };
    document.addEventListener('keydown', onTecla);
    fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fecharBusca(); });

    aberta = {
        fundo,
        focoAntes: document.activeElement,
        soltar: () => { document.removeEventListener('keydown', onTecla); clearTimeout(espera); },
    };

    const marcar = (i) => {
        ativo = i;
        lista.querySelectorAll('.bs-item').forEach((el, k) => {
            const sim = k === i;
            el.classList.toggle('is-ativo', sim);
            el.setAttribute('aria-selected', String(sim));
            if (sim) {
                input.setAttribute('aria-activedescendant', el.id);
                el.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    const desenhar = () => {
        const consulta = input.value.trim();
        if (!dados) {
            lista.innerHTML = `<p class="bs-aviso">Carregando conteúdos…</p>`;
            return;
        }
        if (consulta.length < 2) {
            resultados = [];
            lista.innerHTML = `<p class="bs-aviso">Digite um pedaço do título ou qualquer frase do roteiro.
                Acento e maiúscula não importam.</p>`;
            return;
        }
        resultados = buscar(consulta, dados);
        if (!resultados.length) {
            lista.innerHTML = `<p class="bs-aviso">Nada encontrado para “${esc(consulta)}”.</p>`;
            return;
        }
        lista.innerHTML = `
            <p class="bs-contagem">${resultados.length === 40 ? 'Os 40 mais relevantes' :
                resultados.length === 1 ? '1 conteúdo' : `${resultados.length} conteúdos`}</p>
            ${resultados.map((r, i) => itemHTML(r, i, dados.nomes)).join('')}`;
        lista.querySelectorAll('.bs-item').forEach((el, i) => {
            el.addEventListener('mousemove', () => { if (ativo !== i) marcar(i); });
            el.addEventListener('click', (e) => {
                // Cmd/Ctrl-clique segue o navegador (nova aba) — só fecha.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                abrirResultado(resultados[i].conteudo, false);
            });
        });
        marcar(0);
        if (window.lucide) lucide.createIcons();
    };

    input.addEventListener('input', () => {
        clearTimeout(espera);
        espera = setTimeout(desenhar, 80);
    });

    input.value = consultaInicial;
    desenhar();
    if (window.lucide) lucide.createIcons();
    input.focus();

    try {
        const { clientes, conteudos, blocos } = await store.tudo();
        dados = { conteudos, blocos, nomes: new Map(clientes.map(c => [c.id, c.nome])) };
    } catch (e) {
        console.error('[busca] não carregou os conteúdos:', e);
        lista.innerHTML = `<p class="bs-aviso">Não foi possível carregar os conteúdos agora.</p>`;
        return;
    }
    if (aberta?.fundo === fundo) desenhar();
};

const abrirResultado = (conteudo, novaAba) => {
    const caminho = caminhoDoConteudo(conteudo);
    if (novaAba) { window.open(caminho, '_blank'); return; }
    fecharBusca();
    navegar(caminho);
};

const marcado = (pedacos) => pedacos
    .map(p => p.marcado ? `<mark>${esc(p.texto)}</mark>` : esc(p.texto)).join('');

const itemHTML = (r, i, nomes) => {
    const c = r.conteudo;
    const noTitulo = r.campo.onde === 'Título';
    const onde = r.campo.bloco ? `Roteiro · ${tipo(r.campo.bloco.tipo).nome}` : r.campo.onde;
    return `
        <a class="bs-item" id="bs-item-${i}" role="option" aria-selected="false"
           href="${esc(caminhoDoConteudo(c))}">
            <span class="bs-item__topo">
                <span class="bs-item__titulo">${noTitulo ? marcado(r.trecho) : esc(c.titulo || 'Sem título')}</span>
                <span class="bs-item__meta">${esc(nomes.get(c.cliente_id) || '')} · ${esc(diaCurto(c.data))}</span>
            </span>
            ${noTitulo ? '' : `
            <span class="bs-item__trecho"><b>${esc(onde)}</b> ${marcado(r.trecho)}</span>`}
            <span class="bs-item__chips">
                ${chipsEstado(c)}
                ${c.banco_em ? `<span class="vz-status"><i data-lucide="archive"></i>No banco de temas</span>` : ''}
            </span>
        </a>`;
};

/* ── Atalhos globais ──────────────────────────────────────────────────────
   Ligados uma vez só, no documento: a topnav é redesenhada a cada tela, e
   ligar a cada desenho empilharia um ouvinte por navegação. */
let atalhosLigados = false;
export const ligarAtalhosBusca = () => {
    if (atalhosLigados) return;
    atalhosLigados = true;
    document.addEventListener('keydown', (e) => {
        if (aberta || window.location.pathname.startsWith('/c/')) return;
        // O teleprompter é tela cheia e usa o teclado inteiro.
        if (document.body.classList.contains('tp-travado')) return;

        const cmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k';
        const alvo = e.target;
        const digitando = alvo && (alvo.isContentEditable
            || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName));
        const barra = e.key === '/' && !digitando && !e.metaKey && !e.ctrlKey && !e.altKey;

        if (cmdK || barra) {
            e.preventDefault();
            abrirBusca();
        }
    });
};

/** "⌘K" no Mac, "Ctrl K" no resto — o atalho que a pessoa vai de fato apertar. */
export const rotuloAtalho = () =>
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('busca-styles')) return;
    const style = document.createElement('style');
    style.id = 'busca-styles';
    style.textContent = `
        .bs-fundo {
            position: fixed; inset: 0; z-index: 1000;
            display: flex; justify-content: center; align-items: flex-start;
            padding: 12vh var(--space-4) var(--space-4);
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            animation: bs-entra var(--dur-fast, 120ms) var(--ease-out, ease-out);
            font-family: var(--font-sans);
        }
        @keyframes bs-entra { from { opacity: 0; } to { opacity: 1; } }

        .bs-painel {
            width: 100%; max-width: 640px; max-height: 76vh;
            display: flex; flex-direction: column;
            background: var(--surface-2);
            border: 1px solid var(--border-default);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            overflow: hidden;
        }

        .bs-campo {
            display: flex; align-items: center; gap: var(--space-3);
            padding: 0 var(--space-4);
            border-bottom: 1px solid var(--border-default);
        }
        .bs-campo > i, .bs-campo > svg { width: 18px; height: 18px; color: var(--text-tertiary); flex-shrink: 0; }
        .bs-input {
            flex: 1; min-width: 0; height: 54px;
            border: none; outline: none; background: none;
            font-family: var(--font-sans); font-size: var(--text-md, 16px);
            color: var(--text-primary);
        }
        /* O foco já é óbvio: o painel inteiro existe para este campo. A borda
           de foco global ficava cortada pelo overflow do painel. */
        .bs-painel .bs-input:focus, .bs-painel .bs-input:focus-visible { outline: none; box-shadow: none; border: none; }
        .bs-input::placeholder { color: var(--text-tertiary); }
        .bs-input::-webkit-search-cancel-button { display: none; }

        .bs-painel kbd {
            display: inline-flex; align-items: center; justify-content: center;
            min-width: 20px; height: 20px; padding: 0 5px;
            border: 1px solid var(--border-default); border-radius: 4px;
            background: var(--surface-3);
            font-family: var(--font-sans); font-size: 11px; font-weight: 600;
            color: var(--text-tertiary);
        }

        .bs-lista { overflow-y: auto; padding: var(--space-2); flex: 1; }
        .bs-aviso { margin: 0; padding: var(--space-6) var(--space-4); text-align: center;
                    font-size: var(--text-sm); color: var(--text-tertiary); }
        .bs-contagem { margin: 0; padding: var(--space-1) var(--space-3) var(--space-2);
                       font-size: var(--text-xs); color: var(--text-tertiary); }

        .bs-item {
            display: flex; flex-direction: column; gap: 6px;
            padding: var(--space-3);
            border-radius: var(--radius-xs);
            color: var(--text-secondary); text-decoration: none;
            scroll-margin: var(--space-2);
        }
        .bs-item.is-ativo { background: var(--surface-3); }
        .bs-item__topo { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
        .bs-item__titulo { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); min-width: 0; }
        .bs-item__meta { font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap; flex-shrink: 0; }
        .bs-item__trecho {
            font-size: var(--text-sm); line-height: 1.45;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .bs-item__trecho b { font-weight: 600; font-size: var(--text-xs); color: var(--text-tertiary); margin-right: 4px; }
        .bs-item__chips { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .bs-item mark {
            background: var(--accent-muted); color: var(--text-primary);
            border-radius: 3px; padding: 0 2px;
        }

        .bs-rodape {
            display: flex; gap: var(--space-4);
            padding: var(--space-2) var(--space-4);
            border-top: 1px solid var(--border-default);
            font-size: var(--text-xs); color: var(--text-tertiary);
        }
        .bs-rodape span { display: inline-flex; align-items: center; gap: 4px; }

        @media (max-width: 640px) {
            .bs-fundo { padding: var(--space-3); }
            .bs-painel { max-height: calc(100vh - 2 * var(--space-3)); }
            .bs-rodape, .bs-campo .bs-kbd { display: none; }
            .bs-item__topo { flex-direction: column; gap: 2px; }
        }
        @media (prefers-reduced-motion: reduce) { .bs-fundo { animation: none; } }
    `;
    document.head.appendChild(style);
}
