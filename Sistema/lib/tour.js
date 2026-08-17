/* ═══════════════════════════════════════════════════════════════════════════
   O TOUR DA TELA DO CLIENTE

   Roda uma vez, na primeira visita. O cronograma que aparece por trás é o
   DELE — é a agenda dele que ele precisa aprender a ler. O roteiro é um
   MODELO, pelo motivo explicado logo abaixo.

   ── O QUE ELE NUNCA FAZ ───────────────────────────────────────────────────
   NÃO GRAVA NADA. O passo que mostra "a equipe ajustou" monta um bloco falso
   no DOM, com as mesmas classes do de verdade, e o apaga ao sair. Um tour que
   cria um retorno de mentira no banco custaria uma linha no histórico que
   ninguém escreveu — e o histórico é a peça deste sistema que precisa ser
   confiável acima de tudo.

   Tudo que ele inventa carrega `data-tour`, e a limpeza tira tudo de uma vez.

   ── POR QUE localStorage, E NÃO IP OU "IDENTIFICAÇÃO DO APARELHO" ─────────
   O pedido era mostrar uma vez por pessoa. IP não identifica pessoa: uma
   clínica inteira sai pelo mesmo endereço (o tour sumiria para a segunda
   pessoa, que nunca o viu) e o IP de celular muda sozinho ao trocar de torre
   (o tour voltaria para quem já viu). Errado nas duas direções. Além disso o
   navegador não entrega o IP para o JavaScript — só o servidor o vê, e este
   sistema não tem servidor.

   "Identificação do aparelho" de verdade é impressão digital de navegador:
   dá trabalho, funciona mal e é dado pessoal coletado sem consentimento para
   resolver "não mostrar um aviso duas vezes". Não compensa nem tecnicamente
   nem legalmente.

   Então: uma marca no navegador dele, por token de cliente. O limite é
   honesto — quem abrir noutro aparelho vê o tour de novo, e quem limpar o
   navegador também. Nenhum dos dois casos causa dano: o custo é ver uma
   explicação repetida, e o botão de fechar está no primeiro passo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   O CONTEÚDO MODELO

   O tour usava um conteúdo REAL do cliente para mostrar a tela de roteiro. Era
   sedutor — "veja o seu, não um exemplo" — e errado por dois motivos.

   O primeiro é que quebrava. Cliente novo, ou cliente cujo único roteiro
   acabou de ser apagado, não tinha o que mostrar, e o tour desistia calado.

   O segundo é pior e não teria conserto: a explicação ficava refém do estado
   do dado. O passo do comentário depende de haver fala; o passo da resposta,
   de haver conversa; o do "Aprovar", de estar aguardando resposta. Com o
   conteúdo real, cada cliente veria uma versão diferente do tour, e algumas
   veriam uma versão sem sentido — "é assim que a resposta chega" apontando
   para uma fala que ninguém comentou.

   Então o tour tem o próprio conteúdo. Ele NÃO existe no banco, não pertence
   a cliente nenhum e não entra em cronograma: é montado na memória, desenhado
   pelos MESMOS componentes da tela de verdade, e desaparece quando o tour
   fecha. A tela mostra, em cima, que aquilo é exemplo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MODELO = {
    conteudo: {
        id: 'tour-modelo',
        titulo: 'Flacidez na face depois do emagrecimento',
        tema: 'Por que o rosto muda quando o peso cai, e o que dá para fazer a respeito.',
        fase: 'meio',
        objetivo: 'educacao',
        formato: 'Reels',
        canal: 'Instagram',
        status: 'em_revisao',
        intencao: 'Explicar a causa antes de falar em tratamento, para a consulta chegar '
                + 'como consequência do entendimento e não como oferta.',
        data: new Date().toISOString().slice(0, 10),
    },
    /* A tipagem segue as mesmas três regras do parser (lib/importar.js): a
       primeira fala é gancho, a última é chamada para ação porque pede algo, e
       "Isso é mais comum do que parece." é frase curta — cabe em 58
       caracteres, não tem vírgula e termina em ponto. */
    blocos: [
        ['gancho', 'Você emagreceu e percebeu que seu rosto ficou mais "caído" ou com aspecto mais envelhecido?'],
        ['frase',  'Isso é mais comum do que parece.'],
        ['fala',   'Quando perdemos peso, não eliminamos apenas gordura corporal. Também ocorre uma redução dos compartimentos de gordura da face, que são importantes para sustentar e dar volume ao rosto.'],
        ['fala',   'Dependendo da idade, da qualidade da pele, da genética e da velocidade do emagrecimento, essa perda de volume pode deixar a flacidez mais evidente.'],
        ['fala',   'Mas isso não significa que você precisa escolher entre emagrecer ou ter um rosto bonito.'],
        ['fala',   'Hoje existem tratamentos dermatológicos capazes de estimular colágeno, melhorar a firmeza da pele e restaurar pontos estratégicos de sustentação facial.'],
        ['fala',   'O mais importante é entender que cada rosto envelhece e responde de uma forma diferente.'],
        ['fala',   'Por isso, a avaliação individualizada é fundamental para definir o melhor plano de tratamento.'],
        ['cta',    'Eu sou a Dra. Laiz Lourenço, médica dermatologista do Instituto Dr. Tigre e te aguardo pra uma avaliação!'],
    ].map(([tipo, texto], i) => ({
        id: `tour-b${i}`,
        conteudo_id: 'tour-modelo',
        tipo,
        texto,
        ordem: (i + 1) * 10,
    })),
};

const CHAVE = '5k9_visualizador_tour';

export const tourVisto = (token) => {
    try { return !!localStorage.getItem(`${CHAVE}_${token}`); } catch { return true; }
    /* `true` no catch: sem localStorage não há como lembrar que já mostrou, e
       um tour que reabre em toda visita é pior que um tour que nunca aparece. */
};

export const marcarTourVisto = (token) => {
    try { localStorage.setItem(`${CHAVE}_${token}`, new Date().toISOString()); } catch { /* segue */ }
};

/* Só o primeiro nome de quem aprova. "Bem-vindo, Dra. Helena (marketing)"
   parece etiqueta de crachá; e quando não há contato cadastrado, o nome do
   cliente ("Instituto Dr. Tigre") ainda funciona como saudação. */
const saudar = (cliente) => {
    const contato = (cliente?.contato || '').split(/[(,–-]/)[0].trim();
    return contato || cliente?.nome || '';
};

/**
 * @param {object}   opcoes
 * @param {object}   opcoes.cliente
 * @param {Function} opcoes.irPara  ('modelo'|null) => Promise, redesenha a tela
 * @param {Function} opcoes.aoFim   chamada no fim e no fechar
 */
export const iniciarTour = ({ cliente, irPara, aoFim }) => {
    injetarEstilos();

    const camada = document.createElement('div');
    camada.className = 'tr';
    camada.innerHTML = `
        <div class="tr-bloqueio"></div>
        <div class="tr-foco" hidden></div>
        <div class="tr-card" role="dialog" aria-modal="true" aria-labelledby="tr-titulo"></div>`;
    document.body.appendChild(camada);
    document.body.classList.add('tr-travado');

    const bloqueio = camada.querySelector('.tr-bloqueio');
    const foco = camada.querySelector('.tr-foco');
    const card = camada.querySelector('.tr-card');

    let i = 0;
    let tela = 'cronograma';
    let alvoAtual = null;
    let ciclo = null;

    /* ── O passeio pelos cartões ──────────────────────────────────────────
       A região da estratégia tem quatro ou cinco cartões, e o passo fala de
       todos de uma vez. Destacar um por vez, em ciclo, mostra QUAIS são sem
       precisar de quatro passos — a leitura acompanha o destaque em vez de
       procurar sozinha o que o texto está descrevendo. */
    const pararRealce = () => {
        clearInterval(ciclo);
        ciclo = null;
        document.querySelectorAll('.tr-realce').forEach(e => e.classList.remove('tr-realce'));
    };

    const realcarEmCiclo = (seletor) => {
        pararRealce();
        const itens = [...document.querySelectorAll(seletor)].filter(e => e.offsetHeight > 20);
        if (itens.length < 2) return;
        let n = -1;
        const passar = () => {
            itens.forEach(e => e.classList.remove('tr-realce'));
            n = (n + 1) % itens.length;
            const el = itens[n];
            el.classList.add('tr-realce');

            /* O destaque sem a tela junto não serve para nada: a região é mais
               alta que o celular, então o ciclo passava por cartões fora de
               vista e, de fora, parecia travado num só. A tela acompanha, e o
               recorte da cortina passa a ser o cartão da vez — o holofote anda
               em vez de iluminar a região inteira.

               Rolagem seca, sem animação: são quatro trocas em seis segundos, e
               animar cada uma deixaria a página em movimento contínuo. */
            const r = el.getBoundingClientRect();
            const ideal = 96;
            if (Math.abs(r.top - ideal) > 24) window.scrollBy(0, r.top - ideal);
            alvoAtual = el;
            posicionar();
        };
        passar();
        ciclo = setInterval(passar, 1500);
    };

    // ── Os passos ────────────────────────────────────────────────────────
    const TODOS = [
        {
            tela: 'cheia',
            titulo: `Bem-vindo ao Chronos, ${saudar(cliente)}`,
            texto: 'Aqui você acompanha tudo que vai ao ar: o que está programado para cada '
                 + 'semana do mês, o roteiro de cada peça antes da gravação e — o que costuma '
                 + 'faltar — <strong>por que</strong> cada conteúdo foi pensado daquele jeito.'
                 + '<br><br>São dois minutos. Dá para sair a qualquer momento no X ali em cima.',
            botao: 'Começar',
        },
        {
            tela: 'cronograma',
            alvo: () => document.querySelector('.cl-legenda'),
            titulo: 'Primeiro, o funil',
            texto: 'Todo conteúdo tem um papel, e a semana é montada por papéis: começa falando '
                 + 'com quem já está pronto para decidir e termina abrindo a porta para quem '
                 + 'ainda não conhece você. É o <strong>Funil Invertido</strong> — e é isso que '
                 + 'as cores dos cartões dizem.',
        },
        {
            tela: 'cronograma',
            alvo: () => document.querySelector('.vz-semana--atual') || document.querySelector('.vz-semana'),
            titulo: 'A semana inteira, de uma vez',
            texto: 'Cada bloco datado é uma semana de publicação. Ver os três conteúdos juntos '
                 + 'é o que mostra se ela está equilibrada — e as bolinhas no canto dizem quais '
                 + 'dos três papéis já estão preenchidos.',
        },
        {
            tela: 'cronograma',
            alvo: () => document.querySelector('.vz-conteudo'),
            titulo: 'O cartão diz o essencial',
            texto: 'Dia da publicação, papel no funil, formato — reels, carrossel, story — e em '
                 + 'que pé está: esperando você, aprovado ou com ajuste pedido. Tocar no cartão '
                 + 'abre o roteiro.',
            botao: 'Ver um roteiro',
            // O clique é simulado: a pessoa precisa VER que foi o toque no
            // cartão que abriu a próxima tela, senão a navegação parece um
            // salto do sistema e não uma ação dela.
            depois: async () => {
                const cartao = document.querySelector('.vz-conteudo');
                if (cartao) await simularToque(camada, cartao);
            },
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('.cl-estrategia') || document.querySelector('.cl-ficha'),
            titulo: 'Por que este conteúdo existe',
            antes: () => realcarEmCiclo('.cl-estrategia > *'),
            texto: 'Esta parte é escrita pelo sistema, não por nós: ele cruza o papel no funil '
                 + 'com o objetivo da peça e explica o que ela precisa provocar, o que evitar e '
                 + 'como medir depois de publicada. É a resposta para "por que estamos gravando '
                 + 'isso".',
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('.cl-roteiro'),
            titulo: 'O roteiro, como vai ser gravado',
            texto: 'Falado, na ordem. O gancho é a primeira frase, a chamada para ação é a '
                 + 'última, e o tempo estimado de fala aparece no topo. Leia como se estivesse '
                 + 'na frente da câmera — é assim que ele vai soar.',
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('.cl-fala'),
            titulo: 'Não gostou de uma frase? Toque nela',
            texto: 'A fala fica marcada e o campo abre logo abaixo, sem tirar o texto da sua '
                 + 'frente. Escreva o que incomodou — <em>"essa palavra ficou dura"</em> basta — '
                 + 'e envie. Chega para a equipe já apontando a frase exata.',
            antes: () => {
                const fala = document.querySelector('.cl-fala');
                if (fala && !document.querySelector('.cl-comentario')) {
                    fala.click();
                    /* O campo recebe foco sozinho ao abrir — é o certo quando
                       foi a pessoa que tocou. Aqui quem tocou foi o tour, e o
                       teclado do celular subindo por conta própria come metade
                       da tela justamente no passo que explica a tela. */
                    document.activeElement?.blur?.();
                }
            },
            alvoDepoisDoAntes: () => {
                const fala = document.querySelector('.cl-fala');
                const caixa = document.querySelector('.cl-comentario');
                return caixa && fala ? [fala, caixa] : fala;
            },
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('.cl-barra'),
            titulo: 'Ou fale da peça inteira',
            texto: '<strong>Pedir ajuste</strong> abre um campo sobre o conteúdo todo — para '
                 + 'quando o problema não é uma frase, e sim a ideia. Escreva, assine com seu '
                 + 'nome e toque em <strong>Enviar pedido</strong>. Pode pedir quantas vezes '
                 + 'precisar.',
            antes: fecharComentario,
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('[data-tour="fio"]') || document.querySelector('.cl-fala'),
            titulo: 'A resposta volta aqui',
            texto: 'Quando a equipe mexe no que você pediu, o retorno aparece grudado na fala — '
                 + 'com o que foi feito e quando. Nada de procurar a diferença relendo o roteiro. '
                 + 'Se ficou bom, um toque encerra o assunto.',
            antes: () => montarFioFalso(cliente),
            // O que este passo mostra é uma DEMONSTRAÇÃO, e a tela diz isso
            // com todas as letras. Um exemplo que se confunde com dado real é
            // pior que nenhum exemplo.
            aviso: 'Exemplo só para o tour — nada disto foi gravado.',
        },
        {
            tela: 'conteudo',
            alvo: () => document.querySelector('#cl-aprovar') || document.querySelector('.cl-barra'),
            titulo: 'E quando estiver bom, aprove',
            texto: 'Aprovar é o sinal verde para a gravação. A equipe vê na hora, e a data fica '
                 + 'registrada — se alguém perguntar depois quando aquilo foi aprovado, a '
                 + 'resposta está aqui.',
            antes: limparFalso,
        },
        {
            tela: 'cheia',
            titulo: 'É só isso, obrigado pela paciência',
            texto: 'Agora é seu: acompanhe a semana, leia os roteiros, peça ajuste no que não '
                 + 'ficou com a sua cara e aprove o que estiver pronto.'
                 + '<br><br>Ficou alguma dúvida? Fale com a gente — a equipe responde no mesmo '
                 + 'canal em que você recebeu este link.',
            botao: 'Finalizar',
        },
    ];

    /* Nenhum passo depende do dado do cliente: os de dentro do roteiro rodam
       sobre o conteúdo modelo, que existe sempre. O tour tem o mesmo tamanho
       para todo mundo. */
    const passos = TODOS;

    // ── Motor ────────────────────────────────────────────────────────────
    const sair = () => {
        pararRealce();
        limparFalso();
        fecharComentario();
        window.removeEventListener('resize', posicionar);
        window.removeEventListener('scroll', posicionar, true);
        document.removeEventListener('keydown', aoTeclado);
        document.body.classList.remove('tr-travado');
        camada.remove();
        aoFim?.();
    };

    const aoTeclado = (e) => {
        if (e.key === 'Escape') sair();
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); avancar(); }
    };

    const avancar = async () => {
        const p = passos[i];
        await p?.depois?.();
        if (i >= passos.length - 1) return sair();
        i++;
        await mostrar();
    };

    async function mostrar() {
      /* Try/catch em volta do passo inteiro: um passo que estoura no meio
         deixava o tour parado no card anterior, sem erro visível — a pessoa
         aperta "Próximo" e nada acontece. Agora ele registra e segue. */
      try {
        pararRealce();
        const p = passos[i];

        if (p.tela !== tela && p.tela !== 'cheia') {
            card.classList.add('is-indo');
            await irPara(p.tela === 'conteudo' ? 'modelo' : null);
            tela = p.tela;
            card.classList.remove('is-indo');
        }

        await p.antes?.();

        alvoAtual = p.tela === 'cheia' ? null : (p.alvoDepoisDoAntes || p.alvo)?.();
        // Passo cujo alvo não existe nesta conta (um cliente sem roteiro, por
        // exemplo) é PULADO, não mostrado apontando para o nada.
        if (p.tela !== 'cheia' && !alvoAtual) return avancar();

        desenharCard(p);
        const primeiro = Array.isArray(alvoAtual) ? alvoAtual[0] : alvoAtual;
        /* Rolagem instantânea, não suave: entre um passo e outro o salto é
           esperado, e `behavior: 'smooth'` já foi visto sendo ignorado em
           silêncio por navegador — com o alvo fora da tela, o foco assentaria
           no lugar errado. */
        /* O alvo sobe para PERTO DO TOPO, nunca para o centro. Centralizado,
           ele dividia a tela com o card — e no celular, onde o card ocupa
           metade da altura, a metade de baixo do alvo ficava atrás dele. Com o
           alvo em cima e o card embaixo, os dois cabem. Elemento fixo (a barra
           de ação) não rola: rolar por ele moveria a página inteira à toa. */
        if (primeiro && getComputedStyle(primeiro).position !== 'fixed') {
            window.scrollBy(0, primeiro.getBoundingClientRect().top - 72);
        }
        requestAnimationFrame(posicionar);
      } catch (e) {
        console.error('[tour] passo', i + 1, 'falhou:', e);
        if (i >= passos.length - 1) return sair();
        i++;
        return mostrar();
      }
    }

    function desenharCard(p) {
        const ultimo = i === passos.length - 1;
        camada.classList.toggle('tr--cheia', p.tela === 'cheia');
        foco.hidden = p.tela === 'cheia';

        card.innerHTML = `
            <div class="tr-card__topo">
                <span class="tr-card__conta">${i + 1} de ${passos.length}</span>
                <button class="tr-card__x" data-tr-sair aria-label="Fechar o tour">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <h3 class="tr-card__titulo" id="tr-titulo">${p.titulo}</h3>
            <p class="tr-card__texto">${p.texto}</p>
            ${p.aviso ? `<p class="tr-card__aviso"><i data-lucide="flask-conical"></i> ${p.aviso}</p>` : ''}
            <div class="tr-card__pe">
                <div class="tr-pontos">
                    ${passos.map((_, n) => `<span class="tr-ponto ${n === i ? 'is-atual' : ''} ${n < i ? 'is-visto' : ''}"></span>`).join('')}
                </div>
                <button class="ds-btn ds-btn--primary ds-btn--sm" data-tr-proximo>
                    ${p.botao || (ultimo ? 'Finalizar' : 'Próximo')}
                </button>
            </div>`;

        card.querySelector('[data-tr-sair]').addEventListener('click', sair);
        card.querySelector('[data-tr-proximo]').addEventListener('click', avancar);
        if (window.lucide) lucide.createIcons();
    }

    /* O buraco na cortina: um retângulo com sombra gigante ao redor. Uma
       máscara de verdade (clip-path, SVG) daria o mesmo efeito e obrigaria a
       recalcular um caminho a cada rolagem — a sombra é uma propriedade só. */
    function posicionar() {
        if (!camada.isConnected) return;
        const p = passos[i];
        if (!p) return;

        if (p.tela === 'cheia' || !alvoAtual) {
            foco.hidden = true;
            card.style.cssText = '';
            return;
        }

        const alvos = (Array.isArray(alvoAtual) ? alvoAtual : [alvoAtual]).filter(Boolean);
        const caixas = alvos.map(a => a.getBoundingClientRect());
        const folga = 8;
        /* Nunca acima da borda: com o alvo encostado no topo da janela, a
           folga de 8px jogaria o recorte para fora e o destaque abriria
           cortado na primeira linha. */
        const topo = Math.max(folga, Math.min(...caixas.map(r => r.top)) - folga);
        const esq  = Math.min(...caixas.map(r => r.left)) - folga;
        const dir  = Math.max(...caixas.map(r => r.right)) + folga;
        /* Alvo mais alto que a tela — o roteiro inteiro é o caso — tem o
           destaque cortado na altura do que cabe. Um buraco que começa acima e
           termina abaixo da janela não destaca nada: some a cortina e o passo
           vira uma página normal com um balão em cima. */
        // Reserva a altura real do card, e não um número fixo: no celular ele
        // passa de 300px, e 200 deixava o recorte crescer por baixo dele.
        const limite = window.innerHeight - (card.offsetHeight || 240) - 40;
        const base = Math.min(
            Math.max(...caixas.map(r => r.bottom)) + folga,
            topo + limite,
            // Nem abaixo da borda: a barra de ação é fixa no rodapé e encosta
            // no fim da tela — a folga de baixo cairia fora da janela e o
            // recorte apareceria cortado justamente no botão de aprovar.
            window.innerHeight);

        foco.hidden = false;
        foco.style.top = `${topo}px`;
        foco.style.left = `${esq}px`;
        foco.style.width = `${dir - esq}px`;
        foco.style.height = `${base - topo}px`;

        // O card vai abaixo do alvo; se não couber, acima; se não couber em
        // lugar nenhum, encosta no rodapé — nunca sai da tela.
        const largura = Math.min(360, window.innerWidth - 24);
        const altura = card.offsetHeight || 220;
        const cabeAbaixo = base + 12 + altura < window.innerHeight - 12;
        const cabeAcima = topo - 12 - altura > 12;

        card.style.width = `${largura}px`;
        card.style.left = `${Math.min(Math.max(12, esq), window.innerWidth - 12 - largura)}px`;
        card.style.top = cabeAbaixo ? `${base + 12}px`
            : cabeAcima ? `${topo - 12 - altura}px`
            : `${Math.max(12, window.innerHeight - 12 - altura)}px`;
    }

    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    document.addEventListener('keydown', aoTeclado);
    bloqueio.addEventListener('click', (e) => e.stopPropagation());

    mostrar();
};

// ── Peças da encenação ──────────────────────────────────────────────────

/** O anel que mostra que o toque aconteceu ali, e não que a tela pulou. */
const simularToque = (camada, alvo) => new Promise(resolve => {
    const r = alvo.getBoundingClientRect();
    const anel = document.createElement('span');
    anel.className = 'tr-toque';
    anel.style.left = `${r.left + r.width / 2}px`;
    anel.style.top = `${r.top + Math.min(r.height / 2, 60)}px`;
    camada.appendChild(anel);
    setTimeout(() => { anel.remove(); resolve(); }, 620);
});

/* O retorno de mentira. Usa as MESMAS classes do retorno real: se fosse um
   desenho à parte, o cliente aprenderia a reconhecer uma caixa que não existe
   na tela dele. */
function montarFioFalso(cliente) {
    limparFalso();
    const fala = document.querySelector('.cl-fala');
    if (!fala) return;

    const hoje = new Date().toLocaleDateString('pt-BR');
    fala.classList.add('cl-fala--conversa', 'cl-fala--respondido');
    fala.setAttribute('data-tour-classe', '1');
    fala.insertAdjacentHTML('afterend', `
        <div class="cl-fio cl-fio--respondido cl-fio--novo" data-tour="fio">
            <div class="cl-fio__estado">
                <i data-lucide="message-square-reply"></i>
                A equipe respondeu — veja se ficou bom
                <span class="cl-fio__novo">novo</span>
            </div>
            <div class="cl-fio__item cl-fio__item--voce">
                <div class="cl-fio__quem">
                    <i data-lucide="message-circle"></i> Você pediu
                    <span class="cl-fio__data">${hoje}</span>
                </div>
                <p class="cl-fio__texto">Essa abertura ficou dura demais para o nosso tom.</p>
            </div>
            <div class="cl-fio__item cl-fio__item--equipe">
                <div class="cl-fio__quem">
                    <i data-lucide="pencil-line"></i> Ajustamos
                    <span class="cl-fio__data">${hoje}</span>
                </div>
                <p class="cl-fio__texto">Trocamos por uma pergunta mais leve. Vê se agora ficou com a sua voz.</p>
            </div>
            <button class="ds-btn ds-btn--primary ds-btn--sm cl-fio__ok" disabled>
                <i data-lucide="circle-check"></i> Ficou bom, pode encerrar
            </button>
        </div>`);
    if (window.lucide) lucide.createIcons();
}

function limparFalso() {
    /* `[data-tour="fio"]`, e não `[data-tour]` inteiro: a faixa de "isto é um
       exemplo" também é do tour e precisa continuar na tela enquanto o modelo
       estiver aberto. Ela sai junto com o modelo, no redesenho do fim. */
    document.querySelectorAll('[data-tour="fio"]').forEach(e => e.remove());
    document.querySelectorAll('[data-tour-classe]').forEach(e => {
        e.classList.remove('cl-fala--conversa', 'cl-fala--respondido');
        e.removeAttribute('data-tour-classe');
    });
}

function fecharComentario() {
    document.querySelectorAll('.cl-comentario').forEach(e => e.remove());
    document.querySelectorAll('.cl-fala.is-selecionada').forEach(e => e.classList.remove('is-selecionada'));
}

// ── Estilos ─────────────────────────────────────────────────────────────
function injetarEstilos() {
    if (document.getElementById('tour-styles')) return;
    const style = document.createElement('style');
    style.id = 'tour-styles';
    style.textContent = `
        /* 600: acima do painel lateral (500), do aviso (460) e do menu (450).
           O tour toma a tela inteira por definição — se algo dele ficasse por
           baixo, seria o próprio tour parecendo quebrado. */
        .tr { position: fixed; inset: 0; z-index: 600; font-family: var(--font-sans); }
        .tr-travado { overflow: hidden; }

        /* Transparente, e mesmo assim indispensável: a sombra do foco pinta a
           cortina mas NÃO recebe cliques. Sem esta camada, tudo que está sob a
           parte escurecida continuaria clicável durante o tour. */
        .tr-bloqueio { position: absolute; inset: 0; background: transparent; }

        .tr-foco {
            position: fixed; border-radius: var(--radius-md);
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.74);
            transition: top var(--dur-mid, .24s) var(--ease-out, ease),
                        left var(--dur-mid, .24s) var(--ease-out, ease),
                        width var(--dur-mid, .24s) var(--ease-out, ease),
                        height var(--dur-mid, .24s) var(--ease-out, ease);
            pointer-events: none;
        }
        .tr-foco[hidden] { display: none; }
        .tr--cheia .tr-bloqueio { background: rgba(0, 0, 0, 0.82); }

        .tr-card {
            position: fixed; display: flex; flex-direction: column; gap: var(--space-3);
            padding: var(--space-5);
            border-radius: var(--radius-lg);
            background: var(--surface-1); border: 1px solid var(--border-default);
            box-shadow: var(--shadow-lg, 0 24px 60px -20px rgba(0,0,0,.6));
        }
        .tr-card.is-indo { opacity: 0; }

        /* Na tela cheia o card vira o conteúdo, e não um balão apontando para
           algo. Centralizado, mais largo e com respiro — é a primeira e a
           última impressão do sistema. */
        .tr--cheia .tr-card {
            top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: min(420px, calc(100vw - 32px));
            padding: var(--space-6);
            text-align: left;
        }
        .tr--cheia .tr-card__titulo { font-size: var(--text-h2, 26px); }

        .tr-card__topo { display: flex; align-items: center; gap: var(--space-2); }
        .tr-card__conta {
            flex: 1; font-size: var(--text-xs); font-weight: 700;
            letter-spacing: var(--tracking-wide); text-transform: uppercase;
            color: var(--accent);
        }
        .tr-card__x {
            display: flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; margin: -6px -6px -6px 0;
            border: none; border-radius: var(--radius-sm);
            background: transparent; color: var(--text-tertiary); cursor: pointer;
        }
        .tr-card__x:hover { background: var(--surface-3); color: var(--text-primary); }
        .tr-card__x i, .tr-card__x svg { width: 16px; height: 16px; }

        .tr-card__titulo {
            margin: 0; font-size: var(--text-h3); font-weight: 600;
            line-height: var(--leading-snug); letter-spacing: var(--tracking-tight);
            color: var(--text-primary);
        }
        .tr-card__texto {
            margin: 0; font-size: var(--text-sm); line-height: var(--leading-body);
            color: var(--text-secondary);
        }
        .tr-card__texto strong { color: var(--text-primary); }
        .tr-card__aviso {
            display: flex; align-items: center; gap: var(--space-2); margin: 0;
            padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
            background: var(--warning-muted); color: var(--warning);
            font-size: var(--text-xs); line-height: var(--leading-body);
        }
        .tr-card__aviso i, .tr-card__aviso svg { width: 13px; height: 13px; flex-shrink: 0; }

        .tr-card__pe { display: flex; align-items: center; gap: var(--space-3); }
        .tr-card__pe .ds-btn { min-height: 40px; }
        .tr-pontos { flex: 1; display: flex; align-items: center; gap: 5px; }
        .tr-ponto {
            width: 6px; height: 6px; border-radius: 50%;
            background: var(--border-default);
        }
        .tr-ponto.is-visto { background: var(--accent-border); }
        .tr-ponto.is-atual { width: 18px; border-radius: var(--radius-pill); background: var(--accent); }

        /* O cartão da vez, no passeio pela estratégia. Outline e não borda:
           não muda o tamanho do elemento, então nada se mexe a cada troca. */
        .tr-realce {
            outline: 2px solid var(--accent);
            outline-offset: 3px;
            border-radius: var(--radius-md);
            transition: outline-color .35s var(--ease-out, ease);
        }
        @media (prefers-reduced-motion: reduce) { .tr-realce { transition: none; } }

        /* O toque simulado. Sem ele, a mudança de tela parece o sistema
           pulando sozinho — e a pessoa não aprende que foi o cartão que abre. */
        .tr-toque {
            position: fixed; width: 26px; height: 26px; margin: -13px 0 0 -13px;
            border-radius: 50%; border: 2px solid var(--accent);
            background: var(--accent-muted);
            animation: tr-toque .6s var(--ease-out, ease-out) forwards;
            pointer-events: none;
        }
        @keyframes tr-toque {
            0%   { transform: scale(.4); opacity: 0; }
            35%  { transform: scale(1);  opacity: 1; }
            100% { transform: scale(2.6); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
            .tr-foco { transition: none; }
            .tr-toque { animation-duration: .01s; }
        }
    `;
    document.head.appendChild(style);
}
