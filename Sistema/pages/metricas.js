import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { esc } from '../lib/formato.js';
import { vazioHTML } from '../lib/pecas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   MÉTRICAS — a leitura quinzenal do Instagram, comparada com a anterior.

     /metricas      os clientes com leitura, e o número que mais importa
     /metricas/:id  o painel de um cliente: esta leitura × a anterior

   Os números vêm dos prints do Insights que o Andrew manda ao Claude; o
   Claude grava uma linha em vz_metricas por leitura e escreve a análise
   (db/migracao-metricas.sql). Esta página só lê.

   ── O FORMATO DE `dados` ──────────────────────────────────────────────────
   Tudo é opcional: a página mostra o que existir.

     visao: {
       visualizacoes, visualizadores, interacoes, seguidores_liquidos,
       pct_seguidores, pct_nao_seguidores,
       por_tipo: { stories, posts, reels, ao_vivo }
     }
     publico: {
       seguidores, novos, variacao_pct, mulheres_pct, homens_pct,
       idades: [{ faixa, pct }],
       paises: [{ nome, pct }],
       horarios_pico: [{ dia, faixa }]
     }
     conteudos: [{ titulo, data, tipo: 'reel'|'carrossel'|'post'|'story',
                   visualizacoes, curtidas, comentarios, reposts, compartilhamentos }]
     trouxeram_seguidores: [{ titulo, novos }]

   ── PERÍODOS DIFERENTES NÃO SE COMPARAM EM BRUTO ─────────────────────────
   O Insights deixa escolher 7, 14, 30 ou 90 dias. Se a leitura anterior tem
   outro tamanho, a variação passa a ser da MÉDIA POR DIA, e a página diz
   isso — 30 dias contra 14 sempre "cresceria", e seria mentira.
   ═══════════════════════════════════════════════════════════════════════════ */

const num = (v) => (v == null || Number.isNaN(+v)) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const curto = (v) => {
    if (v == null) return '—';
    const n = Number(v);
    if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return num(n);
};
const dataBR = (iso) => { const [a, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${a}` : ''; };
const diaMes = (iso) => dataBR(iso).slice(0, 5);

const TIPOS = [
    { id: 'stories', nome: 'Stories' },
    { id: 'posts', nome: 'Posts' },
    { id: 'reels', nome: 'Reels' },
    { id: 'ao_vivo', nome: 'Vídeos ao vivo' },
];

export const renderMetricas = async (container, clienteId = null) => {
    const clientes = await store.clientes.listar();
    let leituras;
    try { leituras = await store.metricas.listar(); }
    catch (e) {
        console.error('[metricas]', e);
        const { content } = renderShell(container, { path: '/metricas', title: 'Métricas' });
        content.innerHTML = `<article class="ds-card vz-secao">${vazioHTML('database', 'Falta preparar o banco',
            'Rode Sistema/db/migracao-metricas.sql no SQL Editor do Supabase e recarregue a página.')}</article>`;
        return;
    }
    const porCliente = (id) => leituras.filter(l => l.cliente_id === id)
        .sort((a, b) => String(b.fim).localeCompare(String(a.fim)));

    // ── Todos os clientes ──────────────────────────────────────────────
    if (!clienteId) {
        const ativos = clientes.filter(c => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const { content } = renderShell(container, {
            path: '/metricas', title: 'Métricas',
            subtitle: 'O Instagram de cada cliente, quinzena a quinzena.',
        });
        container.insertAdjacentHTML('beforeend', ESTILOS);
        content.innerHTML = `
            <div class="mt-clientes">
                ${ativos.map(c => {
                    const [ultima, anterior] = porCliente(c.id);
                    const v = ultima?.dados?.visao?.visualizacoes;
                    const d = ultima && anterior ? variacao(ultima, anterior, (l) => l.dados?.visao?.visualizacoes) : null;
                    return `
                        <a class="ds-card mt-cliente" href="/metricas/${esc(c.id)}">
                            <span class="mt-cliente__nome">${esc(c.nome)}</span>
                            ${ultima ? `
                                <span class="mt-cliente__num">${esc(curto(v))} <small>visualizações</small></span>
                                <span class="mt-cliente__pe">${esc(diaMes(ultima.inicio))} – ${esc(diaMes(ultima.fim))} ${d ? deltaHTML(d) : ''}</span>`
                            : '<span class="mt-cliente__pe">Sem leitura ainda</span>'}
                        </a>`;
                }).join('')}
            </div>
            <p class="mt-dica"><i data-lucide="info"></i>
                Para registrar uma leitura, mande os prints do Insights (Visão geral, Conteúdo e Público, no filtro de 14 dias) na conversa com o Claude.</p>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // ── Um cliente ─────────────────────────────────────────────────────
    const cliente = clientes.find(c => c.id === clienteId);
    const lista = porCliente(clienteId);
    const params = new URLSearchParams(location.search);
    let atual = lista.find(l => l.id === params.get('leitura')) || lista[0];

    const { content } = renderShell(container, {
        path: '/metricas',
        crumbs: [{ href: '/metricas', label: 'Métricas' }],
        title: esc(cliente?.nome || 'Cliente'),
        subtitle: 'Instagram · esta leitura comparada com a anterior',
        actions: cliente ? `<a class="ds-btn ds-btn--ghost" href="/quadro/${esc(cliente.id)}"><i data-lucide="layout-grid"></i> Quadro do mês</a>` : '',
    });
    container.insertAdjacentHTML('beforeend', ESTILOS);

    const desenhar = () => {
        if (!atual) {
            content.innerHTML = `<article class="ds-card vz-secao">${vazioHTML('chart-no-axes-combined', 'Nenhuma leitura ainda',
                'Mande os prints do Insights deste cliente (Visão geral, Conteúdo e Público, no filtro de 14 dias) na conversa com o Claude.')}</article>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        const idx = lista.indexOf(atual);
        const anterior = lista[idx + 1] || null;
        const porDia = anterior && anterior.dias !== atual.dias;
        const V = atual.dados?.visao || {};
        const P = atual.dados?.publico || {};

        content.innerHTML = `
            <div class="mt-periodo">
                <label class="mt-periodo__sel">
                    <span>Leitura</span>
                    <select class="ds-input" id="mt-leitura">
                        ${lista.map(l => `<option value="${esc(l.id)}" ${l === atual ? 'selected' : ''}>${esc(dataBR(l.inicio))} – ${esc(dataBR(l.fim))} · ${l.dias} dias</option>`).join('')}
                    </select>
                </label>
                <span class="mt-periodo__contra">
                    ${anterior
                        ? `comparada com <b>${esc(diaMes(anterior.inicio))} – ${esc(diaMes(anterior.fim))}</b> (${anterior.dias} dias)${porDia ? ' · <em>períodos diferentes: variação da média por dia</em>' : ''}`
                        : 'Primeira leitura — a comparação começa na próxima.'}
                </span>
            </div>

            <section class="mt-kpis">
                ${kpi('Visualizações', V.visualizacoes, atual, anterior, l => l.dados?.visao?.visualizacoes)}
                ${kpi('Contas alcançadas', V.visualizadores, atual, anterior, l => l.dados?.visao?.visualizadores, 'Quem viu ao menos um conteúdo', { unico: true })}
                ${kpi('Interações', V.interacoes, atual, anterior, l => l.dados?.visao?.interacoes)}
                ${kpi('Seguidores', P.seguidores, atual, anterior, l => l.dados?.publico?.seguidores, null, { bruto: true, emNumero: true })}
                ${kpi('Seguidores novos', P.novos, atual, anterior, l => l.dados?.publico?.novos, 'Quem começou a seguir no período', { sinal: true, bruto: true })}
                ${kpi('Seguidores líquidos', V.seguidores_liquidos, atual, anterior, l => l.dados?.visao?.seguidores_liquidos, 'Ganhos menos perdidos no período', { sinal: true, bruto: true })}
                ${kpi('Visualizações de não seguidores', V.pct_nao_seguidores, atual, anterior, l => l.dados?.visao?.pct_nao_seguidores, 'Quanto chega em gente nova', { pct: true, bruto: true })}
            </section>

            <div class="mt-grade">
                ${V.por_tipo ? porTipoHTML(atual, anterior, porDia) : ''}
                ${V.pct_seguidores != null ? `
                    <article class="ds-card mt-bloco">
                        <h2 class="mt-titulo">Quem viu</h2>
                        <div class="mt-pilha" role="img" aria-label="${esc(num(V.pct_seguidores))}% seguidores, ${esc(num(V.pct_nao_seguidores))}% não seguidores">
                            <span class="mt-pilha__a" style="width:${+V.pct_seguidores}%"></span>
                            <span class="mt-pilha__b" style="width:${+V.pct_nao_seguidores}%"></span>
                        </div>
                        <div class="mt-legenda">
                            <span><i class="mt-ponto mt-ponto--a"></i>Seguidores <b>${esc(num(V.pct_seguidores))}%</b></span>
                            <span><i class="mt-ponto mt-ponto--b"></i>Não seguidores <b>${esc(num(V.pct_nao_seguidores))}%</b></span>
                        </div>
                        ${P.mulheres_pct != null ? `
                            <h3 class="mt-sub">Público</h3>
                            <p class="mt-linha">Mulheres <b>${esc(num(P.mulheres_pct))}%</b>${P.homens_pct != null ? ` · Homens <b>${esc(num(P.homens_pct))}%</b>` : ''}</p>` : ''}
                        ${P.horarios_pico?.length ? `
                            <h3 class="mt-sub">Quando os seguidores estão mais ativos</h3>
                            <div class="mt-chips">${P.horarios_pico.map(h => `<span class="mt-chip">${esc(h.dia)} · ${esc(h.faixa)}</span>`).join('')}</div>` : ''}
                    </article>` : ''}
                ${P.idades?.length ? idadesHTML(P.idades, anterior?.dados?.publico?.idades) : ''}
            </div>

            ${atual.dados?.conteudos?.length ? conteudosHTML(atual.dados.conteudos) : ''}

            ${atual.dados?.trouxeram_seguidores?.length ? `
                <article class="ds-card mt-bloco">
                    <h2 class="mt-titulo">Conteúdos que trouxeram seguidores</h2>
                    <ul class="mt-lista">${atual.dados.trouxeram_seguidores.map(c => `<li>${esc(c.titulo)} <b>+${esc(num(c.novos))}</b></li>`).join('')}</ul>
                </article>` : ''}

            ${atual.analise ? `
                <article class="ds-card mt-bloco mt-analise">
                    <h2 class="mt-titulo"><i data-lucide="sparkles"></i> Leitura do período</h2>
                    ${analiseHTML(atual.analise)}
                </article>` : ''}

            ${lista.length > 1 ? historicoHTML(lista) : ''}`;

        content.querySelector('#mt-leitura')?.addEventListener('change', (e) => {
            atual = lista.find(l => l.id === e.target.value) || atual;
            history.replaceState(null, '', `${location.pathname}?leitura=${encodeURIComponent(atual.id)}`);
            desenhar();
        });
        if (window.lucide) lucide.createIcons();
    };
    desenhar();
};

// ── Peças ────────────────────────────────────────────────────────────────

/** Variação entre duas leituras; por dia quando os períodos têm tamanhos diferentes. */
const variacao = (a, b, ler, { bruto = false } = {}) => {
    const va = ler(a), vb = ler(b);
    if (va == null || vb == null) return null;
    const porDia = !bruto && a.dias !== b.dias;
    const x = porDia ? va / a.dias : va;
    const y = porDia ? vb / b.dias : vb;
    return { dif: x - y, pct: y ? ((x - y) / Math.abs(y)) * 100 : null, porDia };
};

/* A seta e a cor dizem a direção; o número diz quanto. Verde/vermelho com
   ícone e texto — nunca só a cor. */
const deltaHTML = (d, { pct = false, absoluto = false } = {}) => {
    if (!d) return '';
    const sobe = d.dif > 0, desce = d.dif < 0;
    const texto = pct
        ? `${d.dif > 0 ? '+' : ''}${num(d.dif)} p.p.`
        : absoluto ? `${d.dif > 0 ? '+' : ''}${num(d.dif)}`
        : d.pct != null ? `${d.pct > 0 ? '+' : ''}${num(d.pct)}%` : `${d.dif > 0 ? '+' : ''}${num(d.dif)}`;
    return `<span class="mt-delta ${sobe ? 'mt-delta--sobe' : desce ? 'mt-delta--desce' : ''}" title="${d.porDia ? 'Variação da média por dia' : 'Variação sobre a leitura anterior'}">
        <i data-lucide="${sobe ? 'trending-up' : desce ? 'trending-down' : 'minus'}"></i>${esc(texto)}</span>`;
};

/* `sinal`: número que pode ser negativo (seguidores líquidos) — a variação
   vai em número, porque "de −6 para +1" em porcentagem não diz nada.
   `unico`: pessoas únicas (alcance) — não se divide por dia. */
const kpi = (rotulo, valor, atual, anterior, ler, dica = null, { pct = false, sinal = false, bruto = false, unico = false, emNumero = false } = {}) => {
    if (valor == null) return '';
    const incomparavel = unico && anterior && anterior.dias !== atual.dias;
    const d = anterior && !incomparavel ? variacao(atual, anterior, ler, { bruto: bruto || pct }) : null;
    const mostra = pct ? `${num(valor)}%` : sinal && valor > 0 ? `+${num(valor)}` : num(valor);
    return `
        <article class="ds-card mt-kpi">
            <span class="mt-kpi__rotulo">${esc(rotulo)}</span>
            <span class="mt-kpi__valor">${esc(mostra)}</span>
            <span class="mt-kpi__pe">
                ${d ? deltaHTML(d, { pct, absoluto: sinal || emNumero })
                    : `<span class="mt-kpi__sem">${incomparavel ? 'períodos diferentes' : 'sem comparação'}</span>`}
                ${!pct && !bruto && !unico && atual.dias ? `<span class="mt-kpi__dia">${esc(num(Math.round(valor / atual.dias)))}/dia</span>` : ''}
            </span>
            ${dica ? `<span class="mt-kpi__dica">${esc(dica)}</span>` : ''}
        </article>`;
};

/* Barras horizontais, uma por tipo: a leitura atual em roxo, a anterior em
   cinza logo abaixo, na mesma escala. Valor escrito no fim — a barra mostra
   a proporção, o número diz o quanto. */
const porTipoHTML = (atual, anterior, porDia) => {
    const A = atual.dados.visao.por_tipo || {};
    const B = anterior?.dados?.visao?.por_tipo || null;
    const fA = porDia ? 1 / atual.dias : 1;
    const fB = porDia && anterior ? 1 / anterior.dias : 1;
    const maximo = Math.max(1, ...TIPOS.map(t => (A[t.id] || 0) * fA), ...(B ? TIPOS.map(t => (B[t.id] || 0) * fB) : []));
    const total = TIPOS.reduce((s, t) => s + (A[t.id] || 0), 0);
    return `
        <article class="ds-card mt-bloco">
            <h2 class="mt-titulo">Visualizações por tipo${porDia ? ' <small>(média por dia)</small>' : ''}</h2>
            ${B ? `<div class="mt-legenda"><span><i class="mt-ponto mt-ponto--a"></i>Esta leitura</span><span><i class="mt-ponto mt-ponto--cinza"></i>Anterior</span></div>` : ''}
            <div class="mt-barras">
                ${TIPOS.filter(t => A[t.id] != null).map(t => {
                    const a = (A[t.id] || 0) * fA, b = B ? (B[t.id] || 0) * fB : null;
                    return `
                        <div class="mt-barra" title="${esc(t.nome)}: ${esc(num(a))}${b != null ? ` · anterior ${esc(num(b))}` : ''}">
                            <span class="mt-barra__nome">${esc(t.nome)}${total ? ` <small>${esc(num((A[t.id] || 0) / total * 100))}%</small>` : ''}</span>
                            <span class="mt-barra__trilho">
                                <span class="mt-barra__a" style="width:${(a / maximo) * 100}%"></span>
                                ${b != null ? `<span class="mt-barra__b" style="width:${(b / maximo) * 100}%"></span>` : ''}
                            </span>
                            <span class="mt-barra__valor">${esc(curto(Math.round(a)))}</span>
                        </div>`;
                }).join('')}
            </div>
        </article>`;
};

/* Faixa etária dos seguidores: percentual, então compara direto com a
   leitura anterior (cinza), sem média por dia. */
const idadesHTML = (idades, anteriores) => {
    const ant = new Map((anteriores || []).map(i => [i.faixa, i.pct]));
    const maximo = Math.max(1, ...idades.map(i => +i.pct || 0), ...[...ant.values()].map(v => +v || 0));
    return `
        <article class="ds-card mt-bloco">
            <h2 class="mt-titulo">Faixa etária dos seguidores</h2>
            ${ant.size ? `<div class="mt-legenda"><span><i class="mt-ponto mt-ponto--a"></i>Esta leitura</span><span><i class="mt-ponto mt-ponto--cinza"></i>Anterior</span></div>` : ''}
            <div class="mt-barras">
                ${idades.map(i => {
                    const b = ant.get(i.faixa);
                    return `
                        <div class="mt-barra" title="${esc(i.faixa)}: ${esc(num(i.pct))}%${b != null ? ` · anterior ${esc(num(b))}%` : ''}">
                            <span class="mt-barra__nome">${esc(i.faixa)}</span>
                            <span class="mt-barra__trilho">
                                <span class="mt-barra__a" style="width:${((+i.pct || 0) / maximo) * 100}%"></span>
                                ${b != null ? `<span class="mt-barra__b" style="width:${((+b || 0) / maximo) * 100}%"></span>` : ''}
                            </span>
                            <span class="mt-barra__valor">${esc(num(i.pct))}%</span>
                        </div>`;
                }).join('')}
            </div>
        </article>`;
};

const ICONE_TIPO = { reel: 'clapperboard', carrossel: 'gallery-horizontal-end', post: 'image', story: 'circle-dashed' };

const conteudosHTML = (lista) => {
    const ordenada = [...lista].sort((a, b) => (b.visualizacoes || 0) - (a.visualizacoes || 0));
    const maximo = Math.max(1, ...ordenada.map(c => c.visualizacoes || 0));
    return `
        <article class="ds-card mt-bloco">
            <h2 class="mt-titulo">Conteúdos que mais foram vistos</h2>
            <div class="mt-tabela-rolagem">
                <table class="mt-tabela">
                    <thead><tr>
                        <th>Conteúdo</th><th class="mt-num">Visualizações</th>
                        <th class="mt-num" title="Curtidas">Curtidas</th><th class="mt-num">Coment.</th>
                        <th class="mt-num" title="Compartilhamentos (enviados)">Compart.</th><th class="mt-num">Reposts</th>
                    </tr></thead>
                    <tbody>${ordenada.map(c => `
                        <tr>
                            <td>
                                <span class="mt-conteudo">
                                    <i data-lucide="${ICONE_TIPO[c.tipo] || 'image'}" title="${esc(c.tipo || '')}"></i>
                                    <span><b>${esc(c.titulo)}</b><small>${esc(c.tipo || '')}${c.data ? ` · ${esc(c.data)}` : ''}</small></span>
                                </span>
                            </td>
                            <td class="mt-num">
                                <span class="mt-mini"><span style="width:${((c.visualizacoes || 0) / maximo) * 100}%"></span></span>
                                ${esc(curto(c.visualizacoes))}
                            </td>
                            <td class="mt-num">${esc(num(c.curtidas))}</td>
                            <td class="mt-num">${esc(num(c.comentarios))}</td>
                            <td class="mt-num">${esc(num(c.compartilhamentos))}</td>
                            <td class="mt-num">${esc(num(c.reposts))}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </article>`;
};

/* A análise é texto escrito pelo Claude: parágrafos e listas com "- ".
   Escapado antes de qualquer marcação; **negrito** é a única formatação. */
const analiseHTML = (texto) => {
    const negrito = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    const corpo = (linhas) => {
        if (!linhas.length) return '';
        if (linhas.every(l => /^\s*-\s+/.test(l))) {
            return `<ul class="mt-lista">${linhas.map(l => `<li>${negrito(l.replace(/^\s*-\s+/, ''))}</li>`).join('')}</ul>`;
        }
        return `<p>${linhas.map(negrito).join('<br>')}</p>`;
    };
    return String(texto).trim().split(/\n\s*\n/).map(b => {
        const linhas = b.split('\n');
        // "## Título" na primeira linha; o resto do bloco é parágrafo ou lista.
        if (/^#+\s/.test(linhas[0])) {
            return `<h3 class="mt-sub">${negrito(linhas[0].replace(/^#+\s/, ''))}</h3>${corpo(linhas.slice(1))}`;
        }
        return corpo(linhas);
    }).join('');
};

const historicoHTML = (lista) => `
    <article class="ds-card mt-bloco">
        <h2 class="mt-titulo">Histórico de leituras</h2>
        <div class="mt-tabela-rolagem">
            <table class="mt-tabela">
                <thead><tr><th>Período</th><th class="mt-num">Visualizações</th><th class="mt-num">Por dia</th>
                    <th class="mt-num">Alcance</th><th class="mt-num">Interações</th><th class="mt-num">Seguidores</th></tr></thead>
                <tbody>${lista.map(l => {
                    const v = l.dados?.visao || {}, p = l.dados?.publico || {};
                    return `<tr>
                        <td>${esc(diaMes(l.inicio))} – ${esc(diaMes(l.fim))} <small>(${l.dias}d)</small></td>
                        <td class="mt-num">${esc(num(v.visualizacoes))}</td>
                        <td class="mt-num">${v.visualizacoes != null ? esc(num(Math.round(v.visualizacoes / l.dias))) : '—'}</td>
                        <td class="mt-num">${esc(num(v.visualizadores))}</td>
                        <td class="mt-num">${esc(num(v.interacoes))}</td>
                        <td class="mt-num">${esc(num(p.seguidores))}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>
    </article>`;

const ESTILOS = `
<style>
.mt-clientes { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-3); }
.mt-cliente { display: flex; flex-direction: column; gap: 6px; padding: var(--space-4); text-decoration: none; color: var(--text-primary); }
.mt-cliente:hover { border-color: var(--border-default); }
.mt-cliente__nome { font-weight: 700; }
.mt-cliente__num { font-size: 26px; font-weight: 800; }
.mt-cliente__num small { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.mt-cliente__pe { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.mt-dica { display: flex; gap: 8px; align-items: flex-start; margin: var(--space-5) 0 0; font-size: 13px; color: var(--text-secondary); }
.mt-dica svg { width: 16px; height: 16px; flex: none; margin-top: 2px; }

.mt-periodo { display: flex; align-items: center; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-4); }
.mt-periodo__sel { display: flex; align-items: center; gap: var(--space-2); font-size: 13px; color: var(--text-secondary); }
.mt-periodo__sel select { width: auto; min-width: 280px; }
.mt-periodo__contra { font-size: 13px; color: var(--text-secondary); }
.mt-periodo__contra b { color: var(--text-primary); }
.mt-periodo__contra em { color: var(--warning); font-style: normal; }

.mt-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-3); margin-bottom: var(--space-4); }
.mt-kpi { display: flex; flex-direction: column; gap: 6px; padding: var(--space-4); }
.mt-kpi__rotulo { font-size: 13px; color: var(--text-secondary); }
.mt-kpi__valor { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; font-variant-numeric: tabular-nums; }
.mt-kpi__pe { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; }
.mt-kpi__sem, .mt-kpi__dia { color: var(--text-tertiary); }
.mt-kpi__dica { font-size: 11px; color: var(--text-tertiary); }
.mt-delta { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: var(--surface-3); color: var(--text-secondary); }
.mt-delta svg { width: 13px; height: 13px; }
.mt-delta--sobe { background: var(--success-muted); color: var(--success); }
.mt-delta--desce { background: var(--danger-muted); color: var(--danger); }

.mt-grade { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: var(--space-4); margin-bottom: var(--space-4); }
@media (max-width: 900px) { .mt-grade { grid-template-columns: 1fr; } }
.mt-bloco { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); margin-bottom: var(--space-4); }
.mt-grade .mt-bloco { margin-bottom: 0; }
.mt-titulo { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 700; }
.mt-titulo small { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.mt-titulo svg { width: 18px; height: 18px; color: var(--accent); }
.mt-sub { margin: var(--space-2) 0 0; font-size: 13px; font-weight: 700; color: var(--text-secondary); }
.mt-linha { margin: 0; font-size: 14px; }

.mt-legenda { display: flex; gap: var(--space-4); flex-wrap: wrap; font-size: 12px; color: var(--text-secondary); }
.mt-legenda span { display: inline-flex; align-items: center; gap: 6px; }
.mt-legenda b { color: var(--text-primary); }
.mt-ponto { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.mt-ponto--a { background: var(--accent); }
.mt-ponto--b { background: var(--accent-warm, #FF7A45); }
.mt-ponto--cinza { background: var(--text-tertiary); }

.mt-barras { display: flex; flex-direction: column; gap: 14px; }
.mt-barra { display: grid; grid-template-columns: 130px minmax(0, 1fr) 64px; align-items: center; gap: var(--space-3); }
.mt-barra__nome { font-size: 13px; }
.mt-barra__nome small { color: var(--text-tertiary); }
.mt-barra__trilho { display: flex; flex-direction: column; gap: 3px; }
.mt-barra__a { height: 12px; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--accent); }
.mt-barra__b { height: 5px; min-width: 2px; border-radius: 0 3px 3px 0; background: var(--text-tertiary); opacity: 0.7; }
.mt-barra__valor { font-size: 13px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }

.mt-pilha { display: flex; gap: 2px; height: 14px; border-radius: 4px; overflow: hidden; }
.mt-pilha__a { background: var(--accent); }
.mt-pilha__b { background: var(--accent-warm, #FF7A45); }
.mt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mt-chip { padding: 4px 10px; border-radius: 999px; background: var(--surface-3); font-size: 12px; }

.mt-tabela-rolagem { overflow-x: auto; }
.mt-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
.mt-tabela th { text-align: left; font-weight: 600; color: var(--text-secondary); padding: 8px 10px; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.mt-tabela td { padding: 10px; border-bottom: 1px solid var(--border-subtle); vertical-align: middle; }
.mt-tabela tr:last-child td { border-bottom: 0; }
.mt-tabela small { color: var(--text-tertiary); }
.mt-num { text-align: right !important; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mt-conteudo { display: flex; align-items: center; gap: 10px; }
.mt-conteudo svg { width: 16px; height: 16px; color: var(--text-secondary); flex: none; }
.mt-conteudo span { display: flex; flex-direction: column; }
.mt-mini { display: inline-block; width: 56px; height: 6px; margin-right: 8px; border-radius: 3px; background: var(--surface-3); vertical-align: middle; overflow: hidden; }
.mt-mini span { display: block; height: 100%; background: var(--accent); border-radius: 0 3px 3px 0; }

.mt-lista { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.5; }
.mt-analise p { margin: 0; font-size: 14px; line-height: 1.6; }
</style>`;
