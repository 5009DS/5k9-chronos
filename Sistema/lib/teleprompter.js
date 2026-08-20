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

   ── A LINHA DE LEITURA ────────────────────────────────────────────────────
   Fica a 38% da altura, e não no meio: quem lê em prompter olha um pouco acima
   do centro da lente, e o texto seguinte precisa estar visível abaixo dela. O
   respiro de 40vh em cima e embaixo existe para a primeira e a última fala
   também alcançarem a linha.
   ═══════════════════════════════════════════════════════════════════════════ */

const MIN_PPM = 60;
const MAX_PPM = 320;

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

        <div class="tp-palco" id="tp-palco">
            <div class="tp-linha" aria-hidden="true"></div>
            <div class="tp-texto" id="tp-texto">
                ${blocos.map(desenharBloco).join('')}
            </div>
        </div>

        <div class="tp-controles">
            <div class="tp-progresso"><span id="tp-barra"></span></div>

            <div class="tp-linha-controles">
                <button class="tp-btn tp-btn--principal" id="tp-play">
                    <i data-lucide="play"></i> <span>Rolar</span>
                </button>
                <button class="tp-btn" id="tp-reiniciar" title="Voltar ao início (R)">
                    <i data-lucide="rotate-ccw"></i>
                </button>

                <label class="tp-campo">
                    <span>Palavras / min</span>
                    <input type="number" id="tp-ppm" min="${MIN_PPM}" max="${MAX_PPM}" step="5" value="${ppm}">
                </label>

                <label class="tp-campo">
                    <span>Tempo total</span>
                    <input type="text" id="tp-tempo" inputmode="numeric" value="${mmss(duracao())}">
                </label>

                <span class="tp-restante" id="tp-restante">${mmss(duracao())}</span>

                <div class="tp-extras">
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

    let fonte = 34;
    const aplicarFonte = () => { texto.style.fontSize = `${fonte}px`; };
    aplicarFonte();

    const rolagemMax = () => Math.max(1, palco.scrollHeight - palco.clientHeight);

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
        ppm = Math.min(MAX_PPM, Math.max(MIN_PPM, Math.round(novo)));
        campoPpm.value = ppm;
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

    campoPpm.addEventListener('change', () => mudarPpm(Number(campoPpm.value) || PALAVRAS_POR_MINUTO));
    campoTempo.addEventListener('change', () => {
        const segundos = lerMMSS(campoTempo.value);
        /* Tempo inválido volta ao que estava, sem discutir: o número certo já
           está na tela, e um erro aqui não vale um aviso. */
        if (!segundos) { campoTempo.value = mmss(duracao()); return; }
        mudarPpm((palavras / segundos) * 60);
    });

    camada.querySelectorAll('[data-fonte]').forEach(b =>
        b.addEventListener('click', () => {
            fonte = Math.min(96, Math.max(18, fonte + Number(b.dataset.fonte) * 4));
            aplicarFonte();
            atualizarNumeros();
        }));

    /* Rolar com o dedo é correção legítima: quem se perdeu volta duas linhas
       e continua. A posição interna passa a ser a de quem corrigiu — sem isto,
       o próximo quadro puxaria o texto de volta para onde o motor achava que
       estava. */
    palco.addEventListener('scroll', () => {
        if (Math.abs(palco.scrollTop - posicao) > 2) posicao = palco.scrollTop;
        atualizarNumeros();
    });
    document.addEventListener('keydown', aoTeclado);

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
        .tp-palco { flex: 1; overflow-y: auto; position: relative; scrollbar-width: none; }
        .tp-palco::-webkit-scrollbar { display: none; }

        .tp-texto {
            max-width: 900px; margin: 0 auto;
            padding: 40vh var(--space-5);
            font-size: 34px; line-height: 1.45; font-weight: 500;
            text-align: center;
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
            display: flex; align-items: center; justify-content: center; gap: 8px;
            margin: 0 0 0.9em; font-size: 0.45em; font-style: italic;
            color: rgba(255, 255, 255, 0.4);
        }
        .tp-nota i, .tp-nota svg { width: 0.9em; height: 0.9em; }

        .tp-linha {
            position: absolute; left: 0; right: 0; top: 38%;
            border-top: 1px solid rgba(201, 169, 255, 0.5);
            pointer-events: none;
        }
        .tp-linha::before, .tp-linha::after {
            content: ""; position: absolute; top: -5px;
            border: 5px solid transparent;
        }
        .tp-linha::before { left: 0;  border-left-color: rgba(201, 169, 255, 0.8); }
        .tp-linha::after  { right: 0; border-right-color: rgba(201, 169, 255, 0.8); }

        .tp-controles {
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            padding: var(--space-3) var(--space-4);
            padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
            background: rgba(0, 0, 0, 0.9);
        }
        .tp-progresso { height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); margin-bottom: var(--space-3); }
        .tp-progresso span { display: block; height: 100%; width: 0; border-radius: 2px; background: #A855FF; }

        .tp-linha-controles { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; }

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
        .tp-restante {
            min-height: 40px; display: flex; align-items: center;
            padding: 0 var(--space-2);
            font-size: var(--text-h3); font-weight: 700; font-variant-numeric: tabular-nums;
        }
        .tp-extras { display: flex; gap: var(--space-2); margin-left: auto; }

        @media (max-width: 720px) {
            .tp-texto { padding: 38vh var(--space-4); }
            .tp-extras { margin-left: 0; }
            .tp-btn--principal { flex: 1; }
        }
    `;
    document.head.appendChild(style);
}
