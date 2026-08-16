/* ═══════════════════════════════════════════════════════════════════════════
   ARRASTAR E SOLTAR — com o dedo, não só com o mouse.

   ── POR QUE NÃO O DRAG AND DROP NATIVO ────────────────────────────────────
   O `draggable="true"` do HTML é a solução óbvia e não serve aqui: ele
   simplesmente NÃO EXISTE em toque. Num iPad, arrastar um conteúdo não
   acontece — sem erro, sem aviso, o item só não se move. E o cronograma é
   consultado em tablet com frequência suficiente para isso ser um defeito, não
   uma limitação aceitável.

   Aqui o arraste é montado sobre Pointer Events, que unificam mouse, caneta e
   toque num único conjunto de eventos.

   ── A ARMADILHA DO TOQUE, E COMO ELA É RESOLVIDA ──────────────────────────
   Em toque, arrastar e ROLAR A PÁGINA são o mesmo gesto. Se o arraste começar
   no primeiro pixel de movimento, a lista deixa de rolar — o cronograma vira
   uma tela onde a pessoa tenta descer e sai movendo conteúdo sem querer.

   A saída é distinguir por INTENÇÃO:
     · mouse  → arrasta assim que passa de 6px. Quem usa mouse já rola na roda.
     · toque  → exige TOQUE LONGO (320ms parado). Antes disso o dedo rola a
                página normalmente; depois, o navegador entrega o gesto para
                nós via setPointerCapture.

   320ms é o intervalo usado pelo próprio iOS para o menu de contexto: curto o
   bastante para não parecer travado, longo o bastante para não disparar quando
   alguém só passou o dedo.

   ── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
   Não reordena listas nem anima posições. Ele responde uma pergunta só: "este
   item foi solto sobre qual alvo?". A consequência é de quem chama.
   ═══════════════════════════════════════════════════════════════════════════ */

const LIMITE_MOUSE = 6;       // px de movimento que já contam como arraste
const ESPERA_TOQUE = 320;     // ms de toque parado antes de o arraste começar

/**
 * @param {HTMLElement} raiz        onde procurar itens e alvos
 * @param {object}   opts
 * @param {string}   opts.item      seletor dos elementos arrastáveis
 * @param {string}   opts.alvo      seletor das áreas que recebem
 * @param {function} opts.aoSoltar  (idItem, idAlvo, elementos) => void
 * @param {function} [opts.podeSoltar] (idItem, idAlvo) => boolean
 * @returns {function} solta os ouvintes
 */
export const ativarArraste = (raiz, { item, alvo, aoSoltar, podeSoltar }) => {
    injectStyles();

    let estado = null;   // { el, fantasma, idItem, alvoAtual, timer, x0, y0, ativo }

    const limpar = () => {
        if (!estado) return;
        clearTimeout(estado.timer);
        estado.el.classList.remove('ar-origem');
        estado.fantasma?.remove();
        raiz.querySelectorAll('.ar-sobre').forEach(e => e.classList.remove('ar-sobre'));
        document.body.classList.remove('ar-arrastando');
        try { estado.el.releasePointerCapture(estado.id); } catch { /* já solto */ }
        estado = null;
    };

    const comecar = () => {
        if (!estado || estado.ativo) return;
        estado.ativo = true;

        /* O fantasma é uma CÓPIA que segue o ponteiro, e o original fica no
           lugar esmaecido. Mover o próprio elemento seria mais simples e
           quebraria a grade: tirá-lo do fluxo faz o resto da coluna pular, e
           a pessoa perde a referência de onde ele estava. */
        const r = estado.el.getBoundingClientRect();
        const f = estado.el.cloneNode(true);
        f.classList.add('ar-fantasma');
        f.style.width = `${r.width}px`;
        f.style.left = `${r.left}px`;
        f.style.top = `${r.top}px`;
        document.body.appendChild(f);

        estado.fantasma = f;
        estado.dx = estado.x0 - r.left;
        estado.dy = estado.y0 - r.top;
        estado.el.classList.add('ar-origem');
        document.body.classList.add('ar-arrastando');

        if (navigator.vibrate) navigator.vibrate(8);   // confirma o pega no toque
    };

    const aoDescer = (e) => {
        if (e.button > 0) return;                       // só botão principal
        const el = e.target.closest(item);
        if (!el || !raiz.contains(el)) return;

        /* Um clique em controle DENTRO do cartão não vira arraste. O `!== el` é
           essencial e não é detalhe: no cronograma o cartão inteiro é um
           <button>, então sem essa comparação `closest('button')` devolveria o
           próprio cartão e o arraste nunca começaria naquela tela. */
        const interativo = e.target.closest('button, a, select, input, textarea');
        if (interativo && interativo !== el) return;

        estado = {
            el, id: e.pointerId, idItem: el.dataset.arrastavel,
            x0: e.clientX, y0: e.clientY, ativo: false,
            toque: e.pointerType !== 'mouse',
        };
        /* A captura é uma OTIMIZAÇÃO — ela garante que os eventos continuem
           chegando mesmo se o ponteiro sair do elemento. Quando ela falha (o
           navegador recusa ponteiro que já não está ativo), o arraste ainda
           funciona pelos eventos que borbulham até a raiz.

           O try/catch não é decorativo: sem ele a exceção interrompe a função
           ANTES do setTimeout abaixo, e o toque longo simplesmente nunca
           dispara — o arraste some no celular sem deixar erro visível. */
        try { el.setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }

        if (estado.toque) estado.timer = setTimeout(comecar, ESPERA_TOQUE);
    };

    const aoMover = (e) => {
        if (!estado || e.pointerId !== estado.id) return;

        if (!estado.ativo) {
            const andou = Math.hypot(e.clientX - estado.x0, e.clientY - estado.y0);
            /* Em toque, mover antes da espera é rolagem: cancela o arraste e
               devolve o gesto para a página. Em mouse, mover É o arraste. */
            if (estado.toque) { if (andou > 10) limpar(); return; }
            if (andou < LIMITE_MOUSE) return;
            comecar();
        }

        e.preventDefault();
        estado.fantasma.style.left = `${e.clientX - estado.dx}px`;
        estado.fantasma.style.top = `${e.clientY - estado.dy}px`;

        /* elementFromPoint com o fantasma escondido: ele está sob o ponteiro e
           devolveria a si mesmo. `pointer-events: none` no fantasma resolveria,
           mas quebra o clone quando ele tem filhos interativos. */
        estado.fantasma.style.display = 'none';
        const sob = document.elementFromPoint(e.clientX, e.clientY);
        estado.fantasma.style.display = '';

        const destino = sob?.closest(alvo);
        const idAlvo = destino?.dataset.solta;
        const vale = destino && raiz.contains(destino)
            && (!podeSoltar || podeSoltar(estado.idItem, idAlvo));

        if (destino !== estado.alvoAtual) {
            estado.alvoAtual?.classList.remove('ar-sobre');
            estado.alvoAtual = vale ? destino : null;
            estado.alvoAtual?.classList.add('ar-sobre');
        }
    };

    const aoSubir = (e) => {
        if (!estado || e.pointerId !== estado.id) return;
        const { ativo, alvoAtual, idItem, el } = estado;
        limpar();
        if (!ativo) return;

        /* Um arraste termina com `click` no elemento de origem, e no cronograma
           esse elemento navega para o roteiro. Sem engolir o clique seguinte, a
           pessoa move um conteúdo e é levada para outra tela — parecendo que o
           movimento não aconteceu. `capture` para chegar antes de qualquer
           ouvinte, e `once` para não afetar o próximo clique de verdade. */
        document.addEventListener('click', engolir, { capture: true, once: true });

        if (alvoAtual) aoSoltar(idItem, alvoAtual.dataset.solta, { item: el, alvo: alvoAtual });
    };

    const engolir = (e) => { e.preventDefault(); e.stopPropagation(); };

    raiz.addEventListener('pointerdown', aoDescer);
    raiz.addEventListener('pointermove', aoMover);
    raiz.addEventListener('pointerup', aoSubir);
    raiz.addEventListener('pointercancel', limpar);

    return () => {
        limpar();
        raiz.removeEventListener('pointerdown', aoDescer);
        raiz.removeEventListener('pointermove', aoMover);
        raiz.removeEventListener('pointerup', aoSubir);
        raiz.removeEventListener('pointercancel', limpar);
    };
};

// ─────────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('arrastar-styles')) return;
    const style = document.createElement('style');
    style.id = 'arrastar-styles';
    style.textContent = `
        /* touch-action: manipulation deixa a rolagem vertical funcionar e tira
           só o atraso de 300ms do duplo toque. A trava da rolagem durante o
           arraste vem do preventDefault no pointermove, que só acontece depois
           do toque longo — antes disso a página rola como sempre. */
        [data-arrastavel] { touch-action: manipulation; -webkit-user-select: none; user-select: none; }

        .ar-origem { opacity: 0.28; }

        .ar-fantasma {
            position: fixed; z-index: 900; margin: 0;
            pointer-events: none;
            box-shadow: var(--shadow-lg);
            transform: rotate(1.2deg) scale(1.02);
            opacity: 0.96;
            transition: none;
        }

        /* O alvo válido se acende inteiro. Um contorno fino se perde no meio de
           uma grade cheia — e errar o alvo é o custo mais caro deste gesto. */
        .ar-sobre {
            outline: 2px dashed var(--accent);
            outline-offset: -2px;
            background: var(--accent-muted) !important;
        }

        /* Durante o arraste o cursor é o mesmo em toda a tela: sem isto ele
           pisca entre "mover" e "texto" a cada elemento que passa por baixo. */
        body.ar-arrastando, body.ar-arrastando * { cursor: grabbing !important; }
        body.ar-arrastando { -webkit-user-select: none; user-select: none; }

        @media (prefers-reduced-motion: reduce) {
            .ar-fantasma { transform: none; }
        }
    `;
    document.head.appendChild(style);
}
