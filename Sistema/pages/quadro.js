import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar, caminhoDoConteudo } from '../lib/rotas.js';
import { ativarArraste } from '../lib/arrastar.js';
import { nomeFase, noDiaCerto } from '../lib/diretorio.js';
import { injectEstilosEtiqueta, chipsEstado, etapaAtual, etiquetaMeta, chipEtiqueta, ETAPAS, etapaNaEsteira, esteiraDe } from '../lib/etiquetas.js';
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

/* Esc limpa a seleção. Um ouvinte só, para a vida toda: o quadro se redesenha
   a cada movimento, e um ouvinte por desenho se empilharia. */
let aoEsc = null;

/* O painel do banco fica aberto entre um movimento e outro: devolver cinco
   temas seguidos não pode exigir reabri-lo cinco vezes. */
const BANCO_ABERTO = new Set();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') aoEsc?.(); });

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
    /* A seleção MÚLTIPLA: vários cartões marcados vão juntos para o mesmo
       destino, pela barra do rodapé ou arrastando qualquer um deles. Vive só
       até o próximo movimento — depois de mover, a seleção já cumpriu o papel. */
    const marcados = new Set();
    aoEsc = () => { if (marcados.size) { marcados.clear(); desenhar(); } };
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
            <button class="ds-btn ds-btn--ghost" id="qd-banco" aria-pressed="${BANCO_ABERTO.has(clienteId)}">
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

    /* ── O BANCO AO LADO DO QUADRO ──────────────────────────────────────
       No cronograma o banco é uma gaveta; aqui é um painel fixo à direita,
       sem cobrir o quadro. A gaveta tapava a tela com um fundo escuro, e
       devolver um tema exigia digitar a data — sem poder arrastar para a vaga
       que se está vendo. Com o painel ao lado, o tema vai do banco para o dia
       vago (ou de volta para o banco) no mesmo gesto do resto da tela. */
    const botaoBanco = document.getElementById('qd-banco');
    botaoBanco?.addEventListener('click', () => {
        if (BANCO_ABERTO.has(clienteId)) BANCO_ABERTO.delete(clienteId); else BANCO_ABERTO.add(clienteId);
        botaoBanco.setAttribute('aria-pressed', String(BANCO_ABERTO.has(clienteId)));
        desenhar();
    });

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
        // Arrastar um cartão MARCADO leva a seleção inteira junto.
        const ids = marcados.has(conteudoId) && marcados.size > 1 ? [...marcados] : [conteudoId];
        await moverGrupo(ids, destino);
    }

    /** Aplica um destino a um ou vários conteúdos, com um desfazer só. */
    async function moverGrupo(ids, destino) {
        // `todos`, e não `conteudos`: o grupo pode vir do banco de temas.
        const grupo = ids.map(id => todos.find(x => x.id === id)).filter(Boolean);
        if (!grupo.length) return;
        const um = grupo.length === 1;
        const doBanco = grupo.every(c => c.banco_em);
        const nome = um ? `"${curto(grupo[0].titulo)}"` : `${grupo.length} conteúdos`;

        if (destino === 'banco') {
            const mexer = grupo.filter(c => !c.banco_em);
            await aplicar({
                alterados: mexer.map(c => ({ ...c, banco_em: new Date().toISOString() })),
                desfazer: mexer.map(c => ({ ...c })),
            }, `${nome} ${um ? 'foi' : 'foram'} para o banco de temas.`);
            return;
        }

        if (destino === 'semdata') {
            const mexer = grupo.filter(c => c.banco_em || !aguardaData(c));
            await aplicar({
                alterados: mexer.map(c => ({ ...c, banco_em: null, etiquetas: comPendencia(c.etiquetas, AGUARDANDO_DATA, true) })),
                desfazer: mexer.map(c => ({ ...c })),
            }, `${nome} ${um ? 'ficou' : 'ficaram'} sem data.`);
            return;
        }

        let dia;
        if (destino.startsWith('dia:')) {
            dia = destino.slice(4);
        } else {
            const [segunda, faseVaga] = destino.slice(5).split('|');
            const vaga = VAGAS.find(v => v.fase === faseVaga);
            dia = somarDias(segunda, vaga.dia);
            /* Um só, já nesta vaga, nesta semana, e com data? Não mexe. Sem a
               guarda, soltar um conteúdo de terça na própria coluna o empurraria
               para segunda — uma mudança que ninguém pediu. */
            const c = grupo[0];
            if (um && !aguardaData(c) && vaga.dias.includes(indiceDia(c.data))
                && somarDias(c.data, -indiceDia(c.data)) === segunda) return;
        }

        /* Quem sai do BANCO volta com a origem no dia novo: devolver é decisão
           deliberada de onde ele fica, e não remanejamento — o histórico de
           "saiu do lugar" falaria de uma mudança que ninguém fez. */
        const movimentos = grupo.map(c => c.banco_em
            ? { alterados: [{ ...c, banco_em: null, data: dia, data_original: dia,
                              etiquetas: comPendencia(c.etiquetas, AGUARDANDO_DATA, false) }],
                desfazer: [{ ...c }] }
            : moverPara(c, dia));
        const juntos = conteudos.filter(x => !ids.includes(x.id) && x.data === dia && !aguardaData(x)).length;
        await aplicar({
            alterados: movimentos.flatMap(m => m.alterados),
            desfazer: movimentos.flatMap(m => m.desfazer),
        }, `${nome} ${doBanco ? (um ? 'saiu' : 'saíram') + ' do banco e ' + (um ? 'foi' : 'foram') : (um ? 'foi' : 'foram')} para ${diaCurto(dia)}${juntos ? `, junto com ${juntos === 1 ? 'mais 1' : `mais ${juntos}`}` : ''}.`);
    }

    /** A mesma etapa para vários — cada um na equivalente da sua esteira. */
    async function etapaEmGrupo(ids, etapa) {
        const desfazeres = [];
        let pulados = 0;
        // Um por vez: o adaptador local grava a coleção inteira a cada salvar.
        for (const id of ids) {
            const c = conteudos.find(x => x.id === id);
            if (!c) continue;
            const destino = etapa ? etapaNaEsteira(etapa, esteiraDe(c.formato)) : null;
            if (etapa && !destino) { pulados++; continue; }
            if ((etapaAtual(c.etiquetas)?.nome || null) === destino) continue;
            const { desfazer } = await moverParaEtapa(c, destino);
            desfazeres.push(desfazer);
        }
        toast(`${desfazeres.length} conteúdo${desfazeres.length === 1 ? '' : 's'} em "${etapa || 'rascunho'}".`
            + (pulados ? ` ${pulados} de outra esteira ficaram como estavam.` : ''), {
            label: 'Desfazer',
            onClick: async () => { for (const d of desfazeres) await d(); recarregar(); },
        });
        recarregar();
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

            <div id="qd-area" class="${marcados.size ? 'qd-area--selecionando' : ''}">
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

                ${BANCO_ABERTO.has(clienteId) ? painelBanco() : ''}

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

            ${marcados.size ? barraLote() : ''}
        `;

        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    /* O painel do banco. É também destino: soltar um cartão do quadro nele
       guarda o conteúdo. `data-ar-fixo` pausa a rolagem automática sobre ele. */
    const painelBanco = () => `
        <aside class="qd-banco" data-solta="banco" data-ar-fixo aria-label="Banco de temas">
            <header class="qd-banco__cabeca">
                <div>
                    <h2>Banco de temas <span class="qd-semdata__conta">${noBanco.length}</span></h2>
                    <p>${noBanco.length
                        ? 'Arraste um tema para um dia do quadro para devolvê-lo ao calendário.'
                        : 'Vazio. Arraste um cartão do quadro para cá para guardá-lo sem apagar.'}</p>
                </div>
                <button class="ds-icon-btn ds-icon-btn--sm" id="qd-banco-fechar" aria-label="Fechar o banco de temas">
                    <i data-lucide="x"></i>
                </button>
            </header>
            <div class="qd-banco__lista">
                ${noBanco.map(c => `
                    <article class="qd-cartao qd-banco__item" data-arrastavel="${esc(c.id)}">
                        <div class="qd-cartao__corpo">
                            <div class="qd-cartao__topo">
                                ${chipFase(c.fase, { curto: true })}
                                <span class="qd-cartao__dia">guardado em ${esc(diaCurto(String(c.banco_em).slice(0, 10)))}</span>
                            </div>
                            <h3 class="qd-cartao__titulo"><a href="${esc(caminhoDoConteudo(c))}" draggable="false">${esc(c.titulo)}</a></h3>
                            <div class="qd-cartao__pe">
                                ${chipsEstado(c)}
                                <button class="qd-banco__voltar" data-devolver="${esc(c.id)}"
                                        title="Devolver para o dia em que estava">
                                    <i data-lucide="corner-up-left"></i> ${esc(diaCurto(c.data))}
                                </button>
                            </div>
                        </div>
                    </article>`).join('')}
            </div>
        </aside>`;

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

        const marcado = marcados.has(c.id);
        return `
            <article class="qd-cartao ${escolhido ? 'is-escolhido' : ''} ${marcado ? 'is-marcado' : ''} ${foraDeFase ? 'qd-cartao--fora' : ''}"
                     data-arrastavel="${esc(c.id)}" data-cartao="${esc(c.id)}" data-solta="${semData ? 'semdata' : `dia:${esc(c.data)}`}"
                     ${marcado && marcados.size > 1 ? `data-lote="${marcados.size}"` : ''}>
                <div class="qd-cartao__corpo">
                    <div class="qd-cartao__topo">
                        ${/* A caixa de seleção aparece no hover — e fica visível
                              em todos os cartões enquanto houver seleção, para o
                              segundo e o terceiro não exigirem caçar o hover. */''}
                        <button class="qd-marca" data-marcar="${esc(c.id)}" role="checkbox" aria-checked="${marcado}"
                                aria-label="Selecionar ${esc(c.titulo)}" title="Selecionar">
                            <i data-lucide="check"></i>
                        </button>
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

    /* ── A BARRA DA SELEÇÃO ───────────────────────────────────────────────
       Presa ao rodapé, como a de destinos do arraste — que toma o lugar dela
       enquanto se arrasta. O dia exato vem de um calendário: é o "local exato"
       que o arraste não alcança quando o destino está a meses de distância. */
    const barraLote = () => `
        <div class="qd-lote" role="toolbar" aria-label="Ações para os selecionados">
            <span class="qd-lote__conta"><b>${marcados.size}</b> selecionado${marcados.size === 1 ? '' : 's'}</span>
            <span class="qd-lote__sep"></span>
            <label class="qd-lote__dia">
                <i data-lucide="calendar"></i>
                <input type="date" id="qd-lote-data" aria-label="Dia de destino">
            </label>
            <button class="ds-btn ds-btn--primary ds-btn--sm" id="qd-lote-mover" disabled>
                <i data-lucide="arrow-right"></i> Mover
            </button>
            <span class="qd-lote__sep"></span>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="qd-lote-etapa" aria-haspopup="menu">
                <i data-lucide="git-commit-horizontal"></i> Etapa
            </button>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="qd-lote-semdata">
                <i data-lucide="calendar-clock"></i> Sem data
            </button>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="qd-lote-banco">
                <i data-lucide="archive"></i> Banco
            </button>
            <button class="ds-icon-btn ds-icon-btn--sm" id="qd-lote-limpar" aria-label="Limpar seleção (Esc)" title="Limpar seleção (Esc)">
                <i data-lucide="x"></i>
            </button>
        </div>`;

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
        const alternar = (id) => {
            if (marcados.has(id)) marcados.delete(id); else marcados.add(id);
            desenhar();
        };
        content.querySelectorAll('[data-marcar]').forEach(b =>
            b.addEventListener('click', (e) => { e.stopPropagation(); alternar(b.dataset.marcar); }));

        /* Com seleção ativa, clicar no cartão marca/desmarca em vez de abrir —
           é o que se espera de uma tela em modo de seleção. Sem seleção,
           abre a demanda. */
        content.querySelectorAll('[data-cartao]').forEach(el =>
            el.addEventListener('click', (e) => {
                if (e.defaultPrevented || e.target.closest('button, a')) return;
                if (marcados.size) { alternar(el.dataset.cartao); return; }
                const alvo = conteudos.find(x => x.id === el.dataset.cartao);
                if (alvo) navegar(caminhoDoConteudo(alvo));
            }));

        // ── Banco ──
        content.querySelector('#qd-banco-fechar')?.addEventListener('click', () => {
            BANCO_ABERTO.delete(clienteId);
            botaoBanco?.setAttribute('aria-pressed', 'false');
            desenhar();
        });
        content.querySelectorAll('[data-devolver]').forEach(b =>
            b.addEventListener('click', () => {
                const c = noBanco.find(x => x.id === b.dataset.devolver);
                if (c) moverGrupo([c.id], `dia:${c.data}`);
            }));

        // ── Barra da seleção ──
        const dataLote = content.querySelector('#qd-lote-data');
        const moverLote = content.querySelector('#qd-lote-mover');
        dataLote?.addEventListener('input', () => { moverLote.disabled = !dataLote.value; });
        dataLote?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && dataLote.value) moverLote.click(); });
        moverLote?.addEventListener('click', () => {
            if (!dataLote.value) return;
            // O mês acompanha o destino: mover para novembro e continuar vendo
            // setembro esconderia o resultado do próprio clique.
            mes = chaveMes(dataLote.value);
            MES_ABERTO.set(clienteId, mes);
            moverGrupo([...marcados], `dia:${dataLote.value}`);
        });
        content.querySelector('#qd-lote-semdata')?.addEventListener('click', () => moverGrupo([...marcados], 'semdata'));
        content.querySelector('#qd-lote-banco')?.addEventListener('click', () => moverGrupo([...marcados], 'banco'));
        content.querySelector('#qd-lote-limpar')?.addEventListener('click', () => { marcados.clear(); desenhar(); });
        content.querySelector('#qd-lote-etapa')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Todas as etapas, das duas esteiras, sem repetir nome: cada peça
            // vai para a equivalente da sua (etapaNaEsteira).
            const nomes = [...new Set(ETAPAS.map(et => et.nome))];
            abrirMenu(e.currentTarget, [
                { id: 'rascunho', label: 'rascunho (fora do link)', icon: 'pencil',
                  onClick: () => etapaEmGrupo([...marcados], null) },
                ...nomes.map((nome, i) => ({
                    id: `et-${nome}`, label: nome, icon: etiquetaMeta(nome).icone,
                    separadorAntes: i === 0,
                    onClick: () => etapaEmGrupo([...marcados], nome),
                })),
            ]);
        });

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
                const c = todos.find(x => x.id === id);
                if (!c) return false;
                if (destino === 'banco') return !c.banco_em;
                if (c.banco_em) return true;   // do banco, qualquer dia ou "sem data" serve
                if (destino === 'semdata') return !aguardaData(c);
                return !(destino === `dia:${c.data}` && !aguardaData(c));
            },
            aoSoltar: (idConteudo, destino) => soltar(idConteudo, destino),
            // A página rola, não a lista do banco de onde o cartão pode sair.
            rolador: content.closest('.sh-scroll'),
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

/* ── Painel do banco ──────────────────────────────────────────────────── */
.qd-banco {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 820;
    width: 340px; display: flex; flex-direction: column;
    background: var(--surface-1); border-left: 1px solid var(--border-default);
    box-shadow: var(--shadow-lg);
    animation: qd-entra-lado var(--dur-fast) var(--ease-out);
}
@keyframes qd-entra-lado { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
/* O quadro abre espaço para o painel em vez de ficar escondido atrás dele. */
.sh-scroll:has(.qd-banco) { padding-right: calc(340px + var(--space-6)); }
.qd-banco.ar-sobre { background: var(--accent-muted) !important; outline-offset: -4px; }
.qd-banco__cabeca {
    display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3);
    padding: var(--space-5) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
}
.qd-banco__cabeca h2 { display: flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-body); font-weight: 700; }
.qd-banco__cabeca p { margin: 6px 0 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }
.qd-banco__lista { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4) var(--space-6); }
.qd-banco__item { cursor: grab; }
.qd-banco__voltar {
    display: inline-flex; align-items: center; gap: 4px; margin-left: auto;
    padding: 2px 8px; border: 1px solid var(--border-subtle); border-radius: var(--radius-pill);
    background: none; color: var(--text-tertiary); cursor: pointer;
    font-family: var(--font-sans); font-size: var(--text-xs); font-weight: 600;
}
.qd-banco__voltar:hover { color: var(--text-primary); border-color: var(--border-default); }
.qd-banco__voltar svg { width: 12px; height: 12px; }
#qd-banco[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
@media (max-width: 900px) {
    .qd-banco { width: min(86vw, 340px); }
    .sh-scroll:has(.qd-banco) { padding-right: var(--space-4); }
}

/* ── Seleção múltipla ─────────────────────────────────────────────────── */
.qd-marca {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; padding: 0; flex-shrink: 0;
    border: 1.5px solid var(--border-strong, var(--text-tertiary)); border-radius: 5px;
    background: transparent; color: transparent; cursor: pointer;
    opacity: 0; transition: opacity var(--dur-fast), background-color var(--dur-fast), border-color var(--dur-fast);
}
.qd-marca svg { width: 12px; height: 12px; stroke-width: 3; }
.qd-cartao:hover .qd-marca, .qd-marca:focus-visible, .qd-area--selecionando .qd-marca { opacity: 1; }
.qd-cartao.is-marcado { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.qd-cartao.is-marcado .qd-marca { opacity: 1; background: var(--accent-solid, var(--accent)); border-color: transparent; color: #fff; }
/* No toque não há hover: a caixa fica sempre à vista. */
@media (hover: none) { .qd-marca { opacity: 1; } }

/* Arrastando um cartão marcado, o fantasma diz quantos vão junto. */
.ar-fantasma[data-lote]::after {
    content: attr(data-lote);
    position: absolute; top: -10px; right: -10px;
    min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-solid, var(--accent)); color: #fff;
    font-size: 13px; font-weight: 700; box-shadow: var(--shadow-lg);
}

.qd-lote {
    position: fixed; left: 50%; bottom: var(--space-6); z-index: 840;
    transform: translateX(-50%);
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; justify-content: center;
    /* max-content: com left 50%, a largura disponível seria só a metade
       direita da tela, e a barra quebrava em duas linhas sem precisar. */
    width: max-content; max-width: calc(100vw - 2 * var(--space-4));
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--accent-border); border-radius: var(--radius-lg, 16px);
    background: var(--surface-2); box-shadow: var(--shadow-lg);
    animation: qd-sobe var(--dur-fast) var(--ease-out);
}
@keyframes qd-sobe { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translateX(-50%); } }
/* Durante o arraste quem ocupa o rodapé é a barra de destinos. */
body.ar-arrastando .qd-lote { display: none; }
.qd-lote__conta { font-size: var(--text-sm); color: var(--text-secondary); padding: 0 var(--space-2); white-space: nowrap; }
.qd-lote__conta b { color: var(--text-primary); }
.qd-lote__sep { width: 1px; align-self: stretch; background: var(--border-subtle); margin: 0 var(--space-1); }
.qd-lote__dia {
    display: inline-flex; align-items: center; gap: 6px;
    height: 32px; padding: 0 var(--space-2);
    border: 1px solid var(--border-default); border-radius: var(--radius-sm);
    background: var(--surface-1); color: var(--text-tertiary);
}
.qd-lote__dia svg { width: 15px; height: 15px; }
.qd-lote__dia input {
    border: none; background: none; outline: none; color: var(--text-primary);
    font-family: var(--font-sans); font-size: var(--text-sm); color-scheme: dark;
}
html[data-theme="light"] .qd-lote__dia input { color-scheme: light; }
@media (max-width: 640px) {
    .qd-lote { left: var(--space-3); right: var(--space-3); width: auto; transform: none; max-width: none; animation: none; }
    .qd-lote__sep { display: none; }
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
