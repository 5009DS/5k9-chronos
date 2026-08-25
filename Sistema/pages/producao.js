import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { esc, dataBR, diaCurto, nomeDiaCurto } from '../lib/formato.js';
import { chipFase, vazioHTML, STATUS } from '../lib/pecas.js';
import { etapasDa, etapaAtual, esteiraDe, injectEstilosEtiqueta } from '../lib/etiquetas.js';
import { moverParaEtapa } from '../lib/etapas.js';
import { ativarArraste } from '../lib/arrastar.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUÇÃO — a esteira vista de cima.

   O cronograma responde QUANDO cada peça vai ao ar; o quadro responde em que
   semana e em que vaga do funil ela cai. Nenhum dos dois responde a pergunta
   que a equipe faz toda segunda: o que está parado, e parado onde.

   Esta tela agrupa por ETAPA, não por data. É a mesma esteira do cartão, com
   as colunas na ordem em que o trabalho acontece — e o que se enxerga aqui é o
   acúmulo: seis peças em "a gravar" e nenhuma em "em edição" é uma tarde de
   gravação que ninguém marcou.

   ── ARRASTAR É AVANÇAR ────────────────────────────────────────────────────
   Mover o cartão para outra coluna é a mesma operação do botão "Mover para" da
   tela da demanda, e chama exatamente a mesma função (`moverParaEtapa`, em
   lib/etapas.js). Duas implementações da mesma regra divergiriam na primeira
   etapa nova — e o sintoma seria arrastar e clicar deixando estados diferentes.

   ── A COLUNA QUE NÃO É ETAPA ──────────────────────────────────────────────
   A primeira coluna é "sem etapa": peças que existem no cronograma e ainda não
   entraram na produção. Sem ela, um conteúdo recém-criado não apareceria em
   lugar nenhum desta tela — e sumir é pior que aparecer no lugar errado.
   ═══════════════════════════════════════════════════════════════════════════ */

const SEM_ETAPA = '__sem__';

/* Qual esteira estava aberta, por cliente. Mover um cartão redesenha a tela
   inteira, e sem isto cada arraste devolveria a pessoa para a esteira de
   vídeo. Em memória: é estado de navegação, não preferência. */
const ULTIMA = new Map();

export const renderProducao = async (container, clienteId) => {
    const { cliente, conteudos: todos } = await store.doCliente(clienteId);

    if (!cliente) {
        const { content } = renderShell(container, {
            path: '/', title: 'Cliente não encontrado',
            subtitle: 'Ele pode ter sido excluído.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    // Banco de temas fora, como nas outras telas: guardado não está em produção.
    const conteudos = todos.filter(c => !c.banco_em);

    const { content } = renderShell(container, {
        path: '/',
        crumbs: [{ href: '/', label: 'Clientes' }, { href: `/cliente/${clienteId}`, label: cliente.nome }],
        title: 'Produção',
        subtitle: `${cliente.nome} · ${conteudos.length} conteúdo${conteudos.length === 1 ? '' : 's'} fora do banco de temas`,
        actions: `
            <a class="ds-btn ds-btn--ghost" href="/cliente/${esc(clienteId)}">
                <i data-lucide="list"></i> Cronograma
            </a>
            <a class="ds-btn ds-btn--ghost" href="/quadro/${esc(clienteId)}">
                <i data-lucide="layout-grid"></i> Quadro do mês
            </a>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosEtiqueta();

    const recarregar = () => renderProducao(container, clienteId);
    let soltarArraste = null;

    /* ── UMA ESTEIRA POR VEZ ──────────────────────────────────────────────
       As duas juntas dariam treze colunas, e este quadro existe para caber num
       olhar. Também não seria honesto empilhá-las: as colunas do meio não são
       a mesma coisa com nomes diferentes — quem grava e quem diagrama são
       pessoas diferentes, e cada uma quer ver a própria fila.

       A esteira sem trabalho nenhum some do seletor: um cliente que só faz
       vídeo nunca precisa saber que existe a outra. */
    const conta = { video: 0, carrossel: 0 };
    for (const c of conteudos) conta[esteiraDe(c.formato)]++;

    const disponiveis = ['video', 'carrossel'].filter(e => conta[e] > 0);
    let esteiraAtiva = ULTIMA.get(clienteId) || disponiveis[0] || 'video';
    if (disponiveis.length && !disponiveis.includes(esteiraAtiva)) esteiraAtiva = disponiveis[0];

    const ESTEIRAS = {
        video:     { rotulo: 'Vídeo',     icone: 'video' },
        carrossel: { rotulo: 'Carrossel', icone: 'gallery-horizontal-end' },
    };

    const colunas = () => [
        { chave: SEM_ETAPA, nome: 'Sem etapa', icone: 'circle-dashed', tom: 'neutro',
          dica: 'Existe no cronograma e ainda não entrou na produção.' },
        ...etapasDa(esteiraAtiva).map(e => ({ chave: e.nome, nome: e.nome, icone: e.icone, tom: e.tom, dica: e.dica })),
    ];

    const daColuna = (chave) => conteudos
        .filter(c => esteiraDe(c.formato) === esteiraAtiva)
        .filter(c => {
            const etapa = etapaAtual(c.etiquetas);
            return chave === SEM_ETAPA ? !etapa : etapa?.nome === chave;
        });

    const mover = async (idConteudo, chaveColuna) => {
        const c = conteudos.find(x => x.id === idConteudo);
        if (!c) return;
        const atual = etapaAtual(c.etiquetas);
        if ((atual?.nome || SEM_ETAPA) === chaveColuna) return;

        const nome = chaveColuna === SEM_ETAPA ? null : chaveColuna;
        // A MESMA função do botão da tela da demanda: arrastar e clicar não
        // podem deixar o conteúdo em estados diferentes.
        const { novoStatus, reabriu, desfazer } = await moverParaEtapa(c, nome);

        toast((nome ? `"${c.titulo}" → ${nome}.` : `"${c.titulo}" saiu da esteira.`)
            + (novoStatus ? ` Status: ${STATUS[novoStatus]?.rotulo || novoStatus}.` : '')
            + (reabriu ? ' A volta ficou registrada no histórico.' : ''), {
            label: 'Desfazer',
            onClick: async () => { await desfazer(); recarregar(); },
        });
        recarregar();
    };

    const desenhar = () => {
        soltarArraste?.();

        content.innerHTML = conteudos.length ? `
            ${disponiveis.length > 1 ? `
                <div class="pr-troca" id="pr-troca" role="tablist">
                    ${disponiveis.map(id => `
                        <button type="button" class="pr-troca__op ${id === esteiraAtiva ? 'is-active' : ''}"
                                data-esteira="${id}" role="tab" aria-selected="${id === esteiraAtiva}">
                            <i data-lucide="${ESTEIRAS[id].icone}"></i>
                            ${ESTEIRAS[id].rotulo}
                            <span class="pr-troca__conta">${conta[id]}</span>
                        </button>`).join('')}
                </div>` : ''}

            <div class="pr-esteira" id="pr-esteira">
                ${colunas().map(col => {
                    const itens = daColuna(col.chave);
                    return `
                    <section class="pr-coluna pr-coluna--${esc(col.tom)}" data-solta="${esc(col.chave)}">
                        <header class="pr-coluna__cabeca">
                            <i data-lucide="${esc(col.icone)}"></i>
                            <span class="pr-coluna__nome">${esc(col.nome)}</span>
                            <span class="pr-coluna__conta">${itens.length}</span>
                        </header>
                        <p class="pr-coluna__dica">${esc(col.dica || '')}</p>
                        <div class="pr-coluna__itens">
                            ${itens.length
                                ? itens.map(cartao).join('')
                                : '<p class="pr-vazio">—</p>'}
                        </div>
                    </section>`;
                }).join('')}
            </div>` : `
            <article class="ds-card vz-secao">
                ${vazioHTML('workflow', 'Nada em produção',
                    'Os conteúdos deste cliente estão todos no banco de temas, ou ele ainda não tem nenhum. '
                  + 'Crie um no cronograma para ele aparecer aqui.',
                    `<a class="ds-btn ds-btn--primary" href="/cliente/${esc(clienteId)}">Ir ao cronograma</a>`)}
            </article>`;

        content.querySelectorAll('[data-abrir]').forEach(b =>
            b.addEventListener('click', () => navegar(`/conteudo/${b.dataset.abrir}`)));

        content.querySelector('#pr-troca')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-esteira]');
            if (!b || b.dataset.esteira === esteiraAtiva) return;
            esteiraAtiva = b.dataset.esteira;
            // Sobrevive ao redesenho que um arraste provoca.
            ULTIMA.set(clienteId, esteiraAtiva);
            desenhar();
        });

        if (conteudos.length) {
            soltarArraste = ativarArraste(content.querySelector('#pr-esteira'), {
                item: '[data-arrastavel]',
                alvo: '[data-solta]',
                aoSoltar: (id, coluna) => mover(id, coluna),
            });
        }

        ajustarAltura();
        if (window.lucide) lucide.createIcons();
    };

    /* ── A BARRA HORIZONTAL PRECISA CABER NA TELA ────────────────────────
       Um teto em vh não resolve sozinho: a esteira começa depois do cabeçalho
       e do herói, e a altura desses dois muda com o título do cliente e com a
       largura da janela. Com 68vh a barra caía 27px abaixo da dobra — perto o
       bastante para parecer certo num teste e longe o bastante para obrigar a
       rolar a página antes de rolar as colunas.

       Então a altura é medida: o que sobra da janela a partir de onde a esteira
       começa, menos um respiro. Recalculada ao redimensionar, porque o herói
       reflui e o ponto de partida muda com ele. */
    function ajustarAltura() {
        const esteira = content.querySelector('#pr-esteira');
        if (!esteira) return;

        /* Medido contra a ÁREA DE ROLAGEM, não contra a janela. Com a janela, o
           cálculo dava certo só com a página no topo: bastava rolar um pouco
           para o topo da esteira subir, o "espaço" crescer e a barra voltar a
           cair abaixo da dobra. A distância entre o topo da esteira e o fim da
           área visível não depende de onde a página está. */
        const rolador = esteira.closest('.sh-scroll') || document.documentElement;
        const espaco = rolador.getBoundingClientRect().bottom
                     - esteira.getBoundingClientRect().top - 24;

        // Piso de 240px: numa janela muito baixa é melhor a página rolar do que
        // a coluna virar uma fresta com meio cartão dentro.
        esteira.style.maxHeight = `${Math.max(240, espaco)}px`;
    }

    /* Um listener por render acumularia um a cada visita à tela, todos medindo
       conteúdo que já saiu do DOM. */
    window.removeEventListener('resize', window.__prAjuste);
    window.__prAjuste = ajustarAltura;
    window.addEventListener('resize', ajustarAltura);

    desenhar();
};

const cartao = (c) => `
    <article class="pr-cartao" data-arrastavel="${esc(c.id)}">
        <span class="vz-fita vz-fita--${esc(c.fase || '')}"></span>
        <div class="pr-cartao__corpo">
            <div class="pr-cartao__topo">
                <span class="pr-cartao__dia">${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}</span>
                ${chipFase(c.fase, { curto: true })}
            </div>
            <h3 class="pr-cartao__titulo">${esc(c.titulo)}</h3>
            ${c.responsavel ? `<span class="pr-cartao__quem">${esc(c.responsavel)}</span>` : ''}
        </div>
        <button class="ds-icon-btn ds-icon-btn--sm" data-abrir="${esc(c.id)}" title="Abrir o roteiro">
            <i data-lucide="chevron-right"></i>
        </button>
    </article>`;

const ESTILOS = `
<style>
/* Colunas que rolam na horizontal. Não é grade: o número de etapas cresce
   (três entraram esta semana), e uma grade fixa quebraria a cada etapa nova.

   ── A ALTURA É LIMITADA DE PROPÓSITO ────────────────────────────────────
   Sem teto, a coluna mais cheia esticava a esteira inteira e empurrava a barra
   de rolagem horizontal para muito abaixo da dobra. Quem usa mouse sem roda
   lateral — a maioria — não tinha como chegar às etapas seguintes: a barra
   existia num lugar que exigia rolar a página para encontrar.

   Com teto, a barra fica logo abaixo das colunas, sempre à vista, e cada
   coluna rola por dentro. São duas rolagens em vez de uma, e é a troca certa:
   a de fora anda entre etapas, a de dentro anda dentro de uma. */
/* O seletor de esteira fala a mesma língua das abas do painel de colar: é a
   mesma pergunta — qual dos dois formatos estou olhando agora. */
.pr-troca {
    display: inline-flex; gap: 4px; padding: 4px; margin-bottom: var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-2);
}
.pr-troca__op {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 34px; padding: 0 var(--space-3);
    border: none; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-secondary);
    font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 600;
    cursor: pointer;
    transition: background-color var(--dur-fast), color var(--dur-fast);
}
.pr-troca__op i, .pr-troca__op svg { width: 15px; height: 15px; }
.pr-troca__op:hover { color: var(--text-primary); }
.pr-troca__op.is-active { background: var(--accent-muted); color: var(--accent); }
.pr-troca__conta {
    min-width: 18px; padding: 0 5px; border-radius: var(--radius-pill);
    background: var(--surface-3); color: var(--text-tertiary);
    font-size: 11px; font-weight: 700;
}
.pr-troca__op.is-active .pr-troca__conta { background: var(--accent); color: var(--surface-0); }

.pr-esteira {
    display: flex; gap: var(--space-3);
    overflow-x: auto; overflow-y: hidden;
    padding-bottom: var(--space-2);
    scroll-snap-type: x proximity;
}

/* A barra horizontal é DESENHADA, não escondida. O padrão do sistema some
   quando não se está rolando, e uma barra invisível numa área que precisa ser
   rolada é a mesma coisa que não ter barra. */
.pr-esteira { scrollbar-width: auto; scrollbar-color: var(--accent) var(--surface-3); }
.pr-esteira::-webkit-scrollbar { height: 12px; }
.pr-esteira::-webkit-scrollbar-track {
    background: var(--surface-3); border-radius: var(--radius-pill);
}
.pr-esteira::-webkit-scrollbar-thumb {
    background: var(--accent); border-radius: var(--radius-pill);
    border: 3px solid var(--surface-1);
}
.pr-esteira::-webkit-scrollbar-thumb:hover { background: var(--accent-hover, var(--accent)); }

.pr-coluna {
    flex: 0 0 260px; display: flex; flex-direction: column; gap: var(--space-2);
    max-height: 100%; min-height: 0;
    padding: var(--space-3);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-2);
    scroll-snap-align: start;
}
.pr-coluna.ar-sobre { border-color: var(--accent); background: var(--accent-muted); }

.pr-coluna__cabeca {
    display: flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-xs); font-weight: 700;
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
    color: var(--text-tertiary);
}
.pr-coluna__cabeca i, .pr-coluna__cabeca svg { width: 14px; height: 14px; }
.pr-coluna__nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pr-coluna__conta {
    min-width: 22px; padding: 0 6px; border-radius: var(--radius-pill);
    background: var(--surface-3); color: var(--text-secondary);
    font-size: 11px; line-height: 18px; text-align: center;
}
/* A cor da etapa vive no cabeçalho da coluna, não no fundo dela: fundo
   colorido em seis colunas lado a lado vira vitral. */
.pr-coluna--atencao .pr-coluna__cabeca { color: var(--warning); }
.pr-coluna--info    .pr-coluna__cabeca { color: var(--info); }
.pr-coluna--ok      .pr-coluna__cabeca { color: var(--success); }
.pr-coluna--espera  .pr-coluna__cabeca { color: var(--accent); }
.pr-coluna--risco   .pr-coluna__cabeca { color: var(--danger); }

.pr-coluna__dica { margin: 0; font-size: 11px; color: var(--text-disabled); line-height: var(--leading-body); }
/* É esta parte que rola, e não a coluna inteira: o cabeçalho com o nome da
   etapa e a contagem precisa continuar visível enquanto se percorre a lista —
   é ele que diz o que está sendo lido. */
.pr-coluna__itens {
    flex: 1; min-height: 60px; overflow-y: auto;
    display: flex; flex-direction: column; gap: var(--space-2);
    padding-right: 2px;
}
.pr-coluna__itens::-webkit-scrollbar { width: 6px; }
.pr-coluna__itens::-webkit-scrollbar-thumb {
    background: var(--border-default); border-radius: var(--radius-pill);
}
.pr-vazio { margin: 0; padding: var(--space-4) 0; text-align: center; color: var(--text-disabled); }

.pr-cartao {
    /* flex-shrink: 0 — sem isto, a lista com altura limitada ESPREME os cartões
       em vez de rolar: sete peças viravam sete tiras de 30px, e a barra de
       rolagem interna nunca aparecia porque, tecnicamente, tudo "cabia". */
    flex-shrink: 0;
    display: flex; align-items: center; gap: var(--space-2); overflow: hidden;
    border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
    background: var(--surface-1);
    cursor: grab;
}
.pr-cartao__corpo { flex: 1; display: flex; flex-direction: column; gap: 3px; padding: var(--space-2) 0; min-width: 0; }
.pr-cartao__topo { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.pr-cartao__dia { font-size: 10px; text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--text-tertiary); }
.pr-cartao__titulo {
    margin: 0; font-size: var(--text-sm); font-weight: 600; line-height: var(--leading-snug);
    color: var(--text-primary);
}
.pr-cartao__quem { font-size: var(--text-xs); color: var(--text-tertiary); }

@media (max-width: 720px) {
    .pr-coluna { flex-basis: 82vw; }
}
</style>
`;
