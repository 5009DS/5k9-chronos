import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { textoDoPDF, ehPDF } from '../lib/pdf.js';
import { lerTemas, lerRoteiros } from '../lib/importar.js';
import { objetivosDaFase, nomeFase, classificar } from '../lib/diretorio.js';
import { chipFase, vazioHTML } from '../lib/pecas.js';
import { tipo as tipoBloco } from '../lib/roteiro.js';
import { esc, hoje, segundaDa, somarDias, dataBR, diaCurto, nomeDiaCurto } from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAR — do PDF da social mídia para o cronograma.

   ── O ARQUIVO NÃO É GUARDADO ──────────────────────────────────────────────
   O PDF é lido no navegador, vira conteúdo e bloco, e é descartado. Nada de
   upload, nada de storage. Um PDF por mês por cliente vira megabytes que
   ninguém pesquisa; o mesmo texto em linha de banco é filtrável, editável,
   entra na busca e aparece no celular do cliente. Foi o pedido, e é a decisão
   certa por outros motivos também.

   ── NADA ENTRA SEM SER OLHADO ─────────────────────────────────────────────
   A extração de PDF é boa, não é perfeita, e documento escrito por gente varia
   mais do que qualquer parser prevê. Por isso esta tela tem duas etapas
   separadas: primeiro ela mostra o que ENTENDEU, com contagem, agrupamento e
   as divergências que o classificador achou; só depois, num segundo clique,
   grava. A pessoa que subiu o arquivo é quem confere.

   ── POR QUE É UMA PÁGINA, E NÃO UM PAINEL LATERAL ─────────────────────────
   O resto do sistema lança registro em painel lateral. Aqui a conferência tem
   oitenta linhas agrupadas em três seções e cinco eixos — num painel de 460px
   isso vira uma coluna de rolagem infinita, e conferir deixa de acontecer.
   ═══════════════════════════════════════════════════════════════════════════ */

const MODOS = {
    temas: {
        rotulo: 'Temas',
        titulo: 'Importar temas',
        dica: 'O documento com as seções TOPO / MEIO / FUNDO DE FUNIL e a lista de temas de cada uma.',
    },
    roteiros: {
        rotulo: 'Roteiros',
        titulo: 'Importar roteiros',
        dica: 'O documento com o roteiro de cada tema, repetindo os mesmos títulos já cadastrados.',
    },
};

export const renderImportar = async (container, clienteId, modoInicial = 'temas') => {
    const { cliente, conteudos } = await store.doCliente(clienteId);

    if (!cliente) {
        const { content } = renderShell(container, {
            path: '/', title: 'Cliente não encontrado',
            subtitle: 'O cadastro pode ter sido removido.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    let modo = MODOS[modoInicial] ? modoInicial : 'temas';
    let texto = '';          // o que foi extraído
    let origem = '';         // nome do arquivo, para a tela dizer de onde veio
    let leitura = null;      // resultado do parser
    let selecao = new Set(); // ids locais dos itens marcados
    let inicioSemana = proximaSegunda();

    const { content } = renderShell(container, {
        path: '/',
        crumbs: [
            { href: '/', label: 'Clientes' },
            { href: `/cliente/${clienteId}`, label: cliente.nome },
        ],
        title: 'Importar',
        subtitle: 'O arquivo é lido aqui no navegador e descartado. Só o texto entra no sistema.',
        actions: `<a class="ds-btn ds-btn--ghost" href="/cliente/${esc(clienteId)}">
                      <i data-lucide="arrow-left"></i> Voltar ao cronograma
                  </a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    // ─────────────────────────────────────────────────────────────────────
    const desenhar = () => {
        content.innerHTML = `
            <div class="vz-filtros im-modos" id="im-modos">
                ${Object.entries(MODOS).map(([id, m]) => `
                    <button class="vz-filtro ${id === modo ? 'is-active' : ''}" data-modo="${id}">
                        ${m.rotulo}
                    </button>`).join('')}
            </div>

            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">${esc(MODOS[modo].titulo)}</h2>
                        <span class="ds-card-sub">${esc(MODOS[modo].dica)}</span>
                    </div>
                </div>

                <label class="im-solta" id="im-solta">
                    <input type="file" id="im-arquivo" accept="application/pdf,.pdf,.txt" hidden>
                    <i data-lucide="file-up"></i>
                    <span class="im-solta__forte">Solte o PDF aqui ou clique para escolher</span>
                    <span class="im-solta__fraca">
                        PDF com texto (Google Docs, Word) ou arquivo .txt.
                        PDF escaneado não tem texto para ler — nesse caso, cole abaixo.
                    </span>
                </label>

                <details class="vz-saiba" ${texto && !origem ? 'open' : ''}>
                    <summary><i data-lucide="clipboard-paste"></i> Ou cole o texto</summary>
                    <div class="vz-saiba__corpo">
                        <textarea class="ds-input im-colar" id="im-colar" rows="6"
                                  placeholder="Cole aqui o conteúdo do documento…"></textarea>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="im-ler-colado">
                            <i data-lucide="wand-sparkles"></i> Ler o texto colado
                        </button>
                    </div>
                </details>

                <div id="im-estado"></div>
            </article>

            <div id="im-revisao"></div>
        `;

        ligarOrigem();
        if (leitura) desenharRevisao();
        if (window.lucide) lucide.createIcons();
    };

    // ── Origem do texto ──────────────────────────────────────────────────
    function ligarOrigem() {
        content.querySelector('#im-modos').addEventListener('click', (e) => {
            const b = e.target.closest('[data-modo]');
            if (!b || b.dataset.modo === modo) return;
            modo = b.dataset.modo;
            // O texto continua, a leitura não: os dois parsers entendem coisas
            // diferentes do mesmo arquivo, e mostrar a leitura antiga sob o
            // rótulo novo seria mentira.
            leitura = null;
            selecao = new Set();
            if (texto) processar();
            else desenhar();
        });

        const arquivo = content.querySelector('#im-arquivo');
        const solta = content.querySelector('#im-solta');

        arquivo.addEventListener('change', () => {
            if (arquivo.files?.[0]) carregar(arquivo.files[0]);
            arquivo.value = '';
        });

        // Arrastar e soltar. `dragover` precisa cancelar o padrão, senão o
        // navegador abre o PDF numa aba e a página some com o trabalho junto.
        ['dragenter', 'dragover'].forEach(ev => solta.addEventListener(ev, (e) => {
            e.preventDefault();
            solta.classList.add('is-sobre');
        }));
        ['dragleave', 'drop'].forEach(ev => solta.addEventListener(ev, (e) => {
            e.preventDefault();
            solta.classList.remove('is-sobre');
        }));
        solta.addEventListener('drop', (e) => {
            const f = e.dataTransfer?.files?.[0];
            if (f) carregar(f);
        });

        content.querySelector('#im-ler-colado').addEventListener('click', () => {
            const t = content.querySelector('#im-colar').value.trim();
            if (!t) { estado('erro', 'Cole o texto antes.'); return; }
            texto = t;
            origem = '';
            processar();
        });
    }

    const estado = (tom, msg) => {
        const el = content.querySelector('#im-estado');
        if (!el) return;
        el.innerHTML = msg
            ? `<p class="im-estado im-estado--${tom}">
                   <i data-lucide="${tom === 'erro' ? 'triangle-alert' : tom === 'ok' ? 'circle-check' : 'loader'}"></i>
                   ${esc(msg)}
               </p>`
            : '';
        if (window.lucide) lucide.createIcons();
    };

    async function carregar(arquivo) {
        estado('info', `Lendo ${arquivo.name}…`);
        try {
            const buffer = await arquivo.arrayBuffer();
            if (ehPDF(buffer)) {
                texto = await textoDoPDF(buffer);
                if (!texto.trim()) {
                    estado('erro', 'Este PDF não tem camada de texto — provavelmente é um documento '
                                 + 'escaneado. Abra o original e cole o texto no campo abaixo.');
                    return;
                }
            } else {
                texto = new TextDecoder().decode(buffer);
            }
            origem = arquivo.name;
            processar();
        } catch (e) {
            console.error('[importar] falha ao ler o arquivo:', e);
            estado('erro', 'Não consegui ler este arquivo. Tente colar o texto.');
        }
    }

    function processar() {
        leitura = modo === 'temas' ? lerTemas(texto) : lerRoteiros(texto, conteudos);
        selecao = new Set();

        if (modo === 'temas') {
            // Padrão: quatro semanas, ou seja, os quatro primeiros temas de
            // cada fase. Marcar os oitenta de uma vez encheria oito meses de
            // cronograma num clique — e desmarcar setenta é mais trabalho que
            // marcar mais alguns.
            marcarSemanas(4);
        } else {
            // Só o que já tem conteúdo ligado nasce marcado. O que ficou sem
            // ligação precisa de uma escolha humana antes de poder entrar.
            leitura.roteiros.forEach((r, i) => { if (r.conteudo) selecao.add(String(i)); });
        }
        desenhar();
        estado('ok', origem
            ? `${origem} lido. O arquivo não foi guardado.`
            : 'Texto lido.');
    }

    // ═══════════════════════════════════════════════════════════════════
    // REVISÃO — TEMAS
    // ═══════════════════════════════════════════════════════════════════

    const chaveTema = (fase, numero) => `${fase}#${numero}`;

    const porFase = () => {
        const m = {};
        for (const s of leitura.secoes || []) m[s.fase] = s;
        return m;
    };

    /** Marca os N primeiros temas de cada fase — "N semanas". */
    function marcarSemanas(n) {
        selecao = new Set();
        for (const s of leitura.secoes || []) {
            s.temas.slice(0, n).forEach(t => selecao.add(chaveTema(s.fase, t.numero)));
        }
    }

    /**
     * Distribui o que está marcado pelas semanas, seguindo o Funil Invertido.
     *
     * Semana 1 recebe o primeiro fundo na segunda, o primeiro meio na quarta e
     * o primeiro topo na sexta; semana 2 recebe os próximos, e assim por
     * diante. O número de semanas é o da fase com mais temas marcados — uma
     * fase que acabar antes simplesmente deixa aquele dia vazio, e a fita de
     * cobertura no cronograma mostra o buraco.
     */
    function agendar() {
        const dias = { fundo: 0, meio: 2, topo: 4 };
        const fila = {};
        for (const s of leitura.secoes || []) {
            const temasDaSecao = s.temas.filter(t => selecao.has(chaveTema(s.fase, t.numero)));
            fila[s.fase] = [...(fila[s.fase] || []), ...temasDaSecao];
        }
        const semanas = Math.max(0, ...Object.values(fila).map(f => f.length));
        const plano = [];
        for (let semana = 0; semana < semanas; semana++) {
            for (const fase of ['fundo', 'meio', 'topo']) {
                const tema = fila[fase]?.[semana];
                if (!tema) continue;
                plano.push({
                    fase, tema,
                    data: somarDias(inicioSemana, semana * 7 + dias[fase]),
                    secao: (leitura.secoes || []).find(s => s.fase === fase),
                });
            }
        }
        return { plano, semanas };
    }

    function desenharRevisaoTemas() {
        const alvo = content.querySelector('#im-revisao');
        const { plano, semanas } = agendar();
        const secoes = leitura.secoes || [];

        alvo.innerHTML = `
            ${leitura.avisos.length ? `
                <article class="ds-card vz-secao">
                    ${leitura.avisos.map(a => `<p class="im-aviso"><i data-lucide="triangle-alert"></i> ${esc(a)}</p>`).join('')}
                </article>` : ''}

            ${leitura.total ? `
                <article class="ds-card vz-secao">
                    <div class="vz-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">O que eu entendi</h2>
                            <span class="ds-card-sub">
                                ${leitura.total} temas em ${secoes.length} seções${
                                    Object.keys(leitura.formatos).length
                                        ? ` · formato por fase lido do documento: ${
                                            Object.entries(leitura.formatos)
                                                .map(([f, v]) => `${esc(v)} no ${esc(f)}`).join(', ')}`
                                        : ''}
                            </span>
                        </div>
                    </div>

                    <div class="im-quando">
                        <label class="im-campo">
                            <span>Primeira semana</span>
                            <input class="ds-input" type="date" id="im-inicio" value="${esc(inicioSemana)}">
                        </label>
                        <p class="im-quando__nota">
                            Fundo na segunda, meio na quarta, topo na sexta — o Funil Invertido.
                            A data escolhida sempre cai na segunda-feira daquela semana.
                        </p>
                    </div>

                    <div class="im-atalhos">
                        <span class="vz-rotulo">Marcar</span>
                        ${[1, 2, 4, 8].map(n => `<button class="im-atalho" data-semanas="${n}">${n} semana${n > 1 ? 's' : ''}</button>`).join('')}
                        <button class="im-atalho" data-semanas="999">tudo</button>
                        <button class="im-atalho" data-semanas="0">nada</button>
                    </div>

                    ${secoes.map(secaoHTML).join('')}
                </article>` : ''}

            ${plano.length ? `
                <article class="ds-card im-fechar">
                    <div class="im-fechar__texto">
                        <strong>${plano.length} conteúdo${plano.length > 1 ? 's' : ''}</strong>
                        em ${semanas} semana${semanas > 1 ? 's' : ''},
                        de ${esc(dataBR(plano[0].data))} a ${esc(dataBR(plano[plano.length - 1].data))}.
                        Entram como <strong>rascunho</strong> — o cliente só vê depois que você liberar.
                    </div>
                    <button class="ds-btn ds-btn--primary" id="im-gravar">
                        <i data-lucide="download"></i> Importar ${plano.length}
                    </button>
                </article>` : ''}
        `;

        // ── Eventos ──────────────────────────────────────────────────────
        alvo.querySelector('#im-inicio')?.addEventListener('change', (e) => {
            // Encaixa na segunda: um cronograma que começa numa quinta quebra
            // a posição de todas as fases da primeira semana.
            inicioSemana = segundaDa(e.target.value || hoje());
            desenharRevisao();
        });

        alvo.querySelectorAll('[data-semanas]').forEach(b =>
            b.addEventListener('click', () => {
                marcarSemanas(Number(b.dataset.semanas));
                desenharRevisao();
            }));

        alvo.querySelectorAll('[data-tema]').forEach(cx =>
            cx.addEventListener('change', () => {
                if (cx.checked) selecao.add(cx.dataset.tema);
                else selecao.delete(cx.dataset.tema);
                desenharRevisao();
            }));

        alvo.querySelectorAll('[data-objetivo-de]').forEach(sel =>
            sel.addEventListener('change', () => {
                const s = secoes.find(x => x.fase === sel.dataset.objetivoDe);
                if (s) s.objetivo = sel.value || null;
            }));

        alvo.querySelector('#im-gravar')?.addEventListener('click', (e) => gravarTemas(e, plano));

        if (window.lucide) lucide.createIcons();
    }

    const secaoHTML = (s) => {
        const eixos = [];
        for (const t of s.temas) {
            const nome = t.eixo || '';
            if (!eixos.length || eixos[eixos.length - 1].nome !== nome) eixos.push({ nome, temas: [] });
            eixos[eixos.length - 1].temas.push(t);
        }
        const marcados = s.temas.filter(t => selecao.has(chaveTema(s.fase, t.numero))).length;

        return `
            <section class="im-secao">
                <header class="im-secao__cabeca">
                    ${chipFase(s.fase)}
                    <span class="im-secao__conta">${marcados} de ${s.temas.length} marcados</span>
                    <label class="im-campo im-campo--obj">
                        <span>Objetivo</span>
                        <select class="ds-input" data-objetivo-de="${esc(s.fase)}">
                            ${objetivosDaFase(s.fase).map(o => `
                                <option value="${esc(o.id)}" ${o.id === s.objetivo ? 'selected' : ''}>
                                    ${esc(o.nome)}${o._leitura === 'natural' ? '' : o._leitura === 'conflito' ? ' (em conflito)' : ' (exige cuidado)'}
                                </option>`).join('')}
                        </select>
                    </label>
                </header>

                ${s.objetivoTexto ? `
                    <p class="im-secao__declarado">
                        O documento diz: “${esc(s.objetivoTexto)}”
                    </p>` : ''}

                ${eixos.map(g => `
                    <div class="im-eixo">
                        ${g.nome ? `<span class="vz-rotulo">${esc(g.nome)}</span>` : ''}
                        ${g.temas.map(t => temaHTML(s.fase, t)).join('')}
                    </div>`).join('')}
            </section>`;
    };

    const temaHTML = (fase, t) => {
        const chave = chaveTema(fase, t.numero);
        const marcado = selecao.has(chave);
        return `
            <label class="im-item ${marcado ? 'is-marcado' : ''}">
                <input type="checkbox" data-tema="${esc(chave)}" ${marcado ? 'checked' : ''}>
                <span class="im-item__num">${t.numero}</span>
                <span class="im-item__texto">${esc(t.titulo)}</span>
                ${t.divergencia ? `
                    <span class="im-item__alerta"
                          title="O texto tem mais sinais de ${esc(nomeFase(t.divergencia.fase).toLowerCase())}. O documento diz ${esc(nomeFase(fase).toLowerCase())}, e é ele que vale — confira se estiver em dúvida.">
                        <i data-lucide="triangle-alert"></i> parece ${esc(t.divergencia.fase)}
                    </span>` : ''}
            </label>`;
    };

    async function gravarTemas(e, plano) {
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Importando…';
        try {
            /* Um por vez, sem Promise.all: o adaptador local grava a coleção
               inteira a cada salvar, e disparar oitenta em paralelo faz a
               última escrita sobrescrever as setenta e nove anteriores. */
            for (const p of plano) {
                await store.conteudos.salvar({
                    cliente_id: clienteId,
                    titulo: p.tema.titulo,
                    tema: p.tema.eixo || null,
                    fase: p.fase,
                    objetivo: p.secao?.objetivo || null,
                    formato: leitura.formatos[p.fase] || null,
                    canal: null,
                    data: p.data,
                    data_original: p.data,
                    status: 'rascunho',
                    intencao: p.secao?.objetivoTexto || null,
                    nota: null,
                    revisado: false,
                });
            }
            toast(`${plano.length} conteúdo(s) importado(s) como rascunho.`);
            navegar(`/cliente/${clienteId}`);
        } catch (err) {
            console.error('[importar] falha ao gravar temas:', err);
            toast('Não foi possível importar. Nada foi perdido — tente de novo.');
            b.disabled = false;
            b.textContent = `Importar ${plano.length}`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // REVISÃO — ROTEIROS
    // ═══════════════════════════════════════════════════════════════════

    function desenharRevisaoRoteiros() {
        const alvo = content.querySelector('#im-revisao');
        const escolhidos = leitura.roteiros.filter((r, i) => selecao.has(String(i)) && (r.conteudo || r.criarNovo));

        alvo.innerHTML = `
            ${leitura.avisos.length ? `
                <article class="ds-card vz-secao">
                    ${leitura.avisos.map(a => `<p class="im-aviso"><i data-lucide="triangle-alert"></i> ${esc(a)}</p>`).join('')}
                </article>` : ''}

            ${leitura.roteiros.length ? `
                <article class="ds-card vz-secao">
                    <div class="vz-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">Roteiros reconhecidos</h2>
                            <span class="ds-card-sub">
                                ${leitura.roteiros.length} no documento ·
                                ${leitura.roteiros.filter(r => r.conteudo).length} ligados a um conteúdo do cronograma
                            </span>
                        </div>
                    </div>
                    ${leitura.roteiros.map(roteiroHTML).join('')}
                </article>` : `
                <article class="ds-card vz-secao">
                    ${vazioHTML('unlink', 'Não achei nenhum roteiro',
                        'Cada roteiro precisa começar por um título numa linha só — em caixa alta, '
                      + 'começando com "ROTEIRO", ou repetindo o título do tema. É por ele que o '
                      + 'sistema sabe onde um roteiro termina e o outro começa.')}
                </article>`}

            ${leitura.soltos.length ? `
                <details class="vz-saiba">
                    <summary><i data-lucide="file-question"></i> ${leitura.soltos.length} linha(s) fora de qualquer roteiro</summary>
                    <div class="vz-saiba__corpo">
                        <p class="vz-nota">
                            Vieram antes do primeiro título reconhecido. Costuma ser capa, índice ou
                            cabeçalho do documento — mas se houver roteiro aqui, ele não foi importado.
                        </p>
                        <pre class="im-soltos">${esc(leitura.soltos.slice(0, 40).join('\n'))}</pre>
                    </div>
                </details>` : ''}

            ${escolhidos.length ? `
                <article class="ds-card im-fechar">
                    <div class="im-fechar__texto">
                        <strong>${escolhidos.length} roteiro${escolhidos.length > 1 ? 's' : ''}</strong>
                        com ${escolhidos.reduce((t, r) => t + r.blocos.length, 0)} blocos no total.
                        ${escolhidos.filter(r => r.criarNovo).length
                            ? `<span>${escolhidos.filter(r => r.criarNovo).length} conteúdo(s) serão criados como rascunho.</span>`
                            : ''}
                        ${escolhidos.some(r => r.conteudo && temRoteiro(r.conteudo.id))
                            ? '<span class="im-perigo">Os blocos que já existirem nesses conteúdos serão substituídos.</span>'
                            : ''}
                    </div>
                    <button class="ds-btn ds-btn--primary" id="im-gravar-roteiros">
                        <i data-lucide="download"></i> Importar ${escolhidos.length}
                    </button>
                </article>` : ''}
        `;

        alvo.querySelectorAll('[data-roteiro]').forEach(cx =>
            cx.addEventListener('change', () => {
                if (cx.checked) selecao.add(cx.dataset.roteiro);
                else selecao.delete(cx.dataset.roteiro);
                desenharRevisao();
            }));

        alvo.querySelectorAll('[data-alvo]').forEach(sel =>
            sel.addEventListener('change', () => {
                const i = sel.dataset.alvo;
                const r = leitura.roteiros[Number(i)];

                if (sel.value === '__novo__') {
                    /* Roteiro que chega antes do tema. Acontece — a social
                       mídia escreve o roteiro assim que a ideia aparece, sem
                       esperar o cronograma do mês fechar. Em vez de obrigar a
                       cadastrar o conteúdo antes, o conteúdo nasce aqui, com a
                       fase que o classificador sugeriu a partir do próprio
                       texto e a próxima vaga livre daquela fase na semana. */
                    r.conteudo = null;
                    r.criarNovo = novoConteudoPara(r);
                    r.certeza = null;
                    selecao.add(i);
                } else {
                    r.criarNovo = null;
                    r.conteudo = conteudos.find(c => c.id === sel.value) || null;
                    if (r.conteudo) {
                        // Escolha à mão é certeza por definição — quem escolheu
                        // foi gente, não o cálculo de semelhança.
                        r.certeza = 'manual';
                        selecao.add(i);
                    } else {
                        selecao.delete(i);
                    }
                }
                desenharRevisao();
            }));

        alvo.querySelectorAll('[data-novo-campo]').forEach(campo =>
            campo.addEventListener('change', () => {
                const r = leitura.roteiros[Number(campo.dataset.novoIdx)];
                if (!r?.criarNovo) return;
                r.criarNovo[campo.dataset.novoCampo] = campo.value || null;
                // Trocar a fase reescreve o objetivo e a data sugeridos: os
                // três andam juntos no Funil Invertido, e deixar a data de
                // segunda num conteúdo de topo seria propor o erro que o
                // sistema avisa depois.
                if (campo.dataset.novoCampo === 'fase') {
                    r.criarNovo.objetivo = objetivosDaFase(campo.value)[0]?.id || null;
                    r.criarNovo.data = vagaPara(campo.value, r);
                }
                desenharRevisao();
            }));

        alvo.querySelector('#im-gravar-roteiros')?.addEventListener('click', (e) => gravarRoteiros(e, escolhidos));

        if (window.lucide) lucide.createIcons();
    }

    let blocosExistentes = null;
    const temRoteiro = (conteudoId) => (blocosExistentes || []).some(b => b.conteudo_id === conteudoId);

    /**
     * A próxima data livre para uma fase, respeitando o Funil Invertido.
     *
     * Olha o cronograma que já existe e o que as outras criações desta mesma
     * importação já ocuparam — sem isso, dois roteiros novos de topo cairiam
     * na mesma sexta-feira e o conflito só apareceria depois de gravar.
     */
    function vagaPara(fase, exceto) {
        const dias = { fundo: 0, meio: 2, topo: 4 };
        const ocupadas = new Set([
            ...conteudos.filter(c => c.fase === fase).map(c => c.data),
            ...leitura.roteiros
                .filter(r => r !== exceto && r.criarNovo?.fase === fase)
                .map(r => r.criarNovo.data),
        ]);
        let semana = segundaDa(hoje());
        for (let i = 0; i < 60; i++) {
            const d = somarDias(semana, dias[fase] ?? 0);
            if (d >= hoje() && !ocupadas.has(d)) return d;
            semana = somarDias(semana, 7);
        }
        return somarDias(segundaDa(hoje()), 7);
    }

    /** Rascunho de conteúdo novo, já com a fase que o texto sugere. */
    function novoConteudoPara(r) {
        const texto = [r.titulo, r.blocos[0]?.texto].filter(Boolean).join('. ');
        const sugestao = classificar(texto);
        const fase = sugestao?.fase || 'meio';
        return {
            titulo: r.titulo,
            fase,
            objetivo: objetivosDaFase(fase)[0]?.id || null,
            data: vagaPara(fase, r),
            sugerida: !!sugestao,
        };
    }

    const roteiroHTML = (r, i) => {
        const ligado = !!(r.conteudo || r.criarNovo);
        const marcado = selecao.has(String(i)) && ligado;
        const tipos = {};
        for (const b of r.blocos) tipos[b.tipo] = (tipos[b.tipo] || 0) + 1;

        return `
            <section class="im-roteiro ${marcado ? 'is-marcado' : ''} ${ligado ? '' : 'is-solto'}">
                <label class="im-roteiro__cabeca">
                    <input type="checkbox" data-roteiro="${i}" ${marcado ? 'checked' : ''}
                           ${ligado ? '' : 'disabled'}>
                    <span class="im-roteiro__info">
                        <span class="im-roteiro__titulo">${esc(r.titulo)}</span>
                        <span class="im-roteiro__meta">
                            <span>${r.blocos.length} blocos</span>
                            <span>${Object.entries(tipos).map(([t, n]) => `${n} ${tipoBloco(t).nome.toLowerCase()}`).join(', ')}</span>
                            ${r.conteudo && temRoteiro(r.conteudo.id) ? '<span class="im-perigo">já tem roteiro</span>' : ''}
                        </span>
                    </span>
                    ${r.certeza ? `<span class="im-certeza im-certeza--${esc(r.certeza)}">ligação ${esc(r.certeza)}</span>` : ''}
                </label>

                <!-- O seletor existe porque o título do roteiro é apelido, não
                     o título do tema. Quando o cálculo de semelhança erra ou
                     não acha nada, a ligação é feita aqui, à mão, e é isso que
                     torna a importação confiável mesmo com documento livre. -->
                <label class="im-roteiro__alvo">
                    <span>Vai para</span>
                    <select class="ds-input" data-alvo="${i}">
                        <option value="">— não importar este —</option>
                        <option value="__novo__" ${r.criarNovo ? 'selected' : ''}>
                            + Criar conteúdo novo com este título
                        </option>
                        ${conteudos.map(c => `
                            <option value="${esc(c.id)}" ${c.id === r.conteudo?.id ? 'selected' : ''}>
                                ${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))} · ${esc(c.titulo)}
                            </option>`).join('')}
                    </select>
                </label>

                ${r.criarNovo ? novoConteudoHTML(r, i) : ''}

                <p class="im-roteiro__previa">${esc(previaBlocos(r.blocos))}</p>
            </section>`;
    };

    /* Os três campos que um conteúdo precisa para nascer com sentido. Não é o
       formulário inteiro de propósito: formato, canal e intenção têm padrão
       aceitável e podem esperar. Fase, objetivo e data, não — sem eles o
       conteúdo entra sem leitura estratégica, que é o motivo de o sistema
       existir. */
    const novoConteudoHTML = (r, i) => `
        <div class="im-novo">
            <div class="im-novo__aviso">
                <i data-lucide="sparkles"></i>
                ${r.criarNovo.sugerida
                    ? 'Fase sugerida pelo texto do roteiro. Confira antes de gravar.'
                    : 'O texto não deu sinal de fase. Escolha você.'}
            </div>
            <div class="im-novo__campos">
                <label class="im-campo">
                    <span>Fase</span>
                    <select class="ds-input" data-novo-campo="fase" data-novo-idx="${i}">
                        ${['fundo', 'meio', 'topo'].map(f => `
                            <option value="${f}" ${f === r.criarNovo.fase ? 'selected' : ''}>${esc(nomeFase(f))}</option>`).join('')}
                    </select>
                </label>
                <label class="im-campo">
                    <span>Objetivo</span>
                    <select class="ds-input" data-novo-campo="objetivo" data-novo-idx="${i}">
                        ${objetivosDaFase(r.criarNovo.fase).map(o => `
                            <option value="${esc(o.id)}" ${o.id === r.criarNovo.objetivo ? 'selected' : ''}>
                                ${esc(o.nome)}${o._leitura === 'natural' ? '' : o._leitura === 'conflito' ? ' (em conflito)' : ' (exige cuidado)'}
                            </option>`).join('')}
                    </select>
                </label>
                <label class="im-campo">
                    <span>Publicação</span>
                    <input class="ds-input" type="date" data-novo-campo="data" data-novo-idx="${i}"
                           value="${esc(r.criarNovo.data)}">
                </label>
            </div>
        </div>`;

    const previaBlocos = (blocos) => {
        const t = blocos.map(b => b.texto || b.titulo || '').join(' · ').replace(/\s+/g, ' ').trim();
        return t.length > 190 ? `${t.slice(0, 190)}…` : t;
    };

    async function gravarRoteiros(e, escolhidos) {
        const b = e.target.closest('button');
        b.disabled = true;
        b.textContent = 'Importando…';
        try {
            let criados = 0;
            for (const r of escolhidos) {
                let destino = r.conteudo;

                if (r.criarNovo) {
                    /* Nasce como rascunho, igual a tudo que a importação cria:
                       o cliente só vê depois que alguém liberar. O formato fica
                       em branco — este documento não diz qual é, e chutar
                       "Reel" seria inventar. */
                    destino = await store.conteudos.salvar({
                        cliente_id: clienteId,
                        titulo: r.criarNovo.titulo,
                        tema: null,
                        fase: r.criarNovo.fase,
                        objetivo: r.criarNovo.objetivo,
                        formato: null,
                        canal: null,
                        data: r.criarNovo.data,
                        data_original: r.criarNovo.data,
                        status: 'rascunho',
                        intencao: null,
                        nota: null,
                        revisado: false,
                    });
                    criados++;
                }

                // Substituir e não somar: importar o mesmo documento duas vezes
                // duplicaria o roteiro inteiro, e ninguém percebe isso até
                // abrir a tela e ver o texto repetido.
                for (const antigo of (blocosExistentes || []).filter(x => x.conteudo_id === destino.id)) {
                    await store.blocos.excluir(antigo.id);
                }
                let ordem = 10;
                for (const bloco of r.blocos) {
                    await store.blocos.salvar({
                        conteudo_id: destino.id,
                        tipo: bloco.tipo,
                        titulo: bloco.titulo || null,
                        texto: bloco.texto || null,
                        ordem,
                    });
                    ordem += 10;
                }
            }
            toast(criados
                ? `${escolhidos.length} roteiro(s) importado(s), ${criados} conteúdo(s) criado(s).`
                : `${escolhidos.length} roteiro(s) importado(s).`);
            navegar(`/cliente/${clienteId}`);
        } catch (err) {
            console.error('[importar] falha ao gravar roteiros:', err);
            toast('Não foi possível importar. Tente de novo.');
            b.disabled = false;
            b.textContent = `Importar ${escolhidos.length}`;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    function desenharRevisao() {
        if (modo === 'temas') desenharRevisaoTemas();
        else desenharRevisaoRoteiros();
    }

    blocosExistentes = await store.blocos.listar();
    desenhar();
};

/** Segunda-feira da PRÓXIMA semana — o começo natural de um cronograma novo. */
const proximaSegunda = () => somarDias(segundaDa(hoje()), 7);

const ESTILOS = `
<style>
.im-modos { padding: 0; }

/* ── Área de soltar ──────────────────────────────────────────────────── */
.im-solta {
    display: flex; flex-direction: column; align-items: center; gap: var(--space-2);
    padding: var(--space-10) var(--space-5);
    border: 1px dashed var(--border-default); border-radius: var(--radius-md);
    background: var(--surface-3); cursor: pointer; text-align: center;
    transition: border-color var(--dur-fast), background-color var(--dur-fast);
}
.im-solta:hover, .im-solta.is-sobre { border-color: var(--accent); background: var(--accent-muted); }
.im-solta i, .im-solta svg { width: 26px; height: 26px; color: var(--accent); }
.im-solta__forte { font-size: var(--text-body); font-weight: 600; color: var(--text-primary); }
.im-solta__fraca { font-size: var(--text-xs); color: var(--text-tertiary); max-width: 52ch; line-height: var(--leading-body); }

.im-colar { height: auto; padding: var(--space-3) var(--space-4); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }

.im-estado {
    display: flex; align-items: center; gap: var(--space-2);
    margin: 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); font-size: var(--text-sm);
    background: var(--surface-3); color: var(--text-secondary);
}
.im-estado i, .im-estado svg { width: 15px; height: 15px; flex-shrink: 0; }
.im-estado--ok   { background: var(--success-muted); color: var(--success); }
.im-estado--erro { background: var(--danger-muted);  color: var(--danger); }

.im-aviso {
    display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
    padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
    background: var(--warning-muted); color: var(--warning);
    font-size: var(--text-sm); line-height: var(--leading-body);
}
.im-aviso i, .im-aviso svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }

/* ── Agendamento ─────────────────────────────────────────────────────── */
.im-quando { display: flex; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; }
.im-campo { display: flex; flex-direction: column; gap: var(--space-2); }
.im-campo > span { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
.im-campo--obj { margin-left: auto; min-width: 240px; }
.im-quando__nota { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); max-width: 48ch; }

.im-atalhos { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.im-atalho {
    height: 30px; padding: 0 var(--space-4);
    border: 1px solid var(--border-default); border-radius: var(--radius-pill);
    background: transparent; color: var(--text-secondary);
    font-family: var(--font-sans); font-size: var(--text-xs); font-weight: 500; cursor: pointer;
    transition: border-color var(--dur-fast), color var(--dur-fast);
}
.im-atalho:hover { border-color: var(--accent); color: var(--accent); }

/* ── Seções e itens ──────────────────────────────────────────────────── */
.im-secao { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); }
.im-secao__cabeca { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.im-secao__conta { font-size: var(--text-xs); color: var(--text-tertiary); }
.im-secao__declarado { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); font-style: italic; }
.im-eixo { display: flex; flex-direction: column; gap: 3px; }
.im-eixo .vz-rotulo { margin-top: var(--space-2); }

.im-item {
    display: flex; align-items: flex-start; gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px solid transparent; border-radius: var(--radius-sm);
    cursor: pointer; font-size: var(--text-sm); line-height: var(--leading-body);
    color: var(--text-tertiary);
    transition: background-color var(--dur-fast), color var(--dur-fast);
}
.im-item:hover { background: var(--surface-3); }
/* Marcado ganha COR, não só a caixinha: numa lista de oitenta linhas, o que
   entra e o que não entra precisa ser visível de longe. */
.im-item.is-marcado { color: var(--text-primary); background: var(--surface-3); border-color: var(--border-subtle); }
.im-item input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
.im-item__num { font-size: var(--text-xs); color: var(--text-disabled); min-width: 22px; font-variant-numeric: tabular-nums; }
.im-item__texto { flex: 1; min-width: 0; }
.im-item__alerta {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
    font-size: var(--text-xs); color: var(--warning);
}
.im-item__alerta i, .im-item__alerta svg { width: 12px; height: 12px; }

/* ── Roteiros ────────────────────────────────────────────────────────── */
.im-roteiro {
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-3);
}
.im-roteiro.is-marcado { border-color: var(--accent-border); background: var(--accent-muted); }
/* Sem ligação não é erro, é uma decisão pendente: o roteiro foi lido inteiro e
   só falta dizer a quem pertence. Borda tracejada em vez de cor de alerta. */
.im-roteiro.is-solto { border-style: dashed; background: transparent; }
.im-roteiro__alvo { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.im-roteiro__alvo > span { font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.im-roteiro__alvo select { flex: 1; min-width: 240px; }

/* ── Conteúdo novo a partir do roteiro ───────────────────────────────── */
.im-novo {
    display: flex; flex-direction: column; gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--accent-muted); border: 1px solid var(--accent-border);
}
.im-novo__aviso {
    display: flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-xs); color: var(--accent); font-weight: 600;
}
.im-novo__aviso i, .im-novo__aviso svg { width: 14px; height: 14px; }
.im-novo__campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--space-3); }
.im-roteiro__cabeca { display: flex; align-items: flex-start; gap: var(--space-3); cursor: pointer; }
.im-roteiro__cabeca input { margin-top: 3px; width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
.im-roteiro__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.im-roteiro__titulo { font-size: var(--text-body); font-weight: 600; color: var(--text-primary); }
.im-roteiro__meta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-xs); color: var(--text-tertiary); }
.im-roteiro__meta > *:not(:last-child)::after { content: '·'; margin-left: var(--space-2); color: var(--text-disabled); }
.im-roteiro__origem { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); font-style: italic; }
.im-roteiro__previa { margin: 0; font-size: var(--text-sm); color: var(--text-tertiary); line-height: var(--leading-body); }

.im-certeza { flex-shrink: 0; font-size: var(--text-xs); font-weight: 600; padding: 2px var(--space-3); border-radius: var(--radius-pill); }
.im-certeza--alta   { background: var(--success-muted); color: var(--success); }
.im-certeza--média  { background: var(--warning-muted); color: var(--warning); }
.im-certeza--baixa  { background: var(--danger-muted);  color: var(--danger); }
.im-certeza--manual { background: var(--accent-muted);  color: var(--accent); }

.im-soltos {
    margin: 0; padding: var(--space-3); max-height: 260px; overflow: auto;
    background: var(--surface-3); border-radius: var(--radius-sm);
    font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary);
    white-space: pre-wrap;
}

.im-perigo { color: var(--danger); font-weight: 600; }

/* ── Barra de conclusão ──────────────────────────────────────────────── */
.im-fechar {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-4) var(--space-5);
}
.im-fechar__texto { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); max-width: 66ch; }
.im-fechar__texto strong { color: var(--text-primary); }

@media (max-width: 720px) {
    .im-campo--obj { margin-left: 0; width: 100%; }
    .im-fechar .ds-btn { width: 100%; }
    .im-solta { padding: var(--space-8) var(--space-4); }
}
</style>
`;
