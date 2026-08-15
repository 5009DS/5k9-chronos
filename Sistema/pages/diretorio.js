import { renderShell } from '../components/pageshell.js';
import { esc } from '../lib/formato.js';
import {
    diretorio, listarFases, listarObjetivos, objetivo, nomeFase,
    leitura, classificar,
} from '../lib/diretorio.js';
import { chipFase } from '../lib/pecas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   DIRETÓRIO — o conhecimento estratégico, visível.

   A ferramenta usa este conteúdo o tempo todo: para explicar um objetivo ao
   cliente, para avisar que um par está em conflito, para sugerir a fase de um
   tema. Esta tela existe para que ele possa ser LIDO e CONFERIDO, e não
   apenas consumido pela máquina.

   É a diferença entre um sistema que "acha" e um que se explica. Quando o
   formulário avisa que um roteiro parece fundo de funil, quem discorda pode
   vir aqui, ver de onde saiu a regra, e mudá-la em Configurações — sem abrir
   um chamado para ninguém.

   O testador no topo é o mesmo classificador que roda no formulário. Estar
   aqui, isolado, permite calibrar a taxonomia colando temas reais e vendo o
   que ela responde antes de confiar nela.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderDiretorio = async (container) => {
    const { taxonomia, objetivos } = diretorio();

    const { content } = renderShell(container, {
        path: '/diretorio',
        title: 'Diretório',
        subtitle: 'O funil, os objetivos e as regras que o sistema aplica sozinho.',
        actions: `<a class="ds-btn ds-btn--ghost" href="/configuracoes">
                      <i data-lucide="upload"></i> Atualizar diretório
                  </a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    content.innerHTML = `
        <!-- ══ Testador ═══════════════════════════════════════════════ -->
        <article class="ds-card ds-card--lit vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Testar um tema</h2>
                    <span class="ds-card-sub">Cole um tema ou trecho de roteiro e veja o que a taxonomia responde</span>
                </div>
            </div>
            <textarea class="ds-input dr-campo" id="dr-teste" rows="3"
                      placeholder="Ex.: Depoimento da paciente Ana sobre os 3 meses de acompanhamento"></textarea>
            <div id="dr-resultado"></div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                É contagem de sinais, não adivinhação — e por isso ele mostra quais palavras encontrou.
                Quando não encontra nenhuma, não responde: um classificador que sempre chuta ensina
                a equipe a confiar em palpite.
            </p>
        </article>

        <!-- ══ Fases ══════════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">As três fases</h2>
                    <span class="ds-card-sub">${esc(taxonomia.regra_volume || '')}</span>
                </div>
            </div>
            <p class="vz-nota">
                O <strong>Funil Invertido</strong> inverte a lógica tradicional: a semana começa
                pedindo ação, aproveitando o pico de disposição para decidir, e termina atraindo
                público novo, quando o consumo é mais leve.
            </p>
            <div class="dr-fases">
                ${listarFases().map(faseHTML).join('')}
            </div>
        </article>

        <!-- ══ Objetivos ══════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Os objetivos</h2>
                    <span class="ds-card-sub">${listarObjetivos().length} objetivos · a segunda camada de cada conteúdo</span>
                </div>
            </div>
            <p class="vz-nota">
                A fase responde <strong>para quem</strong> o conteúdo fala. O objetivo responde
                <strong>o que ele precisa provocar</strong>. São independentes: dois roteiros de meio
                de funil podem ter objetivos opostos.
            </p>
            <div class="dr-objetivos">
                ${listarObjetivos().map(objetivoHTML).join('')}
            </div>
        </article>

        <!-- ══ Matriz ═════════════════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Fase × objetivo</h2>
                    <span class="ds-card-sub">A leitura que o sistema mostra ao cruzar os dois</span>
                </div>
            </div>
            <div class="dr-matriz-rolagem">
                ${matrizHTML()}
            </div>
            <div class="dr-legenda">
                ${Object.entries(objetivos.leituras || {}).map(([chave, l]) => `
                    <span class="dr-legenda__item">
                        <span class="dr-celula dr-celula--${esc(l.tom)}"></span>
                        <strong>${esc(l.rotulo)}</strong> — ${esc(l.explicacao)}
                    </span>`).join('')}
            </div>
        </article>

        <!-- ══ Regras de desempate ════════════════════════════════════ -->
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Regras de desempate</h2>
                    <span class="ds-card-sub">O que fazer quando um conteúdo atende a mais de uma fase</span>
                </div>
            </div>
            <ol class="vz-lista dr-regras">
                ${(taxonomia.regras_desempate || []).map(r => `<li>${esc(r)}</li>`).join('')}
            </ol>
        </article>
    `;

    // ── Testador ────────────────────────────────────────────────────────
    const campo = content.querySelector('#dr-teste');
    const saida = content.querySelector('#dr-resultado');

    const testar = () => {
        const r = classificar(campo.value);
        if (!r) {
            saida.innerHTML = campo.value.trim()
                ? `<div class="vz-leitura"><p class="vz-leitura__texto">
                       Nenhum sinal reconhecido. Isso não quer dizer que o tema não tenha fase —
                       quer dizer que a taxonomia não tem palavra-chave para ele. Se for um tema
                       recorrente, vale acrescentar os termos dele ao diretório.
                   </p></div>`
                : '';
            return;
        }
        const tom = { alta: 'sucesso', 'média': 'atencao', baixa: 'atencao' }[r.confianca] || 'atencao';
        saida.innerHTML = `
            <div class="vz-leitura vz-leitura--${tom}">
                <div class="vz-leitura__cabeca">
                    <i data-lucide="wand-sparkles"></i> ${esc(nomeFase(r.fase))} · confiança ${esc(r.confianca)}
                </div>
                <p class="vz-leitura__texto">${esc(r.justificativa)}</p>
                ${r.regra ? `<p class="vz-leitura__texto"><strong>Regra aplicada:</strong> ${esc(r.regra)}</p>` : ''}
                <div class="dr-pontos">
                    ${Object.entries(r.pontuacao).map(([f, n]) => `
                        <span class="dr-ponto ${f === r.fase ? 'is-lider' : ''}">
                            ${esc(nomeFase(f))}: ${n}
                        </span>`).join('')}
                </div>
            </div>`;
        if (window.lucide) lucide.createIcons();
    };

    campo.addEventListener('input', testar);

    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

const faseHTML = (f) => `
    <section class="dr-fase dr-fase--${esc(f.id)}">
        <header class="dr-fase__cabeca">
            ${chipFase(f.id)}
            <span class="dr-fase__quando">${esc(f.posicao_cronograma)}</span>
        </header>
        <p class="vz-nota"><strong>Objetivo:</strong> ${esc(f.objetivo_principal)}</p>
        <p class="vz-nota"><strong>Público:</strong> ${esc(f.nivel_consciencia_publico)}</p>
        <p class="vz-nota"><strong>Tom:</strong> ${esc((f.tom || []).join(', '))}</p>
        <div>
            <span class="vz-rotulo">Sinais de classificação</span>
            <ul class="vz-lista">${(f.sinais_classificacao || []).map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        </div>
        <div class="dr-termos">
            ${(f.palavras_chave || []).map(p => `<span class="dr-termo">${esc(p)}</span>`).join('')}
        </div>
        ${f.compliance_flag ? `
            <p class="dr-conformidade"><i data-lucide="scale"></i> ${esc(f.compliance_flag)}</p>` : ''}
    </section>`;

const objetivoHTML = (o) => `
    <details class="vz-saiba dr-objetivo">
        <summary>
            <i data-lucide="${esc(o.icone || 'compass')}"></i>
            ${esc(o.nome)}
            <span class="dr-objetivo__resumo">${esc(o.resumo)}</span>
        </summary>
        <div class="vz-saiba__corpo">
            <p class="vz-nota">${esc(o.explicacao)}</p>
            <p class="vz-nota"><strong>Por que funciona:</strong> ${esc(o.por_que_funciona)}</p>
            <div>
                <span class="vz-rotulo">O roteiro precisa ter</span>
                <ul class="vz-lista">${(o.o_roteiro_precisa_ter || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
            <div>
                <span class="vz-rotulo">Evitar</span>
                <ul class="vz-lista">${(o.evitar || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
            </div>
            <p class="vz-nota"><strong>Como medir:</strong> ${esc(o.como_medir)}</p>
            ${o.compliance ? `<p class="dr-conformidade"><i data-lucide="scale"></i> ${esc(o.compliance)}</p>` : ''}
            <div>
                <span class="vz-rotulo">Em cada fase</span>
                ${['fundo', 'meio', 'topo'].map(f => {
                    const l = leitura(f, o.id);
                    if (!l) return '';
                    return `<p class="vz-nota dr-porfase">
                        <span class="dr-celula dr-celula--${esc(l.tom)}"></span>
                        <strong>${esc(nomeFase(f))} — ${esc(l.rotulo)}.</strong> ${esc(l.nota)}
                    </p>`;
                }).join('')}
            </div>
        </div>
    </details>`;

/* A matriz é uma TABELA de verdade, com <th> nas duas direções. Uma grade de
   <div> pareceria igual e não diria nada a um leitor de tela: "conflito" sem
   saber de qual cruzamento é uma informação inútil. */
const matrizHTML = () => `
    <table class="dr-matriz">
        <thead>
            <tr>
                <th scope="col">Objetivo</th>
                ${['fundo', 'meio', 'topo'].map(f =>
                    `<th scope="col">${esc(nomeFase(f))}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${listarObjetivos().map(o => `
                <tr>
                    <th scope="row">${esc(o.nome)}</th>
                    ${['fundo', 'meio', 'topo'].map(f => {
                        const l = leitura(f, o.id);
                        return `<td>
                            <span class="dr-celula dr-celula--${esc(l?.tom || 'neutro')}"
                                  title="${esc(l?.nota || '')}">${esc(l?.rotulo || '—')}</span>
                        </td>`;
                    }).join('')}
                </tr>`).join('')}
        </tbody>
    </table>`;

const ESTILOS = `
<style>
.dr-campo { height: auto; padding: var(--space-3) var(--space-4); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }

.dr-pontos { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-1); }
.dr-ponto {
    font-size: var(--text-xs); color: var(--text-tertiary);
    padding: 2px var(--space-3); border-radius: var(--radius-pill); background: var(--surface-3);
    font-variant-numeric: tabular-nums;
}
.dr-ponto.is-lider { color: var(--text-primary); font-weight: 600; }

/* ── Fases ───────────────────────────────────────────────────────────── */
.dr-fases { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4); }
.dr-fase {
    display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-3);
}
.dr-fase__cabeca { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.dr-fase__quando { font-size: var(--text-xs); color: var(--text-tertiary); }

.dr-termos { display: flex; flex-wrap: wrap; gap: 5px; }
.dr-termo {
    font-size: var(--text-xs); color: var(--text-tertiary);
    padding: 2px var(--space-2); border-radius: var(--radius-xs);
    background: var(--surface-1); font-family: var(--font-mono);
}

.dr-conformidade {
    display: flex; align-items: flex-start; gap: var(--space-2);
    margin: 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); background: var(--warning-muted); color: var(--warning);
    font-size: var(--text-sm); line-height: var(--leading-body);
}
.dr-conformidade i, .dr-conformidade svg { width: 14px; height: 14px; flex-shrink: 0; margin-top: 2px; }

/* ── Objetivos ───────────────────────────────────────────────────────── */
.dr-objetivos { display: flex; flex-direction: column; gap: var(--space-2); }
.dr-objetivo > summary { flex-wrap: wrap; }
.dr-objetivo__resumo { font-weight: 400; color: var(--text-tertiary); font-size: var(--text-xs); flex-basis: 100%; padding-left: 23px; }
.dr-porfase { display: flex; align-items: flex-start; gap: var(--space-2); margin-top: var(--space-2); }

/* ── Matriz ──────────────────────────────────────────────────────────── */
/* Rola sozinha na horizontal em vez de espremer as colunas: nove linhas de
   objetivo por três fases não cabem num celular, e uma tabela espremida vira
   uma coluna de uma letra por linha. */
.dr-matriz-rolagem { overflow-x: auto; }
.dr-matriz { width: 100%; border-collapse: collapse; font-size: var(--text-sm); min-width: 520px; }
.dr-matriz th, .dr-matriz td { padding: var(--space-3); text-align: left; border-bottom: 1px solid var(--border-subtle); }
.dr-matriz thead th { font-size: var(--text-xs); color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide); font-weight: 700; }
.dr-matriz tbody th { font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.dr-matriz td { color: var(--text-tertiary); }

.dr-celula {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
}
.dr-celula::before {
    content: ''; width: 9px; height: 9px; border-radius: 3px;
    background: var(--dr-tom, var(--text-disabled)); flex-shrink: 0;
}
.dr-celula--sucesso { --dr-tom: var(--success); color: var(--success); }
.dr-celula--atencao { --dr-tom: var(--warning); color: var(--warning); }
.dr-celula--risco   { --dr-tom: var(--danger);  color: var(--danger); }

.dr-legenda { display: flex; flex-direction: column; gap: var(--space-2); }
.dr-legenda__item { display: flex; align-items: baseline; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-tertiary); line-height: var(--leading-body); }
.dr-legenda__item strong { color: var(--text-primary); }

.dr-regras li { line-height: var(--leading-body); }
</style>
`;
