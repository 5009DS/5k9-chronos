import { esc, escLinhas, PALAVRAS_POR_MINUTO } from './formato.js';
import { ordenar, tipo as tipoBloco } from './roteiro.js';

/* ═══════════════════════════════════════════════════════════════════════════
   TELEPROMPTER

   O roteiro existe para ser FALADO, e até aqui só podia ser lido numa tela de
   trabalho — com campos de edição, menus e a barra do navegador em volta. Na
   hora de gravar, a saída era imprimir ou decorar.

   ── AS DUAS FORMAS DE DIZER A VELOCIDADE ──────────────────────────────────
   Elas são a MESMA conta, vista dos dois lados que as pessoas usam:

     palavras por minuto → quem já sabe o ritmo em que fala;
     tempo total         → quem tem um limite ("o reels tem 45 segundos").

   Mexer numa recalcula a outra na hora, e as duas ficam na tela ao mesmo
   tempo. Esconder uma delas obrigaria a fazer a divisão de cabeça.

   ── POR QUE A ROLAGEM É POR TEMPO, E NÃO POR PIXEL ────────────────────────
   A velocidade sai de `altura ÷ duração`, e a duração sai das palavras. Assim
   o mesmo roteiro sobe no mesmo tempo em qualquer tela: no celular em pé, onde
   o texto ocupa o dobro da altura, a rolagem fica o dobro mais rápida sozinha.
   Uma velocidade fixa em pixels por segundo obrigaria a recalibrar a cada
   aparelho.

   ── OS MARCADORES DE LEITURA ──────────────────────────────────────────────
   Ficam a 38% da altura, e não no meio: quem lê em prompter olha um pouco
   acima do centro da lente, e o texto seguinte precisa estar visível abaixo
   dali. O respiro de 40vh em cima e embaixo existe para a primeira e a última
   fala também alcançarem a marca.

   São dois triângulos nas bordas, sem a linha que os ligava. A linha atravessa
   o texto na altura exata em que o olho está — ela riscava justamente a
   palavra que se está falando. Os prompters de mercado marcam a altura pela
   borda pela mesma razão: a informação é "é aqui", e a borda diz isso sem
   passar por cima da leitura.

   ── O JEITO DE LER É DE QUEM LÊ ───────────────────────────────────────────
   Alinhamento, margem e tamanho da letra ficam guardados no aparelho. Quem
   grava tem um jeito só de ler, e reconfigurar isso a cada gravação seria
   cobrar de novo uma decisão que já foi tomada. A velocidade NÃO fica: ela
   pertence ao roteiro, não à pessoa.
   ═══════════════════════════════════════════════════════════════════════════ */

const MIN_PPM = 60;
const MAX_PPM = 320;

const MIN_FONTE = 18;
const MAX_FONTE = 96;
const PASSO_MARGEM = 24;
const MAX_MARGEM = 200;

/* O jeito de ler, no aparelho de quem lê. Se o localStorage falhar, o prompter
   abre no padrão — é conforto, e nada aqui pode impedir a gravação. */
const CHAVE_JEITO = '5k9_prompter_jeito';

const entre = (n, min, max) => Math.min(max, Math.max(min, n));

/* Número guardado ou o padrão — e "guardado" precisa ser um número de verdade.
   Zero é um valor legítimo de margem, então `|| padrao` estaria errado; e
   `?? padrao` não pega o NaN que Number(undefined) devolve. Foi exatamente
   esse NaN que, na primeira medição, virou `--tp-margem: NaNpx` e apagou a
   regra de largura inteira. */
const numero = (valor, padrao) =>
    valor != null && Number.isFinite(Number(valor)) ? Number(valor) : padrao;

const lerJeito = () => {
    const padrao = { fonte: 34, alinhar: 'center', margem: 24 };
    try {
        const guardado = JSON.parse(localStorage.getItem(CHAVE_JEITO)) || {};
        return {
            fonte: entre(numero(guardado.fonte, padrao.fonte), MIN_FONTE, MAX_FONTE),
            alinhar: ['left', 'center', 'right'].includes(guardado.alinhar) ? guardado.alinhar : padrao.alinhar,
            margem: entre(numero(guardado.margem, padrao.margem), 0, MAX_MARGEM),
        };
    } catch { return padrao; }
};

const guardarJeito = (jeito) => {
    try { localStorage.setItem(CHAVE_JEITO, JSON.stringify(jeito)); } catch { /* sem localStorage */ }
};

/* Seção não se fala, e orientação de gravação também não — mas as duas
   precisam aparecer, porque quem está na frente da câmera usa as duas para se
   situar. Entram com desenho de instrução, nunca de fala. */
const FALADO = new Set(['gancho', 'fala', 'frase', 'cta', 'bloco']);

const contar = (texto) =>
    String(texto || '').trim().split(/\s+/).filter(Boolean).length;

const palavrasDe = (blocos) => blocos
    .filter(b => FALADO.has(b.tipo))
    .reduce((n, b) => n + contar(b.texto), 0);

const mmss = (segundos) => {
    const s = Math.max(0, Math.round(segundos));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const lerMMSS = (texto) => {
    const m = String(texto || '').trim().match(/^(\d{1,3})(?::(\d{2}))?$/);
    if (!m) return null;
    const segundos = m[2] ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
    return segundos > 0 ? segundos : null;
};

/**
 * @returns {{erro: string|null}} erro quando não há fala para ler
 */
export const abrirTeleprompter = (conteudo, todosBlocos) => {
    const blocos = ordenar(todosBlocos);
    const palavras = palavrasDe(blocos);
    if (!palavras) return { erro: 'Este roteiro ainda não tem fala para ler.' };

    injetarEstilos();

    let ppm = PALAVRAS_POR_MINUTO;
    let rodando = false;
    let ultimo = 0;
    let quadro = null;
    /* A POSIÇÃO VIVE AQUI, em número quebrado, e o scrollTop só a recebe.
       Somar direto no scrollTop parece igual e não é: a 150 palavras por
       minuto o avanço é de 0,6 pixel por quadro, o navegador arredonda para
       zero e o texto NUNCA sai do lugar. Só andava em velocidade alta, que foi
       exatamente como eu testei — o erro estava no teste antes de estar no
       código. */
    let posicao = 0;
    let trava = null;   // wake lock, quando o navegador tiver

    const duracao = () => (palavras / ppm) * 60;

    const camada = document.createElement('div');
    camada.className = 'tp';
    camada.innerHTML = `
        <div class="tp-topo">
            <div class="tp-info">
                <strong>${esc(conteudo.titulo || 'Roteiro')}</strong>
                <span>${palavras} palavras faladas</span>
            </div>
            <button class="tp-btn tp-btn--x" data-tp-sair aria-label="Fechar (Esc)">
                <i data-lucide="x"></i>
            </button>
        </div>

        <div class="tp-caixa">
            <div class="tp-palco" id="tp-palco">
                <div class="tp-texto" id="tp-texto">
                    ${blocos.map(desenharBloco).join('')}
                </div>
            </div>
            <div class="tp-marca" aria-hidden="true"></div>
        </div>

        <div class="tp-controles">
            <div class="tp-progresso"><span id="tp-barra"></span></div>

            ${/* Duas fileiras, e a divisão não é por falta de espaço: em cima o
                  que se mexe GRAVANDO — começar, voltar, acelerar. Embaixo o
                  que se acerta ANTES, uma vez. Misturar as duas faria procurar
                  o play entre botões de margem com a câmera já rodando. */''}
            <div class="tp-fileira">
                <button class="tp-btn tp-btn--principal" id="tp-play">
                    <i data-lucide="play"></i> <span>Rolar</span>
                </button>
                <button class="tp-btn tp-btn--icone" id="tp-reiniciar" title="Voltar ao início (R)"
                        aria-label="Voltar ao início">
                    <i data-lucide="rotate-ccw"></i>
                </button>

                ${/* Faixa e não campo numérico: velocidade se acha ouvindo, não
                      digitando. Ninguém sabe de cabeça que fala a 165 por
                      minuto — sabe que "um tiquinho mais rápido" está bom, e o
                      dedo faz isso enquanto o texto já está subindo. O número
                      continua à vista para quem quer repetir o ajuste. */''}
                <label class="tp-campo tp-campo--faixa">
                    <span>Velocidade · <b id="tp-ppm-valor">${ppm}</b> ppm</span>
                    ${/* Passo de 1, e não de 5: digitar "45 segundos" no campo ao
                          lado devolve 187 palavras por minuto, e uma faixa de
                          cinco em cinco pararia em 185 — o número embaixo do
                          dedo diria uma coisa e o tempo, outra. */''}
                    <input type="range" id="tp-ppm" min="${MIN_PPM}" max="${MAX_PPM}" step="1" value="${ppm}"
                           aria-label="Palavras por minuto">
                </label>

                <label class="tp-campo">
                    <span>Tempo total</span>
                    <input type="text" id="tp-tempo" inputmode="numeric" value="${mmss(duracao())}">
                </label>

                <span class="tp-restante" id="tp-restante">${mmss(duracao())}</span>
            </div>

            <div class="tp-fileira tp-fileira--jeito">
                <div class="tp-grupo" role="group" aria-label="Alinhamento do texto">
                    ${[['left', 'align-left', 'à esquerda'],
                        ['center', 'align-center', 'centralizado'],
                        ['right', 'align-right', 'à direita']].map(([id, icone, nome]) => `
                        <button class="tp-btn tp-btn--icone" data-alinhar="${id}"
                                title="Texto ${nome}" aria-label="Texto ${nome}" aria-pressed="false">
                            <i data-lucide="${icone}"></i>
                        </button>`).join('')}
                </div>

                <div class="tp-grupo" role="group" aria-label="Margem">
                    <button class="tp-btn tp-btn--icone" data-margem="-1" title="Menos margem" aria-label="Menos margem">
                        <i data-lucide="chevrons-left-right"></i>
                    </button>
                    <button class="tp-btn tp-btn--icone" data-margem="1" title="Mais margem" aria-label="Mais margem">
                        <i data-lucide="chevrons-right-left"></i>
                    </button>
                </div>

                <div class="tp-grupo">
                    <button class="tp-btn" data-fonte="-1" title="Diminuir a letra">A−</button>
                    <button class="tp-btn" data-fonte="1" title="Aumentar a letra">A+</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(camada);
    document.body.classList.add('tp-travado');
    if (window.lucide) lucide.createIcons();

    const palco = camada.querySelector('#tp-palco');
    const texto = camada.querySelector('#tp-texto');
    const play = camada.querySelector('#tp-play');
    const campoPpm = camada.querySelector('#tp-ppm');
    const campoTempo = camada.querySelector('#tp-tempo');
    const restante = camada.querySelector('#tp-restante');
    const barra = camada.querySelector('#tp-barra');
    const valorPpm = camada.querySelector('#tp-ppm-valor');

    const rolagemMax = () => Math.max(1, palco.scrollHeight - palco.clientHeight);

    const jeito = lerJeito();

    const aplicarJeito = () => {
        texto.style.fontSize = `${jeito.fonte}px`;
        /* Custom properties e não style direto: a nota de gravação é flex e
           ignora text-align, e uma variável herdada faz as duas obedecerem ao
           mesmo ajuste sem uma segunda regra para manter em dia. */
        texto.style.setProperty('--tp-alinhar', jeito.alinhar);
        texto.style.setProperty('--tp-flex',
            jeito.alinhar === 'center' ? 'center' : jeito.alinhar === 'left' ? 'flex-start' : 'flex-end');
        texto.style.setProperty('--tp-margem', `${jeito.margem}px`);
        camada.querySelectorAll('[data-alinhar]').forEach(b =>
            b.setAttribute('aria-pressed', String(b.dataset.alinhar === jeito.alinhar)));
        guardarJeito(jeito);
    };

    /* ── Mexer no jeito não pode perder o lugar ───────────────────────────
       Letra maior, mais margem e outro alinhamento mudam a ALTURA do texto, e
       a posição é guardada em pixels. Sem isto, aumentar a fonte no meio da
       gravação jogava a leitura para outro trecho — quanto maior a mudança,
       maior o salto. O que se preserva é a FRAÇÃO já lida. */
    const semPerderOLugar = (mexer) => {
        const fracao = palco.scrollTop / rolagemMax();
        mexer();
        posicao = fracao * rolagemMax();
        palco.scrollTop = posicao;
        atualizarNumeros();
    };

    const atualizarNumeros = () => {
        const andado = palco.scrollTop / rolagemMax();
        restante.textContent = mmss(duracao() * (1 - andado));
        barra.style.width = `${andado * 100}%`;
    };

    /* ── O laço ───────────────────────────────────────────────────────────
       Avança por DELTA de tempo, não por quadro: num aparelho a 60Hz e noutro
       a 120Hz, contar quadros faria o mesmo roteiro terminar na metade do
       tempo. */
    const passo = (agora) => {
        if (!rodando) return;
        const dt = (agora - ultimo) / 1000;
        ultimo = agora;

        posicao += (rolagemMax() / duracao()) * dt;
        palco.scrollTop = posicao;
        atualizarNumeros();

        if (posicao >= rolagemMax() - 1) return pausar(true);
        quadro = requestAnimationFrame(passo);
    };

    const iniciar = async () => {
        rodando = true;
        rotularPlay('pause', 'Pausar');
        ultimo = performance.now();
        quadro = requestAnimationFrame(passo);

        /* A tela não pode apagar no meio da gravação. Sem suporte, segue: é
           conforto, não requisito, e um erro aqui não pode derrubar o
           prompter. */
        try { trava = await navigator.wakeLock?.request('screen'); } catch { /* sem wake lock */ }
    };

    function pausar(fim = false) {
        rodando = false;
        cancelAnimationFrame(quadro);
        if (fim) rotularPlay('rotate-ccw', 'De novo');
        else rotularPlay('play', 'Continuar');
        trava?.release?.().catch(() => {});
        trava = null;
    }

    function rotularPlay(icone, rotulo) {
        play.innerHTML = `<i data-lucide="${icone}"></i> <span>${rotulo}</span>`;
        if (window.lucide) lucide.createIcons();
    }

    function voltarAoInicio() {
        posicao = 0;
        palco.scrollTop = 0;
        atualizarNumeros();
    }

    const alternar = () => {
        if (rodando) return pausar();
        if (posicao >= rolagemMax() - 1) voltarAoInicio();
        iniciar();
    };

    const sair = () => {
        pausar();
        document.removeEventListener('keydown', aoTeclado);
        document.body.classList.remove('tp-travado');
        camada.remove();
    };

    const mudarPpm = (novo) => {
        ppm = entre(Math.round(novo), MIN_PPM, MAX_PPM);
        campoPpm.value = ppm;
        valorPpm.textContent = ppm;
        campoTempo.value = mmss(duracao());
        atualizarNumeros();
    };

    function aoTeclado(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Escape') return sair();
        if (e.key === ' ') { e.preventDefault(); return alternar(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); return mudarPpm(ppm + 5); }
        if (e.key === 'ArrowDown') { e.preventDefault(); return mudarPpm(ppm - 5); }
        if (e.key.toLowerCase() === 'r') voltarAoInicio();
    }

    play.addEventListener('click', alternar);
    camada.querySelector('[data-tp-sair]').addEventListener('click', sair);
    camada.querySelector('#tp-reiniciar').addEventListener('click', voltarAoInicio);

    /* 'input' e não 'change': a faixa avisa a cada pixel arrastado, e é isso
       que faz o texto acelerar DEBAIXO do dedo. Esperar soltar transformaria o
       ajuste em tentativa e erro. */
    campoPpm.addEventListener('input', () => mudarPpm(Number(campoPpm.value) || PALAVRAS_POR_MINUTO));
    campoTempo.addEventListener('change', () => {
        const segundos = lerMMSS(campoTempo.value);
        /* Tempo inválido volta ao que estava, sem discutir: o número certo já
           está na tela, e um erro aqui não vale um aviso. */
        if (!segundos) { campoTempo.value = mmss(duracao()); return; }
        mudarPpm((palavras / segundos) * 60);
    });

    camada.querySelectorAll('[data-fonte]').forEach(b =>
        b.addEventListener('click', () => semPerderOLugar(() => {
            jeito.fonte = entre(jeito.fonte + Number(b.dataset.fonte) * 4, MIN_FONTE, MAX_FONTE);
            aplicarJeito();
        })));

    camada.querySelectorAll('[data-alinhar]').forEach(b =>
        b.addEventListener('click', () => semPerderOLugar(() => {
            jeito.alinhar = b.dataset.alinhar;
            aplicarJeito();
        })));

    camada.querySelectorAll('[data-margem]').forEach(b =>
        b.addEventListener('click', () => semPerderOLugar(() => {
            jeito.margem = entre(jeito.margem + Number(b.dataset.margem) * PASSO_MARGEM, 0, MAX_MARGEM);
            aplicarJeito();
        })));

    /* Rolar com o dedo é correção legítima: quem se perdeu volta duas linhas
       e continua. A posição interna passa a ser a de quem corrigiu — sem isto,
       o próximo quadro puxaria o texto de volta para onde o motor achava que
       estava. */
    palco.addEventListener('scroll', () => {
        if (Math.abs(palco.scrollTop - posicao) > 2) posicao = palco.scrollTop;
        atualizarNumeros();
    });
    document.addEventListener('keydown', aoTeclado);

    aplicarJeito();
    atualizarNumeros();
    return { erro: null };
};

const desenharBloco = (b) => {
    const t = tipoBloco(b.tipo);
    if (b.tipo === 'secao') {
        return `<p class="tp-secao">${esc(b.titulo || b.texto || 'Seção')}</p>`;
    }
    if (b.tipo === 'nota') {
        return `<p class="tp-nota"><i data-lucide="${esc(t.icone)}"></i> ${escLinhas(b.texto || '')}</p>`;
    }
    return `
        <p class="tp-fala tp-fala--${esc(b.tipo)}">
            ${b.titulo ? `<span class="tp-fala__titulo">${esc(b.titulo)}</span>` : ''}
            ${escLinhas(b.texto || '')}
        </p>`;
};

function injetarEstilos() {
    if (document.getElementById('teleprompter-styles')) return;
    const style = document.createElement('style');
    style.id = 'teleprompter-styles';
    style.textContent = `
        .tp {
            position: fixed; inset: 0; z-index: 700;
            display: flex; flex-direction: column;
            background: #000; color: #fff;
            font-family: var(--font-sans);
        }
        .tp-travado { overflow: hidden; }

        .tp-topo {
            display: flex; align-items: center; gap: var(--space-3);
            padding: var(--space-3) var(--space-4);
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }
        .tp-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tp-info strong { font-size: var(--text-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tp-info span { font-size: var(--text-xs); color: rgba(255, 255, 255, 0.55); }

        /* Preto puro, e não var(--surface): o prompter costuma ficar diante da
           lente, e qualquer cinza vira véu no vidro. */
        /* A caixa existe só para a marca ter onde se firmar. Ela morava DENTRO
           do palco, e o palco é o que rola: um filho absoluto de um contêiner
           com overflow rola junto com o conteúdo. Então a marca de leitura —
           que só serve para ficar parada — subia com o texto e desaparecia nos
           primeiros segundos. Fora do palco, o texto passa por baixo dela. */
        .tp-caixa { position: relative; flex: 1; min-height: 0; display: flex; }
        .tp-palco { flex: 1; overflow-y: auto; scrollbar-width: none; }
        .tp-palco::-webkit-scrollbar { display: none; }

        /* A largura sai de "o que cabe, menos a margem dos dois lados", e é
           por isso que o mesmo botão funciona no monitor e no celular: no
           monitor ele encolhe a coluna de 900px, no celular ele afasta o texto
           das bordas. Uma largura fixa em pixels não faria as duas coisas. */
        .tp-texto {
            width: max(140px, calc(min(900px, 100%) - var(--tp-margem, 24px) * 2));
            margin: 0 auto;
            padding: 40vh 0;
            font-size: 34px; line-height: 1.45; font-weight: 500;
            text-align: var(--tp-alinhar, center);
        }

        .tp-fala { margin: 0 0 0.9em; }
        .tp-fala--gancho { color: #C9A9FF; }
        .tp-fala--frase  { font-weight: 700; }
        .tp-fala--cta    { color: #8FE3B0; }
        .tp-fala__titulo { display: block; font-size: 0.5em; opacity: 0.6; margin-bottom: 0.2em; }

        /* Instrução não é fala: menor, apagada e sem peso, para o olho passar
           por cima dela enquanto se está falando. */
        .tp-secao {
            margin: 1.4em 0 0.8em; font-size: 0.42em; font-weight: 700;
            letter-spacing: 0.16em; text-transform: uppercase;
            color: rgba(255, 255, 255, 0.35);
        }
        .tp-nota {
            display: flex; align-items: center; justify-content: var(--tp-flex, center); gap: 8px;
            margin: 0 0 0.9em; font-size: 0.45em; font-style: italic;
            color: rgba(255, 255, 255, 0.4);
        }
        .tp-nota i, .tp-nota svg { width: 0.9em; height: 0.9em; }

        /* Sem a linha ligando os dois: ela cruzava o texto exatamente na
           altura em que o olho está, riscando a palavra sendo falada. Os
           triângulos dizem a mesma coisa a partir da borda, onde não há o que
           atrapalhar. Maiores que antes, porque agora carregam o recado
           sozinhos. */
        .tp-marca {
            position: absolute; left: 0; right: 0; top: 38%;
            pointer-events: none;
        }
        .tp-marca::before, .tp-marca::after {
            content: ""; position: absolute; top: -9px;
            border: 9px solid transparent;
        }
        .tp-marca::before { left: 0;  border-left-color: rgba(201, 169, 255, 0.9); }
        .tp-marca::after  { right: 0; border-right-color: rgba(201, 169, 255, 0.9); }

        .tp-controles {
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            padding: var(--space-3) var(--space-4);
            padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
            background: rgba(0, 0, 0, 0.9);
        }
        .tp-progresso { height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); margin-bottom: var(--space-3); }
        .tp-progresso span { display: block; height: 100%; width: 0; border-radius: 2px; background: #A855FF; }

        .tp-fileira { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; }
        /* A segunda fileira é ajuste, não comando: menor, apagada e separada
           por um fio, para o olho não disputá-la com o botão de rolar. */
        .tp-fileira--jeito {
            margin-top: var(--space-3); padding-top: var(--space-3);
            border-top: 1px solid rgba(255, 255, 255, 0.10);
            gap: var(--space-3);
        }
        .tp-grupo { display: flex; gap: 4px; }
        .tp-grupo:last-child { margin-left: auto; }

        .tp-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            min-height: 40px; padding: 0 var(--space-3);
            border: 1px solid rgba(255, 255, 255, 0.18); border-radius: var(--radius-sm);
            background: rgba(255, 255, 255, 0.06); color: #fff;
            font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 600;
            cursor: pointer;
        }
        .tp-btn:hover { background: rgba(255, 255, 255, 0.14); }
        .tp-btn i, .tp-btn svg { width: 16px; height: 16px; }
        .tp-btn--principal { min-width: 130px; background: #A855FF; border-color: transparent; }
        .tp-btn--principal:hover { background: #B96BFF; }
        .tp-btn--x { min-height: 34px; padding: 0 10px; }
        .tp-btn--icone { padding: 0 12px; }
        /* O alinhamento escolhido fica aceso: são três botões que fazem coisas
           parecidas, e sem marca é preciso olhar o texto para saber qual vale. */
        .tp-btn[aria-pressed="true"] {
            background: rgba(168, 85, 255, 0.28);
            border-color: rgba(168, 85, 255, 0.7);
            color: #E9D5FF;
        }

        .tp-campo { display: flex; flex-direction: column; gap: 3px; }
        .tp-campo span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.5); }
        /* 16px no campo: abaixo disso o Safari do iPhone amplia a página ao
           focar, e no meio de uma gravação isso é o pior momento possível. */
        .tp-campo input {
            width: 88px; height: 40px; padding: 0 10px;
            border: 1px solid rgba(255, 255, 255, 0.18); border-radius: var(--radius-sm);
            background: rgba(255, 255, 255, 0.06); color: #fff;
            font-family: var(--font-sans); font-size: 16px; text-align: center;
        }
        .tp-campo--faixa { flex: 1; min-width: 150px; max-width: 260px; }
        .tp-campo--faixa b { color: #fff; font-variant-numeric: tabular-nums; }
        .tp-campo--faixa input[type="range"] {
            width: 100%; height: 40px; margin: 0;
            accent-color: #A855FF; background: transparent; cursor: pointer;
        }

        .tp-restante {
            min-height: 40px; display: flex; align-items: center;
            padding: 0 var(--space-2);
            font-size: var(--text-h3); font-weight: 700; font-variant-numeric: tabular-nums;
        }

        @media (max-width: 720px) {
            .tp-texto { padding: 38vh 0; }
            .tp-btn--principal { flex: 1; }
            .tp-campo--faixa { max-width: none; }
            /* Na largura do celular as três caixas de ajuste cabem numa
               fileira só quando nenhuma delas é empurrada para a direita. */
            .tp-grupo:last-child { margin-left: 0; }
            /* Cada pixel de controle é um pixel a menos de texto, e no celular
               o texto é o que está sendo lido a um braço de distância. A
               fileira de ajuste encolhe porque ela se mexe uma vez, antes de
               gravar — não com a câmera rodando. */
            .tp-fileira--jeito {
                justify-content: space-between; gap: var(--space-2);
                margin-top: var(--space-2); padding-top: var(--space-2);
            }
            .tp-fileira--jeito .tp-btn { min-height: 36px; }
        }
    `;
    document.head.appendChild(style);
}
