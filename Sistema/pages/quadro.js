import { store } from '../store.js';
import { abrirBancoDeTemas } from './cronograma.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { ativarArraste } from '../lib/arrastar.js';
import { nomeFase, noDiaCerto } from '../lib/diretorio.js';
import { chipEtiqueta, injectEstilosEtiqueta } from '../lib/etiquetas.js';
import { chipFase, chipStatus, seloDeslocado, vazioHTML } from '../lib/pecas.js';
import {
    porData, leituraDeslocamento, deslocado, moverPara, fixarPosicao, DIAS_DA_FASE,
} from '../lib/cronograma.js';
import {
    esc, mesExtenso, somarMeses, chaveMes, semanaCurta, semanaAtual,
    semanasDoMes, somarDias, diaCurto, nomeDiaCurto, indiceDia, mesAtual,
} from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   QUADRO — o mês inteiro, semanas × fases.

   O cronograma em lista responde "o que vem nesta semana". Esta tela responde
   outra pergunta: "como o mês está distribuído" — e é onde o remanejamento
   acontece, porque mover exige ver origem e destino ao mesmo tempo.

   ── AS COLUNAS SÃO POSIÇÃO, NÃO FASE ──────────────────────────────────────
   Decisão que estrutura a tela inteira. As três colunas são as VAGAS da semana
   no Funil Invertido — início (seg/ter), meio (qua/qui) e fim (sex a dom) — e
   cada conteúdo aparece na coluna do dia em que está marcado.

   A alternativa seria agrupar por fase. Ela parece mais organizada e destrói o
   propósito: um conteúdo de fundo marcado na sexta apareceria na coluna de
   fundo, arrumadinho, e o problema ficaria invisível. Do jeito escolhido, ele
   aparece na coluna do fim de semana com o chip laranja de fundo no meio de
   chips magenta — e o erro se denuncia sozinho, sem ninguém precisar ler nada.

   ── DOIS JEITOS DE MOVER, E O SEGUNDO NÃO É REDUNDANTE ────────────────────
   Arrastar é o gesto natural. Selecionar dois e trocar existe porque arrastar
   falha em três situações reais: tela pequena onde origem e destino não cabem
   juntas, mão trêmula, e leitor de tela. Um sistema que só arrasta é um sistema
   que algumas pessoas não conseguem usar.
   ═══════════════════════════════════════════════════════════════════════════ */

/* As três vagas da semana. `dia` é o dia canônico — para onde o conteúdo vai
   quando é solto na coluna. `dias` é o intervalo que a coluna representa,
   direto de DIAS_DA_FASE: a estratégia define os dois, e repetir a definição
   aqui seria criar uma segunda fonte para a mesma verdade. */
const VAGAS = ['fundo', 'meio', 'topo'].map(fase => ({
    fase,
    dias: DIAS_DA_FASE[fase],
    dia: DIAS_DA_FASE[fase][0],
}));

const vagaDoDia = (iso) => VAGAS.find(v => v.dias.includes(indiceDia(iso))) || VAGAS[0];

/**
 * @param {string} [mesInicial] mês a abrir. Existe para o redesenho depois de
 *   uma troca voltar para o mês que estava na tela — sem ele, arrastar um
 *   conteúdo em outubro devolvia a pessoa para o mês corrente a cada
 *   movimento, e ela perdia o lugar no meio do trabalho.
 */
export const renderQuadro = async (container, clienteId, mesInicial = null) => {
    const { cliente, conteudos: todos } = await store.doCliente(clienteId);

    // O banco de temas sai das contas do quadro pelo mesmo motivo que sai das
    // do cronograma: conteúdo guardado não ocupa vaga (ver cronograma.js).
    const conteudos = todos.filter(c => !c.banco_em);
    const noBanco = todos.filter(c => c.banco_em)
        .sort((a, b) => String(b.banco_em).localeCompare(String(a.banco_em)));

    if (!cliente) {
        const { content } = renderShell(container, {
            path: '/', title: 'Cliente não encontrado',
            subtitle: 'O cadastro pode ter sido removido.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    /* O MÊS CORRENTE, sempre — e não o mês do último conteúdo cadastrado.
       `mesesComConteudo` devolve do mais recente para o mais antigo, então
       pegar o primeiro abria o quadro em março de 2027 quando havia pauta
       importada até lá. Quem abre o quadro quer ver a semana em que está. */
    let mes = mesInicial || mesAtual();
    let selecionado = null;     // id do primeiro conteúdo de uma troca por seleção
    let soltarArraste = null;

    const { content } = renderShell(container, {
        path: '/',
        crumbs: [
            { href: '/', label: 'Clientes' },
            { href: `/cliente/${clienteId}`, label: cliente.nome },
        ],
        title: 'Quadro do mês',
        subtitle: 'Arraste para mover ou trocar. No toque, segure o conteúdo por um instante antes de arrastar.',
        actions: `
            <button class="ds-btn ds-btn--ghost" id="qd-banco">
                <i data-lucide="archive"></i> Banco de temas
                ${noBanco.length ? `<span class="cr-conta">${noBanco.length}</span>` : ''}
            </button>
            <a class="ds-btn ds-btn--ghost" href="/cliente/${esc(clienteId)}">
                <i data-lucide="list"></i> Ver em lista
            </a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosEtiqueta();

    // Leva o mês junto: o redesenho depois de uma troca precisa voltar para
    // onde a pessoa estava, não para o mês corrente.
    const recarregar = () => renderQuadro(container, clienteId, mes);

    document.getElementById('qd-banco')?.addEventListener('click',
        () => abrirBancoDeTemas(cliente, noBanco, recarregar));

    // ── Movimento ────────────────────────────────────────────────────────
    /**
     * Aplica um movimento e oferece o desfazer.
     *
     * O desfazer não é enfeite: arraste é o gesto mais fácil de disparar sem
     * querer que existe numa interface, e sem volta atrás a pessoa passa a ter
     * medo de usar a tela.
     */
    async function aplicar({ alterados, desfazer }, mensagem) {
        if (!alterados.length) return;
        for (const c of alterados) await store.conteudos.salvar(c);

        toast(mensagem, {
            label: 'Desfazer',
            onClick: async () => {
                for (const c of desfazer) await store.conteudos.salvar(c);
                toast('Movimento desfeito.');
                recarregar();
            },
        });
        recarregar();
    }

    /** Move um conteúdo para a vaga (semana + coluna) indicada. */
    async function moverParaVaga(conteudoId, chaveVaga) {
        const c = conteudos.find(x => x.id === conteudoId);
        if (!c) return;

        const [segunda, faseVaga] = chaveVaga.split('|');
        const vaga = VAGAS.find(v => v.fase === faseVaga);
        const destino = somarDias(segunda, vaga.dia);

        /* Já ocupa a coluna certa nesta semana? Não mexe. Sem esta guarda, soltar
           um conteúdo de terça na própria coluna o empurraria para segunda —
           uma mudança que ninguém pediu e que reescreve a agenda em silêncio. */
        if (c.data === destino) return;
        if (vaga.dias.includes(indiceDia(c.data)) && chaveMes(c.data) === chaveMes(destino)
            && somarDias(c.data, -indiceDia(c.data)) === segunda) return;

        const ocupante = conteudos.find(x => x.id !== c.id && x.data === destino);
        await aplicar(
            moverPara(c, destino, conteudos),
            ocupante
                ? `"${curto(c.titulo)}" trocou de lugar com "${curto(ocupante.titulo)}".`
                : `"${curto(c.titulo)}" foi para ${diaCurto(destino)}.`,
        );
    }

    /** Troca dois conteúdos de data. É o caminho da seleção, sem arraste. */
    async function trocarSelecionados(idA, idB) {
        const a = conteudos.find(x => x.id === idA);
        const b = conteudos.find(x => x.id === idB);
        if (!a || !b || a.id === b.id) return;

        await aplicar({
            alterados: [{ ...a, data: b.data }, { ...b, data: a.data }],
            desfazer: [{ ...a }, { ...b }],
        }, `"${curto(a.titulo)}" e "${curto(b.titulo)}" trocaram de lugar.`);
    }

    // ── Desenho ──────────────────────────────────────────────────────────
    const desenhar = () => {
        const semanas = semanasDoMes(mes);
        const doMes = conteudos.filter(c => chaveMes(c.data) === mes);
        const deslocados = doMes.filter(deslocado);

        content.innerHTML = `
            <article class="ds-card vz-barra">
                <div class="vz-mes">
                    <button class="ds-icon-btn" id="qd-anterior" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                    <span class="vz-mes__rotulo">${esc(mesExtenso(mes))}</span>
                    <button class="ds-icon-btn" id="qd-proximo" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>
                </div>
                <span class="vz-barra__espaco"></span>
                <span class="qd-conta">
                    ${doMes.length} conteúdo${doMes.length === 1 ? '' : 's'}
                    ${deslocados.length ? ` · <span class="qd-conta__alerta">${deslocados.length} fora da posição de origem</span>` : ''}
                </span>
            </article>

            ${selecionado ? barraSelecao() : ''}

            ${doMes.length ? `
                <div class="qd-grade" id="qd-grade">
                    <div class="qd-cabeca">
                        <span class="qd-cabeca__canto"></span>
                        ${VAGAS.map(v => `
                            <span class="qd-cabeca__col qd-cabeca__col--${v.fase}">
                                <span class="vz-ponto vz-ponto--${v.fase}"></span>
                                ${esc(nomeFase(v.fase))}
                                <em>${esc(rotuloDias(v))}</em>
                            </span>`).join('')}
                    </div>
                    ${semanas.map(s => linhaSemana(s, conteudos)).join('')}
                </div>`
            : vazioHTML('layout-grid', 'Nada neste mês',
                'Importe os temas ou crie um conteúdo para o quadro ter o que mostrar.',
                `<a class="ds-btn ds-btn--primary" href="/cliente/${esc(clienteId)}">Ir para o cronograma</a>`)}

            ${deslocados.length ? painelDeslocados(deslocados) : ''}
        `;

        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    const linhaSemana = (segunda, todos) => {
        const atual = segunda === semanaAtual();
        return `
            <div class="qd-linha ${atual ? 'qd-linha--atual' : ''}">
                <div class="qd-semana">
                    <span class="qd-semana__rotulo">${esc(semanaCurta(segunda))}</span>
                    ${atual ? '<span class="qd-semana__agora">esta semana</span>' : ''}
                </div>
                ${VAGAS.map(v => celula(segunda, v, todos)).join('')}
            </div>`;
    };

    const celula = (segunda, vaga, todos) => {
        const dias = vaga.dias.map(d => somarDias(segunda, d));
        const dentro = porData(todos.filter(c => dias.includes(c.data)));

        return `
            <div class="qd-celula" data-solta="${esc(segunda)}|${esc(vaga.fase)}">
                ${dentro.map(c => cartao(c, todos)).join('')}
                ${dentro.length ? '' : '<span class="qd-vazia">vago</span>'}
            </div>`;
    };

    const cartao = (c, todos) => {
        const l = leituraDeslocamento(c, todos);
        const escolhido = selecionado === c.id;

        /* A borda vermelha NÃO depende de deslocamento, e essa distinção custou
           um teste para aparecer. `leituraDeslocamento` devolve null para quem
           nunca saiu do lugar — então um conteúdo CRIADO direto na coluna errada
           (um fundo agendado para sábado, que é o caso do exemplo) passava sem
           marca nenhuma no quadro. A pergunta que esta tela responde é "a fase
           bate com a coluna?", e ela vale para todo cartão, tenha ele se movido
           ou não. */
        const foraDeFase = !!c.fase && !noDiaCerto(c.fase, indiceDia(c.data));

        return `
            <article class="qd-cartao ${escolhido ? 'is-escolhido' : ''} ${foraDeFase ? 'qd-cartao--fora' : ''}"
                     data-arrastavel="${esc(c.id)}" data-cartao="${esc(c.id)}">
                <span class="vz-fita vz-fita--${esc(c.fase || '')}"></span>
                <div class="qd-cartao__corpo">
                    <div class="qd-cartao__topo">
                        <span class="qd-cartao__dia">${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}</span>
                        ${chipFase(c.fase, { curto: true })}
                    </div>
                    <h3 class="qd-cartao__titulo">${esc(c.titulo)}</h3>
                    <div class="qd-cartao__pe">
                        ${chipStatus(c.status)}
                        ${(c.etiquetas || []).map(chipEtiqueta).join('')}
                        ${seloDeslocado(l)}
                    </div>
                </div>
                <div class="qd-cartao__acoes">
                    <button class="ds-icon-btn ds-icon-btn--sm" data-trocar="${esc(c.id)}"
                            title="${escolhido ? 'Cancelar seleção' : 'Selecionar para trocar de lugar'}">
                        <i data-lucide="${escolhido ? 'x' : 'arrow-left-right'}"></i>
                    </button>
                    <button class="ds-icon-btn ds-icon-btn--sm" data-guardar="${esc(c.id)}"
                            title="Mandar para o banco de temas">
                        <i data-lucide="archive"></i>
                    </button>
                    <button class="ds-icon-btn ds-icon-btn--sm" data-abrir="${esc(c.id)}" title="Abrir o roteiro">
                        <i data-lucide="chevron-right"></i>
                    </button>
                </div>
            </article>`;
    };

    const barraSelecao = () => {
        const c = conteudos.find(x => x.id === selecionado);
        return `
            <article class="ds-card qd-selecao">
                <div class="qd-selecao__texto">
                    <strong>"${esc(curto(c?.titulo || '', 46))}"</strong> selecionado.
                    Agora clique no botão de troca de outro conteúdo para inverter os dois de lugar.
                </div>
                <button class="ds-btn ds-btn--ghost ds-btn--sm" id="qd-cancelar">Cancelar</button>
            </article>`;
    };

    /* A lista de deslocados existe porque o selo no cartão é curto por
       necessidade — cabe "trocado com X" e não cabe a história inteira. Aqui
       cada caso aparece por extenso, com o botão de aceitar a posição nova. */
    const painelDeslocados = (lista) => `
        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Fora da posição de origem</h2>
                    <span class="ds-card-sub">
                        ${lista.length} conteúdo${lista.length > 1 ? 's' : ''} remanejado${lista.length > 1 ? 's' : ''} neste mês
                    </span>
                </div>
            </div>
            <div class="qd-remanejados">
                ${porData(lista).map(c => {
                    const l = leituraDeslocamento(c, conteudos);
                    return `
                        <div class="qd-remanejado ${l.foraDeFase ? 'qd-remanejado--fora' : ''}">
                            <div class="qd-remanejado__info">
                                <span class="qd-remanejado__titulo">${esc(c.titulo)}</span>
                                <span class="qd-remanejado__conta">
                                    ${chipFase(c.fase, { curto: true })}
                                    nasceu em <b>${esc(diaCurto(l.de))}</b>, está em <b>${esc(diaCurto(l.para))}</b>${
                                        l.trocaMutua
                                            ? ` — troca direta com <b>"${esc(curto(l.ocupante.titulo, 40))}"</b>`
                                            : l.ocupante
                                                ? ` — quem ficou no lugar dele: <b>"${esc(curto(l.ocupante.titulo, 40))}"</b>`
                                                : ' — a vaga de origem ficou livre'}
                                </span>
                                ${l.foraDeFase ? `
                                    <span class="qd-remanejado__aviso">
                                        <i data-lucide="octagon-alert"></i>
                                        ${esc(nomeFase(c.fase))} numa posição de ${esc(nomeFase(l.faseDoDia || ''))} —
                                        a estratégia do dia não é a mesma do conteúdo.
                                    </span>` : ''}
                            </div>
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" data-fixar="${esc(c.id)}"
                                    title="Passa a considerar esta a posição certa e tira o aviso">
                                <i data-lucide="pin"></i> Fixar aqui
                            </button>
                        </div>`;
                }).join('')}
            </div>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                O cliente não vê nada disso — ele enxerga só a data e a fase de cada conteúdo.
                Remanejamento é conversa de produção.
            </p>
        </article>`;

    // ── Eventos ──────────────────────────────────────────────────────────
    function ligarEventos() {
        content.querySelector('#qd-anterior').addEventListener('click', () => { mes = somarMeses(mes, -1); selecionado = null; desenhar(); });
        content.querySelector('#qd-proximo').addEventListener('click', () => { mes = somarMeses(mes, 1); selecionado = null; desenhar(); });

        content.querySelectorAll('[data-abrir]').forEach(b =>
            b.addEventListener('click', () => navegar(`/conteudo/${b.dataset.abrir}`)));

        content.querySelectorAll('[data-fixar]').forEach(b =>
            b.addEventListener('click', async () => {
                const c = conteudos.find(x => x.id === b.dataset.fixar);
                await store.conteudos.salvar(fixarPosicao(c));
                toast('Posição fixada. Este passa a ser o lugar de origem.');
                recarregar();
            }));

        content.querySelector('#qd-cancelar')?.addEventListener('click', () => { selecionado = null; desenhar(); });

        content.querySelectorAll('[data-guardar]').forEach(b =>
            b.addEventListener('click', async () => {
                const alvo = conteudos.find(x => x.id === b.dataset.guardar);
                if (!alvo) return;
                b.disabled = true;
                await store.conteudos.salvar({ ...alvo, banco_em: new Date().toISOString() });
                toast(`"${alvo.titulo}" foi para o banco de temas.`, {
                    label: 'Desfazer',
                    onClick: async () => {
                        await store.conteudos.salvar({ ...alvo, banco_em: null });
                        recarregar();
                    },
                });
                recarregar();
            }));

        content.querySelectorAll('[data-trocar]').forEach(b =>
            b.addEventListener('click', () => {
                const id = b.dataset.trocar;
                if (selecionado === id) { selecionado = null; desenhar(); return; }
                if (!selecionado) { selecionado = id; desenhar(); return; }
                const primeiro = selecionado;
                selecionado = null;
                trocarSelecionados(primeiro, id);
            }));

        soltarArraste?.();
        soltarArraste = ativarArraste(content.querySelector('#qd-grade') || content, {
            item: '[data-arrastavel]',
            alvo: '[data-solta]',
            aoSoltar: (idConteudo, chaveVaga) => moverParaVaga(idConteudo, chaveVaga),
        });
    }

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────

const DIAS_NOME = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const rotuloDias = (vaga) => vaga.dias.map(d => DIAS_NOME[d]).join(' · ');

const curto = (t, n = 34) => {
    const s = String(t || '');
    return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
};

const ESTILOS = `
<style>
.qd-conta { font-size: var(--text-sm); color: var(--text-tertiary); }
.qd-conta__alerta { color: var(--warning); font-weight: 600; }

/* ── Grade ───────────────────────────────────────────────────────────────
   Rola na horizontal em vez de espremer: três colunas de cartão não cabem
   num celular, e coluna espremida transforma título em uma letra por linha. */
.qd-grade { display: flex; flex-direction: column; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); }
.qd-cabeca, .qd-linha { display: grid; grid-template-columns: 112px repeat(3, minmax(230px, 1fr)); gap: var(--space-2); min-width: 800px; }

.qd-cabeca { position: sticky; top: 0; z-index: 3; background: var(--surface-base); padding: var(--space-2) 0; }
.qd-cabeca__col {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary);
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
}
.qd-cabeca__col em { font-style: normal; font-weight: 400; color: var(--text-disabled); text-transform: none; letter-spacing: 0; }

.qd-semana {
    display: flex; flex-direction: column; justify-content: center; gap: 2px;
    padding: var(--space-3) var(--space-2);
}
.qd-semana__rotulo { font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary); }
.qd-semana__agora { font-size: var(--text-xs); color: var(--accent); font-weight: 600; }
.qd-linha--atual .qd-semana__rotulo { color: var(--accent); }

.qd-celula {
    display: flex; flex-direction: column; gap: var(--space-2);
    min-height: 96px; padding: var(--space-2);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-1);
    transition: background-color var(--dur-fast), border-color var(--dur-fast);
}
.qd-vazia {
    margin: auto; font-size: var(--text-xs); color: var(--text-disabled);
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
}

/* ── Cartão ──────────────────────────────────────────────────────────── */
.qd-cartao {
    display: flex; align-items: stretch; gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
    background: var(--surface-2);
    cursor: grab;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}
.qd-cartao:hover { border-color: var(--border-default); }
.qd-cartao.is-escolhido { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--accent-muted); }
/* Fase que não bate com a coluna: o cartão ganha borda vermelha. É a leitura
   que a tela existe para dar, e ela precisa funcionar de longe, sem ler. */
.qd-cartao--fora { border-color: color-mix(in oklch, var(--danger) 55%, transparent); }

.qd-cartao__corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.qd-cartao__topo { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.qd-cartao__dia { font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.qd-cartao__titulo {
    margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);
    line-height: var(--leading-snug);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.qd-cartao__pe { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; min-width: 0; }
.qd-cartao__acoes { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }

/* ── Barra de seleção ────────────────────────────────────────────────── */
.qd-selecao {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-4) var(--space-5);
    border-color: var(--accent-border); background: var(--accent-muted);
}
.qd-selecao__texto { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.qd-selecao__texto strong { color: var(--text-primary); }

/* ── Remanejados ─────────────────────────────────────────────────────── */
.qd-remanejados { display: flex; flex-direction: column; gap: var(--space-2); }
.qd-remanejado {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    border: 1px solid color-mix(in oklch, var(--warning) 30%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--warning) 8%, transparent);
}
.qd-remanejado--fora {
    border-color: color-mix(in oklch, var(--danger) 34%, transparent);
    background: color-mix(in oklch, var(--danger) 8%, transparent);
}
.qd-remanejado__info { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: var(--space-2); }
.qd-remanejado__titulo { font-size: var(--text-body); font-weight: 600; color: var(--text-primary); }
.qd-remanejado__conta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-sm); color: var(--text-tertiary); line-height: var(--leading-body); }
.qd-remanejado__conta b { color: var(--text-primary); font-weight: 600; }
.qd-remanejado__aviso { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); font-weight: 600; color: var(--danger); }
.qd-remanejado__aviso i, .qd-remanejado__aviso svg { width: 13px; height: 13px; flex-shrink: 0; }

@media (max-width: 720px) {
    .qd-cabeca, .qd-linha { grid-template-columns: 84px repeat(3, minmax(210px, 1fr)); min-width: 720px; }
    .qd-selecao .ds-btn { width: 100%; }
}
</style>
`;
