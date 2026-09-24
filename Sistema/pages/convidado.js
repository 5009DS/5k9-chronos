import { store } from '../store.js';
import { theme } from '../theme.js';
import { toast } from '../components/toast.js';
import { esc, escLinhas, dataBR, nomeDia, linkCurto } from '../lib/formato.js';
import { chipFase, roteiroHTML } from '../lib/pecas.js';
import { etapaAtual, esteiraDe, chipEtiqueta, injectEstilosEtiqueta } from '../lib/etiquetas.js';
import { paraTexto, contarPalavras, duracaoTotal, temFala } from '../lib/roteiro.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONVIDADO — uma demanda aberta para quem não tem login (/d/<token>).

   Para o freelancer que vai editar UMA peça. Ele recebe um link secreto e vê
   o que precisa para trabalhar: título, cliente, data, formato, etapa, o que
   a peça precisa fazer, o roteiro inteiro e o Drive. Só leitura.

   O que ele NÃO vê — e não é por esconder na tela, é porque o banco nem
   manda (vz_convidado, db/migracao-convidado.sql): outras demandas, a
   anotação interna, a conversa com o cliente, o resto do sistema.

   Como a tela do cliente, esta rota é pública: o portão de login não a
   alcança (app.js, ehPublica) e a biblioteca do Supabase nem é baixada.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderConvidado = async (container, token) => {
    injectStyles();
    injectEstilosEtiqueta();
    container.innerHTML = `<div class="cv"><p class="cv-aviso">Carregando a demanda…</p></div>`;

    let dados = null;
    try {
        dados = await store.convidado(token);
    } catch (e) {
        console.error('[convidado]', e);
    }

    if (!dados?.conteudo) {
        container.innerHTML = `
            <div class="cv">
                ${topo()}
                <main class="cv-corpo cv-corpo--vazio">
                    <h1 class="ds-display">Link indisponível</h1>
                    <p>Este link de convidado foi desativado ou não existe. Peça um novo a quem enviou.</p>
                </main>
            </div>`;
        ligarTema(container);
        return;
    }

    const { conteudo: c, cliente, blocos = [] } = dados;
    const etapa = etapaAtual(c.etiquetas);
    const carrossel = esteiraDe(c.formato) === 'carrossel';
    const medida = blocos.length
        ? `${blocos.length} bloco${blocos.length > 1 ? 's' : ''} · ${contarPalavras(blocos)} palavras`
          + (temFala(c.formato) ? ` · ~${duracaoTotal(blocos)} de fala` : '')
        : '';

    document.title = `${c.titulo} · 5K9 Chronos`;
    container.innerHTML = `
        <div class="cv">
            ${topo()}
            <main class="cv-corpo">
                <header class="cv-cabeca">
                    <span class="cv-cliente">${esc(cliente)}</span>
                    <h1 class="ds-display cv-titulo">${esc(c.titulo)}</h1>
                    <p class="cv-quando">${esc(nomeDia(c.data))}, ${esc(dataBR(c.data))}</p>
                    <div class="cv-chips">
                        ${chipFase(c.fase)}
                        <span class="vz-status"><i data-lucide="${carrossel ? 'gallery-horizontal-end' : 'video'}"></i>${carrossel ? 'Carrossel' : 'Reels'}</span>
                        ${etapa ? chipEtiqueta(etapa.nome) : ''}
                    </div>
                </header>

                ${c.drive_url ? `
                    <a class="cv-drive" href="${esc(c.drive_url)}" target="_blank" rel="noopener">
                        <i data-lucide="folder-open"></i>
                        <span>
                            <b>${carrossel ? 'Arquivos da arte no Drive' : 'Arquivos da gravação no Drive'}</b>
                            <small>${esc(linkCurto(c.drive_url))}</small>
                        </span>
                        <i data-lucide="external-link" class="cv-drive__seta"></i>
                    </a>` : ''}

                ${c.intencao ? `
                    <section class="vz-leitura">
                        <div class="vz-leitura__cabeca"><i data-lucide="crosshair"></i> O que este conteúdo precisa fazer</div>
                        <p class="vz-leitura__texto">${escLinhas(c.intencao)}</p>
                    </section>` : ''}
                ${c.tema ? `<p class="cv-tema">${escLinhas(c.tema)}</p>` : ''}

                <section class="ds-card cv-roteiro">
                    <div class="cv-roteiro__cabeca">
                        <div>
                            <h2 class="ds-card-title">${carrossel ? 'Texto dos cards' : 'Roteiro'}</h2>
                            ${medida ? `<span class="ds-card-sub">${esc(medida)}</span>` : ''}
                        </div>
                        ${blocos.length ? `
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="cv-copiar">
                                <i data-lucide="copy"></i> Copiar texto
                            </button>` : ''}
                    </div>
                    ${blocos.length ? roteiroHTML(blocos) : `<p class="cv-aviso">O roteiro ainda não foi escrito.</p>`}
                </section>

                <p class="cv-rodape">
                    <i data-lucide="lock"></i>
                    Link de convidado — dá acesso só a esta demanda. 5K9 Studio.
                </p>
            </main>
        </div>`;

    container.querySelector('#cv-copiar')?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(paraTexto(c, blocos));
            toast('Roteiro copiado.');
        } catch {
            toast('Não foi possível copiar. Selecione o texto na tela.');
        }
    });
    ligarTema(container);
    if (window.lucide) lucide.createIcons();
};

const topo = () => `
    <header class="cv-topo">
        <img class="cv-logo" src="/assets/logo/5k9-lockup-horizontal-white.png" alt="5K9 Studio" width="816" height="185">
        <span class="cv-selo"><i data-lucide="user-round"></i> Acesso de convidado</span>
        <button class="ds-icon-btn cv-tema" id="cv-tema" aria-label="Alternar tema">
            <i data-lucide="${theme.get() === 'dark' ? 'sun' : 'moon'}"></i>
        </button>
    </header>`;

const ligarTema = (container) => {
    container.querySelector('#cv-tema')?.addEventListener('click', () => {
        theme.alternar();
        const b = container.querySelector('#cv-tema');
        b.innerHTML = `<i data-lucide="${theme.get() === 'dark' ? 'sun' : 'moon'}"></i>`;
        if (window.lucide) lucide.createIcons();
    });
    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('convidado-styles')) return;
    const style = document.createElement('style');
    style.id = 'convidado-styles';
    style.textContent = `
        .cv {
            flex: 1; min-width: 0; min-height: 100vh; overflow-y: auto;
            background: var(--surface-base); color: var(--text-primary);
            font-family: var(--font-sans);
        }
        .cv-topo {
            display: flex; align-items: center; gap: var(--space-3);
            max-width: 820px; margin: 0 auto; padding: var(--space-5) var(--space-5) 0;
        }
        .cv-logo { height: 20px; width: auto; }
        html[data-theme="light"] .cv-logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }
        .cv-selo {
            display: inline-flex; align-items: center; gap: 6px; margin-right: auto;
            padding: 3px 10px; border-radius: var(--radius-pill);
            background: var(--surface-2); border: 1px solid var(--border-subtle);
            font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary);
        }
        .cv-selo svg { width: 13px; height: 13px; }

        .cv-corpo {
            max-width: 820px; margin: 0 auto;
            padding: var(--space-8) var(--space-5) var(--space-12);
            display: flex; flex-direction: column; gap: var(--space-5);
        }
        .cv-corpo--vazio p { color: var(--text-tertiary); margin: 0; }
        .cv-cabeca { display: flex; flex-direction: column; gap: var(--space-2); }
        .cv-cliente { font-size: var(--text-sm); font-weight: 600; color: var(--accent); }
        .cv-titulo { margin: 0; }
        .cv-quando { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); }
        .cv-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

        .cv-drive {
            display: flex; align-items: center; gap: var(--space-3);
            padding: var(--space-4) var(--space-5);
            border: 1px solid var(--accent-border); border-radius: var(--radius-md);
            background: var(--accent-muted); color: var(--text-primary); text-decoration: none;
            transition: border-color var(--dur-fast);
        }
        .cv-drive:hover { border-color: var(--accent); }
        .cv-drive > svg { width: 22px; height: 22px; color: var(--accent); flex-shrink: 0; }
        .cv-drive span { display: flex; flex-direction: column; min-width: 0; }
        .cv-drive b { font-size: var(--text-body); }
        .cv-drive small { font-size: var(--text-xs); color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cv-drive .cv-drive__seta { width: 16px; height: 16px; margin-left: auto; color: var(--text-tertiary); }

        .cv-tema { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
        .cv-roteiro { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5); }
        .cv-roteiro__cabeca { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
        .cv-aviso { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); }
        .cv > .cv-aviso { padding: var(--space-8); text-align: center; }
        .cv-rodape {
            display: flex; align-items: center; justify-content: center; gap: 6px;
            margin: var(--space-4) 0 0; font-size: var(--text-xs); color: var(--text-tertiary);
        }
        .cv-rodape svg { width: 13px; height: 13px; }
        @media (max-width: 640px) {
            .cv-corpo { padding: var(--space-6) var(--space-4) var(--space-10); }
            .cv-selo { font-size: 11px; }
        }
    `;
    document.head.appendChild(style);
}
