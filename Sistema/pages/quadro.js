import { store } from '../store.js';
import { abrirBancoDeTemas } from './cronograma.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar, caminhoDoConteudo } from '../lib/rotas.js';
import { ativarArraste } from '../lib/arrastar.js';
import { nomeFase, noDiaCerto } from '../lib/diretorio.js';
import { injectEstilosEtiqueta, chipsEstado, etapaAtual, etiquetaMeta, chipEtiqueta } from '../lib/etiquetas.js';
import { moverParaEtapa, mensagemDeMovimento, itensDeEtapa } from '../lib/etapas.js';
import { abrirMenu } from '../components/menu.js';
import { chipFase, vazioHTML } from '../lib/pecas.js';
import {
    porData, leituraDeslocamento, deslocado, moverPara, fixarPosicao, DIAS_DA_FASE,
    aguardaData, comPendencia, AGUARDANDO_DATA,
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

/* O mês que cada cliente estava vendo. Em memória, como a rolagem: sair para
   uma demanda e voltar precisa reabrir o mesmo mês, senão a rolagem guardada
   aponta para uma grade que não é mais a da tela. */
const MES_ABERTO = new Map();

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
    let mes = mesInicial || MES_ABERTO.get(clienteId) || mesAtual();
    const trocarMes = (novo) => { mes = novo; MES_ABERTO.set(clienteId, mes); selecionado = null; desenhar(); };
    let selecionado = null;     // id do primeiro conteúdo de uma troca por seleção
    let soltarArraste = null;

    const { content } = renderShell(container, {
        path: '/',
        crumbs: [
            { href: '/', label: 'Clientes' },
            { href: `/cliente/${clienteId}`, label: cliente.nome },
        ],
        title: 'Quadro do mês',
        subtitle: 'Arraste para mover — um dia pode ter mais de um conteúdo. No toque, segure por um instante antes de arrastar.',
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

    /**
     * Solta um conteúdo num destino. Três tipos de destino:
     *   vaga:<segunda>|<fase>  a célula — vai para o primeiro dia da vaga;
     *   dia:<iso>              outro cartão — vai para o MESMO dia dele;
     *   semdata                a bandeja — ganha a pendência "aguardando data".
     *
     * Nunca troca com quem já está no dia: um dia pode ter vários conteúdos.
     * Trocar de lugar é o botão de troca, um gesto explícito.
     */
    async function soltar(conteudoId, destino) {
        const c = conteudos.find(x => x.id === conteudoId);
        if (!c) return;

        if (destino === 'banco') {
            await store.conteudos.salvar({ ...c, banco_em: new Date().toISOString() });
            toast(`"${curto(c.titulo)}" foi para o banco de temas.`, {
                label: 'Desfazer',
                onClick: async () => { await store.conteudos.salvar({ ...c, banco_em: null }); recarregar(); },
            });
            recarregar();
            return;
        }

        if (destino === 'semdata') {
            if (aguardaData(c)) return;
            await aplicar({
                alterados: [{ ...c, etiquetas: comPendencia(c.etiquetas, AGUARDANDO_DATA, true) }],
                desfazer: [{ ...c }],
            }, `"${curto(c.titulo)}" ficou sem data.`);
            return;
        }

        let dia;
        if (destino.startsWith('dia:')) {
            dia = destino.slice(4);
        } else {
            const [segunda, faseVaga] = destino.slice(5).split('|');
            const vaga = VAGAS.find(v => v.fase === faseVaga);
            dia = somarDias(segunda, vaga.dia);
            /* Já está nesta vaga, nesta semana, e tem data? Não mexe. Sem a
               guarda, soltar um conteúdo de terça na própria coluna o empurraria
               para segunda — uma mudança que ninguém pediu. */
            if (!aguardaData(c) && vaga.dias.includes(indiceDia(c.data))
                && somarDias(c.data, -indiceDia(c.data)) === segunda) return;
        }

        const juntos = conteudos.filter(x => x.id !== c.id && x.data === dia && !aguardaData(x)).length;
        await aplicar(moverPara(c, dia),
            `"${curto(c.titulo)}" foi para ${diaCurto(dia)}${juntos ? `, junto com ${juntos === 1 ? 'mais 1' : `mais ${juntos}`}` : ''}.`);
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
        const comData = conteudos.filter(c => !aguardaData(c));
        const semData = porData(conteudos.filter(aguardaData));
        const doMes = comData.filter(c => chaveMes(c.data) === mes);
        const deslocados = doMes.filter(deslocado);

        content.innerHTML = `
            <article class="ds-card vz-barra">
                <div class="vz-mes">
                    <button class="ds-icon-btn" id="qd-anterior" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                    <span class="vz-mes__rotulo">${esc(mesExtenso(mes))}</span>
                    <button class="ds-icon-btn" id="qd-proximo" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>
                </div>
                <span class="vz-barra__espaco"></span>
                <span class="qd-conta">${doMes.length} conteúdo${doMes.length === 1 ? '' : 's'}</span>
            </article>

            ${selecionado ? barraSelecao() : ''}

            <div id="qd-area">
                ${/* Os destinos que não são um dia aparecem SÓ durante o arraste,
                      presos ao rodapé da tela: a peça pode estar na última
                      semana, e a bandeja lá no topo. Esperar que a pessoa leve
                      o cartão até lá em cima era esperar demais. */''}
                <div class="qd-doca" data-ar-fixo>
                    <div class="qd-doca__alvo" data-solta="semdata">
                        <i data-lucide="calendar-clock"></i>
                        <span><b>Sem data</b><small>tira do calendário</small></span>
                    </div>
                    <div class="qd-doca__alvo" data-solta="banco">
                        <i data-lucide="archive"></i>
                        <span><b>Banco de temas</b><small>guarda para depois</small></span>
                    </div>
                </div>

                ${bandejaSemData(semData)}

                ${doMes.length || semData.length ? `
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
                        ${semanas.map(s => linhaSemana(s, comData)).join('')}
                    </div>`
                : vazioHTML('layout-grid', 'Nada neste mês',
                    'Importe os temas ou crie um conteúdo para o quadro ter o que mostrar.',
                    `<a class="ds-btn ds-btn--primary" href="/cliente/${esc(clienteId)}">Ir para o cronograma</a>`)}
            </div>

            ${deslocados.length ? painelDeslocados(deslocados) : ''}
        `;

        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    /* ── SEM DATA ─────────────────────────────────────────────────────────
       A gaveta do que já foi gravado (ou escrito) e ainda não tem dia. Antes
       essas peças eram empilhadas numa data qualquer até alguém sentar para
       distribuir — e o dia escolhido virava um amontoado que parecia agenda.
       Aqui elas ficam fora da grade, de qualquer mês, e voltam ao calendário
       arrastadas para uma vaga. Vazia, ela nem aparece: para TIRAR a data,
       o destino é a barra que surge no rodapé durante o arraste. */
    const bandejaSemData = (lista) => !lista.length ? '' : `
        <section class="qd-semdata" data-solta="semdata">
            <header class="qd-semdata__cabeca">
                <span class="qd-semdata__titulo"><i data-lucide="calendar-clock"></i> Sem data
                    <span class="qd-semdata__conta">${lista.length}</span></span>
                <span class="qd-semdata__dica">Arraste para uma vaga do quadro para dar o dia.</span>
            </header>
            <div class="qd-semdata__lista">${lista.map(c => cartao(c, conteudos, { semData: true })).join('')}</div>
        </section>`;

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
            <div class="qd-celula" data-solta="vaga:${esc(segunda)}|${esc(vaga.fase)}">
                ${dentro.map(c => cartao(c, todos)).join('')}
                ${dentro.length ? '' : '<span class="qd-vazia">vago</span>'}
            </div>`;
    };

    const cartao = (c, todos, { semData = false } = {}) => {
        const escolhido = selecionado === c.id;
        const href = esc(caminhoDoConteudo(c));

        /* PUBLICADO é passado: verde, apagado, só o essencial, sem botões e
           sem arraste. Continua abrindo ao clique — reler um roteiro que foi
           ao ar é consulta comum —, mas nada nele convida a mexer. */
        if (etapaAtual(c.etiquetas)?.nome === 'publicado') {
            return `
                <a class="qd-cartao qd-cartao--publicado" href="${href}" draggable="false" data-solta="dia:${esc(c.data)}">
                    <div class="qd-cartao__corpo">
                        <div class="qd-cartao__topo">
                            <span class="qd-cartao__dia">${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}</span>
                            ${chipFase(c.fase, { curto: true })}
                        </div>
                        <h3 class="qd-cartao__titulo">${esc(c.titulo)}</h3>
                        <span class="qd-cartao__publicado"><i data-lucide="send"></i> publicado</span>
                    </div>
                </a>`;
        }

        /* A borda vermelha diz "a fase não bate com a coluna", e vale para todo
           cartão, tenha ele se movido ou não. Na bandeja não há coluna. */
        const foraDeFase = !semData && !!c.fase && !noDiaCerto(c.fase, indiceDia(c.data));
        const etapa = etapaAtual(c.etiquetas);
        const outras = (c.etiquetas || []).filter(e => !etiquetaMeta(e).etapa && String(e).trim().toLowerCase() !== AGUARDANDO_DATA);

        return `
            <article class="qd-cartao ${escolhido ? 'is-escolhido' : ''} ${foraDeFase ? 'qd-cartao--fora' : ''}"
                     data-arrastavel="${esc(c.id)}" data-cartao="${esc(c.id)}" data-solta="${semData ? 'semdata' : `dia:${esc(c.data)}`}">
                <div class="qd-cartao__corpo">
                    <div class="qd-cartao__topo">
                        <span class="qd-cartao__dia">${semData ? 'sem data' : `${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}`}</span>
                        ${chipFase(c.fase, { curto: true })}
                    </div>
                    ${/* O título é link de verdade (ctrl+clique, botão do meio);
                          o resto do cartão abre por clique, em ligarEventos —
                          um link cobrindo o cartão engoliria o arraste. */''}
                    <h3 class="qd-cartao__titulo"><a href="${href}" draggable="false">${esc(c.titulo)}</a></h3>
                    <div class="qd-cartao__pe">
                        ${/* A etapa é o botão de mudar a etapa: o lugar onde a
                              pessoa já está olhando é o lugar onde ela clica. */''}
                        <button class="qd-etapa" data-etapa="${esc(c.id)}" aria-haspopup="menu"
                                title="Mudar a etapa">
                            ${etapa ? chipEtiqueta(etapa.nome)
                                : '<span class="vz-etiqueta vz-etiqueta--neutro"><i data-lucide="pencil"></i>rascunho</span>'}
                            <i class="qd-etapa__seta" data-lucide="chevron-down"></i>
                        </button>
                        ${c.status === 'ajuste' ? '<span class="vz-etiqueta vz-etiqueta--risco"><i data-lucide="message-circle-warning"></i>ajuste pedido</span>' : ''}
                        ${outras.map(chipEtiqueta).join('')}
                    </div>
                </div>
                <button class="ds-icon-btn ds-icon-btn--sm qd-cartao__mais" data-mais="${esc(c.id)}"
                        aria-label="Mais ações" aria-haspopup="menu" title="Mais ações">
                    <i data-lucide="${escolhido ? 'x' : 'ellipsis-vertical'}"></i>
                </button>
            </article>`;
    };

    const barraSelecao = () => {
        const c = conteudos.find(x => x.id === selecionado);
        return `
            <article class="ds-card qd-selecao">
                <div class="qd-selecao__texto">
                    <strong>"${esc(curto(c?.titulo || '', 46))}"</strong> selecionado.
                    Agora clique no <i data-lucide="ellipsis-vertical" class="qd-inline"></i> de outro conteúdo para inverter os dois de lugar.
                </div>
                <button class="ds-btn ds-btn--ghost ds-btn--sm" id="qd-cancelar">Cancelar</button>
            </article>`;
    };

    /* A lista de deslocados existe porque o selo no cartão é curto por
       necessidade — cabe "trocado com X" e não cabe a história inteira. Aqui
       cada caso aparece por extenso, com o botão de aceitar a posição nova. */
    /* Fechado por padrão: é consulta de produção, não o assunto da tela. O
       cartão não mostra mais de onde veio cada peça — poluía a leitura do mês —
       e quem quiser a história inteira abre aqui. */
    const painelDeslocados = (lista) => `
        <details class="ds-card vz-secao qd-historico">
            <summary class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Remanejados neste mês</h2>
                    <span class="ds-card-sub">
                        ${lista.length} conteúdo${lista.length > 1 ? 's' : ''} fora do dia em que nasceu — clique para ver
                    </span>
                </div>
                <i data-lucide="chevron-down" class="qd-historico__seta"></i>
            </summary>
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
        </details>`;

    // ── Eventos ──────────────────────────────────────────────────────────
    function ligarEventos() {
        content.querySelector('#qd-anterior').addEventListener('click', () => trocarMes(somarMeses(mes, -1)));
        content.querySelector('#qd-proximo').addEventListener('click', () => trocarMes(somarMeses(mes, 1)));

        content.querySelectorAll('[data-fixar]').forEach(b =>
            b.addEventListener('click', async () => {
                const c = conteudos.find(x => x.id === b.dataset.fixar);
                await store.conteudos.salvar(fixarPosicao(c));
                toast('Posição fixada. Este passa a ser o lugar de origem.');
                recarregar();
            }));

        content.querySelector('#qd-cancelar')?.addEventListener('click', () => { selecionado = null; desenhar(); });

        /* Clicar no cartão abre a demanda. Controles dentro dele cuidam do
           próprio clique, e o clique que sobra de um arraste já chega aqui
           cancelado (lib/arrastar.js). */
        content.querySelectorAll('[data-cartao]').forEach(el =>
            el.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.target.closest('button, a')) return;
                const alvo = conteudos.find(x => x.id === el.dataset.cartao);
                if (alvo) navegar(caminhoDoConteudo(alvo));
            }));

        /* Etapa: o mesmo menu do cronograma e a mesma função da demanda. */
        content.querySelectorAll('[data-etapa]').forEach(b =>
            b.addEventListener('click', (e) => {
                e.stopPropagation();   // o menu se fecha em qualquer clique no documento
                const alvo = conteudos.find(x => x.id === b.dataset.etapa);
                if (!alvo) return;
                abrirMenu(b, itensDeEtapa(alvo, async (nome) => {
                    const { novoStatus, reabriu, desfazer } = await moverParaEtapa(alvo, nome);
                    toast(mensagemDeMovimento(nome, novoStatus, reabriu), {
                        label: 'Desfazer',
                        onClick: async () => { await desfazer(); recarregar(); },
                    });
                    recarregar();
                }), { alinhar: 'esquerda' });
            }));

        /* O resto das ações num menu só: três botões empilhados no canto de
           cada cartão eram metade do ruído da tela. */
        content.querySelectorAll('[data-mais]').forEach(b =>
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = b.dataset.mais;
                const alvo = conteudos.find(x => x.id === id);
                if (!alvo) return;

                // Durante uma troca, o botão do próprio cartão cancela, e o de
                // outro cartão completa — sem abrir menu nenhum.
                if (selecionado) {
                    if (selecionado === id) { selecionado = null; desenhar(); return; }
                    const primeiro = selecionado;
                    selecionado = null;
                    trocarSelecionados(primeiro, id);
                    return;
                }

                abrirMenu(b, [
                    { id: 'abrir', label: 'Abrir a demanda', icon: 'file-text',
                      onClick: () => navegar(caminhoDoConteudo(alvo)) },
                    { id: 'trocar', label: 'Trocar de lugar com…', icon: 'arrow-left-right',
                      onClick: () => { selecionado = id; desenhar(); } },
                    aguardaData(alvo)
                        ? { id: 'semdata', label: 'Voltar para o dia que tinha', icon: 'calendar-check',
                            onClick: () => soltar(id, `dia:${alvo.data}`) }
                        : { id: 'semdata', label: 'Tirar a data (sem data)', icon: 'calendar-clock',
                            onClick: () => soltar(id, 'semdata') },
                    { id: 'banco', label: 'Mandar para o banco de temas', icon: 'archive', separadorAntes: true,
                      onClick: async () => {
                          await store.conteudos.salvar({ ...alvo, banco_em: new Date().toISOString() });
                          toast(`"${curto(alvo.titulo)}" foi para o banco de temas.`, {
                              label: 'Desfazer',
                              onClick: async () => {
                                  await store.conteudos.salvar({ ...alvo, banco_em: null });
                                  recarregar();
                              },
                          });
                          recarregar();
                      } },
                ]);
            }));

        soltarArraste?.();
        soltarArraste = ativarArraste(content.querySelector('#qd-area') || content, {
            item: '[data-arrastavel]',
            alvo: '[data-solta]',
            // Soltar sobre si mesmo não é movimento.
            podeSoltar: (id, destino) => {
                const c = conteudos.find(x => x.id === id);
                if (!c) return false;
                if (destino === 'semdata') return !aguardaData(c);
                return !(destino === `dia:${c.data}` && !aguardaData(c));
            },
            aoSoltar: (idConteudo, destino) => soltar(idConteudo, destino),
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

/* ── Barra de destinos (só durante o arraste) ──────────────────────────── */
.qd-doca {
    position: fixed; left: 50%; bottom: var(--space-6); z-index: 850;
    display: flex; gap: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--border-default); border-radius: var(--radius-lg, 16px);
    background: var(--surface-2); box-shadow: var(--shadow-lg);
    transform: translate(-50%, 16px); opacity: 0; pointer-events: none;
    transition: opacity var(--dur-fast), transform var(--dur-fast) var(--ease-out);
}
body.ar-arrastando .qd-doca { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
.qd-doca__alvo {
    display: flex; align-items: center; gap: var(--space-3);
    min-width: 200px; padding: var(--space-3) var(--space-4);
    border: 1px dashed var(--border-default); border-radius: var(--radius-md);
    color: var(--text-secondary);
    transition: background-color var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast);
}
.qd-doca__alvo svg { width: 20px; height: 20px; flex-shrink: 0; color: var(--accent); }
.qd-doca__alvo span { display: flex; flex-direction: column; line-height: 1.25; }
.qd-doca__alvo b { font-size: var(--text-sm); color: var(--text-primary); }
.qd-doca__alvo small { font-size: var(--text-xs); color: var(--text-tertiary); }
.qd-doca__alvo.ar-sobre { border-style: solid; border-color: var(--accent); }
@media (max-width: 640px) {
    .qd-doca { left: var(--space-3); right: var(--space-3); transform: translateY(16px); }
    body.ar-arrastando .qd-doca { transform: none; }
    .qd-doca__alvo { min-width: 0; flex: 1; }
}

/* ── Sem data ────────────────────────────────────────────────────────── */
.qd-semdata {
    display: flex; flex-direction: column; gap: var(--space-3);
    margin-bottom: var(--space-4); padding: var(--space-4);
    border: 1px dashed var(--border-default); border-radius: var(--radius-md);
    transition: background-color var(--dur-fast), border-color var(--dur-fast);
}
.qd-semdata.ar-sobre { border-color: var(--accent); background: var(--accent-muted); }
.qd-semdata__cabeca { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.qd-semdata__titulo {
    display: inline-flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-xs); font-weight: 700; color: var(--text-secondary);
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
}
.qd-semdata__titulo svg { width: 14px; height: 14px; color: var(--accent); }
.qd-semdata__conta {
    padding: 1px 8px; border-radius: var(--radius-pill);
    background: var(--accent-muted); color: var(--accent); letter-spacing: 0;
}
.qd-semdata__dica { font-size: var(--text-xs); color: var(--text-tertiary); }
.qd-semdata__lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: var(--space-2); }

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
    display: flex; align-items: flex-start; gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
    background: var(--surface-2);
    cursor: pointer;
    transition: border-color var(--dur-fast), box-shadow var(--dur-fast), opacity var(--dur-fast);
}
.qd-cartao:hover { border-color: var(--border-default); }
.qd-cartao.is-escolhido { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--accent-muted); }
/* Fase que não bate com a coluna. Discreta: é um aviso de estratégia, não um
   erro, e uma grade cheia de bordas vermelhas deixa de dizer qualquer coisa. */
.qd-cartao--fora { border-color: color-mix(in oklch, var(--danger) 32%, transparent); }

.qd-cartao__corpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.qd-cartao__topo { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.qd-cartao__dia { font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.qd-cartao__titulo {
    margin: 0; font-size: var(--text-sm); font-weight: 600; line-height: var(--leading-snug);
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.qd-cartao__titulo a { color: var(--text-primary); text-decoration: none; }
.qd-cartao__titulo a:hover { text-decoration: underline; text-underline-offset: 2px; }
.qd-cartao__pe { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.qd-cartao__mais { flex-shrink: 0; margin: -4px -4px 0 0; opacity: 0.55; transition: opacity var(--dur-fast); }
.qd-cartao:hover .qd-cartao__mais, .qd-cartao__mais:focus-visible, .qd-cartao.is-escolhido .qd-cartao__mais { opacity: 1; }

/* A etapa como botão: o próprio chip, com uma seta que só aparece no hover. */
.qd-etapa {
    display: inline-flex; align-items: center; gap: 2px;
    padding: 0; border: none; background: none; cursor: pointer; border-radius: var(--radius-pill);
}
.qd-etapa__seta { width: 13px; height: 13px; color: var(--text-tertiary); opacity: 0; transition: opacity var(--dur-fast); }
.qd-etapa:hover .qd-etapa__seta, .qd-etapa:focus-visible .qd-etapa__seta { opacity: 1; }
.qd-etapa:hover .vz-etiqueta { box-shadow: inset 0 0 0 1px currentColor; }

/* Publicado: passado. Verde, apagado, só o essencial. */
.qd-cartao--publicado {
    text-decoration: none; opacity: 0.6;
    background: color-mix(in oklch, var(--success) 12%, var(--surface-1));
    border-color: color-mix(in oklch, var(--success) 38%, transparent);
}
.qd-cartao--publicado:hover { opacity: 0.85; border-color: color-mix(in oklch, var(--success) 40%, transparent); }
.qd-cartao--publicado .qd-cartao__titulo { color: var(--text-secondary); }
.qd-cartao__publicado {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: var(--text-xs); font-weight: 600; color: var(--success);
}
.qd-cartao__publicado svg { width: 13px; height: 13px; }

.qd-inline { width: 14px; height: 14px; vertical-align: -2px; }

/* Remanejados: fechado por padrão. */
.qd-historico > summary { list-style: none; cursor: pointer; }
.qd-historico > summary::-webkit-details-marker { display: none; }
.qd-historico__seta { width: 18px; height: 18px; color: var(--text-tertiary); transition: transform var(--dur-fast); }
.qd-historico[open] .qd-historico__seta { transform: rotate(180deg); }

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
