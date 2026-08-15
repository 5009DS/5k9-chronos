import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirMenu } from '../components/menu.js';
import { toast } from '../components/toast.js';
import { esc, dataBR, quandoRelativo, nomeDia, duracao, segundosDeFala } from '../lib/formato.js';
import { objetivo } from '../lib/diretorio.js';
import { retornosDe } from '../lib/cronograma.js';
import {
    TIPOS, tipo as tipoBloco, ordenar, mover, renumerar, blocoNovo,
    duracaoTotal, contarPalavras, avisosDeEstrutura, paraTexto,
} from '../lib/roteiro.js';
import {
    chipFase, chipStatus, cartaoLeitura, explicacaoObjetivo, avisosHTML,
    vazioHTML, STATUS,
} from '../lib/pecas.js';
import { formularioConteudo } from './cronograma.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ROTEIRO — a tela de escrever.

   ── POR QUE OS BLOCOS SÃO EDITÁVEIS NO LUGAR ──────────────────────────────
   Todo o resto do estúdio edita em painel lateral, e está certo: são
   formulários curtos, de campos independentes. Roteiro não é isso. Escrever
   um roteiro é ler o bloco anterior enquanto se escreve o próximo — e um
   painel que cobre metade da tela esconde exatamente o que precisa ser lido.
   Aqui cada bloco é um campo de texto no próprio lugar, e o que muda é só o
   texto dentro dele.

   Grava no `change` (ao sair do campo), não a cada tecla: gravar por tecla
   manda uma escrita por caractere ao banco e, em modo remoto, transforma uma
   frase em quarenta requisições.

   ── A ESTIMATIVA DE DURAÇÃO ───────────────────────────────────────────────
   Aparece no topo e vive enquanto se digita. É estimativa e a tela diz isso:
   serve para perceber que um bloco ficou longo demais, não para cronometrar a
   gravação. Sem ela, o roteiro de 40 segundos só vira roteiro de 2 minutos na
   hora de gravar — quando já custou o dia de alguém.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderRoteiro = async (container, conteudoId) => {
    const [conteudos, clientes, todosBlocos, retornos] = await Promise.all([
        store.conteudos.listar(), store.clientes.listar(),
        store.blocos.listar(), store.retornos.listar(),
    ]);

    const c = conteudos.find(x => x.id === conteudoId);
    if (!c) {
        const { content } = renderShell(container, {
            path: '/', title: 'Conteúdo não encontrado',
            subtitle: 'Ele pode ter sido excluído.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    const cliente = clientes.find(x => x.id === c.cliente_id);
    let blocos = ordenar(todosBlocos.filter(b => b.conteudo_id === conteudoId));
    const historico = retornosDe(retornos, c.id);

    const { content } = renderShell(container, {
        path: '/',
        /* O rastro inteiro importa aqui: chega-se a esta tela direto do painel,
           clicando num pedido de ajuste, sem passar pelo cronograma. O botão
           "Cronograma" leva a UMA tela acima; o rastro mostra as duas, e diz
           de qual cliente é o conteúdo antes de a pessoa precisar perguntar. */
        crumbs: [
            { href: '/', label: 'Clientes' },
            { href: `/cliente/${c.cliente_id}`, label: cliente?.nome || 'Cliente' },
        ],
        title: c.titulo,
        subtitle: `${cliente?.nome || 'Cliente removido'} · ${nomeDia(c.data)}, ${dataBR(c.data)} · ${quandoRelativo(c.data)}`,
        actions: `
            <a class="ds-btn ds-btn--ghost ds-btn--sm" href="/cliente/${esc(c.cliente_id)}">
                <i data-lucide="arrow-left"></i> Cronograma
            </a>
            ${cliente ? `
                <a class="ds-btn ds-btn--ghost ds-btn--sm" href="/c/${esc(cliente.token)}/${esc(c.id)}" target="_blank" rel="noopener">
                    <i data-lucide="external-link"></i> Como o cliente vê
                </a>` : ''}
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-editar">
                <i data-lucide="pencil"></i> Editar ficha
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const recarregar = () => renderRoteiro(container, conteudoId);

    const desenhar = () => {
        const avisos = avisosDeEstrutura(blocos);

        content.innerHTML = `
            <!-- ══ Ficha estratégica ═══════════════════════════════════ -->
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div class="rt-chips">
                        ${chipFase(c.fase)}
                        ${objetivo(c.objetivo) ? `<span class="vz-status"><i data-lucide="${esc(objetivo(c.objetivo).icone || 'compass')}"></i>${esc(objetivo(c.objetivo).nome)}</span>` : '<span class="vz-status">sem objetivo</span>'}
                        ${chipStatus(c.status)}
                    </div>
                    <div class="rt-status-troca">
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-status">
                            <i data-lucide="repeat"></i> Mudar status
                        </button>
                    </div>
                </div>

                ${c.tema ? `<p class="vz-nota">${esc(c.tema)}</p>` : ''}
                ${c.intencao ? `
                    <div class="vz-leitura">
                        <div class="vz-leitura__cabeca"><i data-lucide="crosshair"></i> O que este conteúdo precisa fazer</div>
                        <p class="vz-leitura__texto">${esc(c.intencao)}</p>
                    </div>` : ''}
                ${cartaoLeitura(c.fase, c.objetivo)}
                ${avisosHTML(c.fase, c.objetivo)}
                ${explicacaoObjetivo(c.fase, c.objetivo)}
                ${c.nota ? `<p class="rt-interna"><i data-lucide="lock"></i> ${esc(c.nota)}</p>` : ''}
            </article>

            ${historico.length ? `
                <article class="ds-card vz-secao">
                    <div class="vz-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">O que o cliente respondeu</h2>
                            <span class="ds-card-sub">${historico.length} resposta${historico.length > 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="rt-retornos">
                        ${historico.map(r => `
                            <div class="rt-retorno rt-retorno--${esc(r.tipo)}">
                                <div class="rt-retorno__cabeca">
                                    <i data-lucide="${r.tipo === 'aprovado' ? 'circle-check' : 'message-circle'}"></i>
                                    ${r.tipo === 'aprovado' ? 'Aprovado' : 'Ajuste pedido'}
                                    ${r.autor ? `por ${esc(r.autor)}` : ''}
                                    <span class="rt-retorno__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                                </div>
                                ${r.texto ? `<p class="rt-retorno__texto">${esc(r.texto)}</p>` : ''}
                            </div>`).join('')}
                    </div>
                </article>` : ''}

            <!-- ══ Roteiro ═════════════════════════════════════════════ -->
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Roteiro</h2>
                        <span class="ds-card-sub" id="rt-medida">${esc(medida(blocos))}</span>
                    </div>
                    <div class="rt-acoes-topo">
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-copiar">
                            <i data-lucide="copy"></i> Copiar texto
                        </button>
                    </div>
                </div>

                ${avisos.length ? `
                    <div class="rt-avisos">
                        ${avisos.map(a => `<p class="rt-aviso"><i data-lucide="triangle-alert"></i> ${esc(a)}</p>`).join('')}
                    </div>` : ''}

                <div class="rt-blocos" id="rt-blocos">
                    ${blocos.length
                        ? blocos.map((b, i) => blocoEditavel(b, i, blocos.length)).join('')
                        : vazioHTML('file-plus', 'Roteiro em branco',
                            'Escolha por onde começar. Você pode misturar os recortes: seções, falas, frases curtas e blocos livres convivem no mesmo roteiro.')}
                </div>

                <div class="rt-adicionar">
                    <span class="vz-rotulo">Adicionar</span>
                    <div class="rt-adicionar__tipos">
                        ${TIPOS.map(t => `
                            <button class="rt-tipo" data-novo="${t.id}" title="${esc(t.descricao)}">
                                <i data-lucide="${t.icone}"></i> ${esc(t.nome)}
                            </button>`).join('')}
                    </div>
                </div>
            </article>
        `;

        ligarEventos();
        if (window.lucide) lucide.createIcons();
    };

    // ─────────────────────────────────────────────────────────────────────
    function ligarEventos() {
        content.querySelector('#rt-status').addEventListener('click', (e) => {
            const b = e.target.closest('button');
            abrirMenu(b, Object.entries(STATUS).map(([id, s]) => ({
                id, label: s.rotulo, icon: s.icone,
                onClick: async () => {
                    await store.conteudos.salvar({ ...c, status: id });
                    toast(`Status: ${s.rotulo}.`);
                    recarregar();
                },
            })));
        });

        content.querySelector('#rt-copiar').addEventListener('click', async () => {
            const texto = paraTexto(c, blocos);
            try {
                await navigator.clipboard.writeText(texto);
                toast('Roteiro copiado.');
            } catch {
                toast('Não foi possível copiar. Selecione o texto na tela.');
            }
        });

        // ── Adicionar bloco ─────────────────────────────────────────────
        content.querySelectorAll('[data-novo]').forEach(botao =>
            botao.addEventListener('click', async () => {
                const b = blocoNovo(conteudoId, botao.dataset.novo, blocos);
                await store.blocos.salvar(b);
                blocos = ordenar([...blocos, b]);
                desenhar();
                // Foco no campo recém-criado: quem clicou em "Fala" quer
                // escrever agora, não procurar onde apareceu.
                const campo = content.querySelector(`[data-bloco="${b.id}"] textarea, [data-bloco="${b.id}"] input`);
                campo?.focus();
            }));

        // ── Editar texto e título ───────────────────────────────────────
        content.querySelectorAll('[data-campo-bloco]').forEach(campo =>
            campo.addEventListener('change', async () => {
                const id = campo.closest('[data-bloco]').dataset.bloco;
                const b = blocos.find(x => x.id === id);
                const valor = campo.value.trim();
                b[campo.dataset.campoBloco] = valor || null;
                await store.blocos.salvar(b);
            }));

        // A medida vive enquanto se digita, mas sem gravar: é leitura, não
        // estado. Gravar por tecla seria uma requisição por caractere.
        content.querySelectorAll('textarea[data-campo-bloco="texto"]').forEach(campo =>
            campo.addEventListener('input', () => {
                const id = campo.closest('[data-bloco]').dataset.bloco;
                const b = blocos.find(x => x.id === id);
                b.texto = campo.value;
                content.querySelector('#rt-medida').textContent = medida(blocos);
                const marca = campo.closest('[data-bloco]').querySelector('[data-duracao]');
                if (marca) marca.textContent = duracao(segundosDeFala(campo.value));
                autoAltura(campo);
            }));

        content.querySelectorAll('textarea[data-campo-bloco]').forEach(autoAltura);

        // ── Mover, trocar tipo, excluir ─────────────────────────────────
        content.querySelectorAll('[data-mover]').forEach(botao =>
            botao.addEventListener('click', async () => {
                const id = botao.closest('[data-bloco]').dataset.bloco;
                const nova = mover(blocos, id, botao.dataset.mover);
                if (!nova) return;
                blocos = nova;
                for (const b of blocos) await store.blocos.salvar(b);
                desenhar();
            }));

        content.querySelectorAll('[data-acoes-bloco]').forEach(botao =>
            botao.addEventListener('click', () => {
                const id = botao.dataset.acoesBloco;
                const b = blocos.find(x => x.id === id);
                abrirMenu(botao, [
                    ...TIPOS.filter(t => t.id !== b.tipo).map(t => ({
                        id: `tipo-${t.id}`, label: `Virar ${t.nome.toLowerCase()}`, icon: t.icone,
                        onClick: async () => {
                            b.tipo = t.id;
                            await store.blocos.salvar(b);
                            desenhar();
                        },
                    })),
                    {
                        id: 'excluir', label: 'Excluir bloco', icon: 'trash-2',
                        variante: 'danger', separadorAntes: true,
                        onClick: async () => {
                            await store.blocos.excluir(id);
                            blocos = renumerar(blocos.filter(x => x.id !== id));
                            for (const x of blocos) await store.blocos.salvar(x);
                            desenhar();
                        },
                    },
                ]);
            }));
    }

    /* O botão de editar a ficha mora no herói, que renderShell desenha uma vez
       só — fora do que desenhar() reescreve. Ligar aqui, e não em
       ligarEventos(), evita empilhar um listener a cada redesenho. */
    document.getElementById('rt-editar').addEventListener('click', () =>
        formularioConteudo(c, cliente, c.data.slice(0, 7), recarregar));

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────

const medida = (blocos) => {
    if (!blocos.length) return 'Nenhum bloco ainda';
    return `${blocos.length} bloco${blocos.length > 1 ? 's' : ''} · ${contarPalavras(blocos)} palavras · `
         + `~${duracaoTotal(blocos)} de fala (estimado)`;
};

const blocoEditavel = (b, i, total) => {
    const t = tipoBloco(b.tipo);
    const usaTitulo = ['secao', 'bloco'].includes(b.tipo);
    const soTitulo = b.tipo === 'secao';

    return `
        <div class="rt-bloco rt-bloco--${esc(b.tipo)}" data-bloco="${esc(b.id)}">
            <div class="rt-bloco__cabeca">
                <span class="rt-bloco__tipo"><i data-lucide="${esc(t.icone)}"></i>${esc(t.nome)}</span>
                ${t.falado ? `<span class="rt-bloco__dur" data-duracao>${esc(duracao(segundosDeFala(b.texto)))}</span>` : ''}
                <span class="rt-bloco__espaco"></span>
                <button class="ds-icon-btn ds-icon-btn--sm" data-mover="cima" ${i === 0 ? 'disabled' : ''} aria-label="Mover para cima">
                    <i data-lucide="chevron-up"></i>
                </button>
                <button class="ds-icon-btn ds-icon-btn--sm" data-mover="baixo" ${i === total - 1 ? 'disabled' : ''} aria-label="Mover para baixo">
                    <i data-lucide="chevron-down"></i>
                </button>
                <button class="ds-icon-btn ds-icon-btn--sm" data-acoes-bloco="${esc(b.id)}"
                        aria-haspopup="menu" aria-expanded="false" aria-label="Ações do bloco">
                    <i data-lucide="ellipsis"></i>
                </button>
            </div>

            ${usaTitulo ? `
                <input class="rt-bloco__titulo" type="text" data-campo-bloco="titulo"
                       value="${esc(b.titulo || '')}"
                       placeholder="${esc(soTitulo ? t.placeholder : 'Título do bloco')}">` : ''}

            ${soTitulo ? '' : `
                <textarea class="rt-bloco__texto" data-campo-bloco="texto" rows="2"
                          placeholder="${esc(t.placeholder)}">${esc(b.texto || '')}</textarea>`}
        </div>`;
};

/**
 * O campo cresce com o texto.
 *
 * Um roteiro tem blocos de uma linha e blocos de dez, e uma altura fixa erra
 * nos dois casos: sobra buraco no curto e obriga a rolar dentro do campo no
 * longo — rolar DENTRO de um campo que está dentro de uma página que também
 * rola é a pior experiência de escrita que existe no navegador.
 */
function autoAltura(campo) {
    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;
}

const ESTILOS = `
<style>
.rt-chips { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.rt-acoes-topo, .rt-status-troca { display: flex; align-items: center; gap: var(--space-2); }

.rt-interna {
    display: flex; align-items: flex-start; gap: var(--space-2);
    margin: 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md); background: var(--surface-3);
    font-size: var(--text-sm); color: var(--text-tertiary); line-height: var(--leading-body);
}
.rt-interna i, .rt-interna svg { width: 14px; height: 14px; flex-shrink: 0; margin-top: 3px; }

/* ── Avisos de estrutura ─────────────────────────────────────────────── */
.rt-avisos { display: flex; flex-direction: column; gap: var(--space-2); }
.rt-aviso {
    display: flex; align-items: flex-start; gap: var(--space-2);
    margin: 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--warning-muted); color: var(--warning);
    font-size: var(--text-sm); line-height: var(--leading-body);
}
.rt-aviso i, .rt-aviso svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }

/* ── Blocos ──────────────────────────────────────────────────────────── */
.rt-blocos { display: flex; flex-direction: column; gap: var(--space-3); }

.rt-bloco {
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-3) var(--space-4) var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-2);
    transition: border-color var(--dur-fast);
}
.rt-bloco:focus-within { border-color: var(--accent); }

.rt-bloco__cabeca { display: flex; align-items: center; gap: var(--space-2); }
.rt-bloco__tipo {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: var(--text-xs); font-weight: 700; color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
}
.rt-bloco__tipo i, .rt-bloco__tipo svg { width: 13px; height: 13px; }
.rt-bloco__dur { font-size: var(--text-xs); color: var(--text-disabled); font-variant-numeric: tabular-nums; }
.rt-bloco__espaco { flex: 1; }
.rt-bloco__cabeca .ds-icon-btn[disabled] { opacity: 0.3; cursor: default; }

/* Os campos não parecem campos até receberem foco. Um roteiro com sete
   caixas de input desenhadas vira formulário; o que se quer ler é o texto. */
.rt-bloco__titulo, .rt-bloco__texto {
    width: 100%; padding: var(--space-2) var(--space-3);
    border: 1px solid transparent; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-primary);
    font-family: var(--font-sans); font-size: var(--text-body);
    line-height: 1.7; resize: none; overflow: hidden;
}
.rt-bloco__titulo { font-weight: 600; }
.rt-bloco__titulo:hover, .rt-bloco__texto:hover { background: var(--surface-3); }
.rt-bloco__titulo:focus, .rt-bloco__texto:focus {
    outline: none; background: var(--surface-3); border-color: var(--border-default);
}
.rt-bloco__titulo::placeholder, .rt-bloco__texto::placeholder { color: var(--text-disabled); }

/* Os mesmos papéis visuais da tela do cliente, para o que se escreve aqui
   ter a cara do que ele vai ler. */
.rt-bloco--gancho { border-color: color-mix(in oklch, var(--accent) 40%, transparent); background: var(--accent-muted); }
.rt-bloco--gancho .rt-bloco__tipo { color: var(--accent); }
.rt-bloco--gancho .rt-bloco__texto { font-size: var(--text-h3); font-weight: 600; line-height: var(--leading-snug); }
.rt-bloco--frase .rt-bloco__texto { font-size: var(--text-h3); font-weight: 500; line-height: var(--leading-snug); }
.rt-bloco--cta { border-color: color-mix(in oklch, var(--success) 35%, transparent); background: var(--success-muted); }
.rt-bloco--cta .rt-bloco__tipo { color: var(--success); }
.rt-bloco--nota { border-style: dashed; background: transparent; }
.rt-bloco--nota .rt-bloco__texto { font-size: var(--text-sm); font-style: italic; color: var(--text-tertiary); line-height: var(--leading-body); }
.rt-bloco--secao { background: transparent; border-color: transparent; padding-bottom: var(--space-2); }
.rt-bloco--secao .rt-bloco__titulo {
    font-size: var(--text-xs); font-weight: 700; color: var(--text-tertiary);
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
}

/* ── Adicionar ───────────────────────────────────────────────────────── */
.rt-adicionar { display: flex; flex-direction: column; gap: var(--space-3); }
.rt-adicionar__tipos { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.rt-tipo {
    display: inline-flex; align-items: center; gap: 6px;
    height: 34px; padding: 0 var(--space-4);
    border: 1px dashed var(--border-default); border-radius: var(--radius-pill);
    background: transparent; color: var(--text-secondary);
    font-family: var(--font-sans); font-size: var(--text-sm); font-weight: 500;
    cursor: pointer; white-space: nowrap;
    transition: border-color var(--dur-fast), color var(--dur-fast), background-color var(--dur-fast);
}
.rt-tipo:hover { border-style: solid; border-color: var(--accent); color: var(--accent); background: var(--accent-muted); }
.rt-tipo i, .rt-tipo svg { width: 14px; height: 14px; }

/* ── Retornos ────────────────────────────────────────────────────────── */
.rt-retornos { display: flex; flex-direction: column; gap: var(--space-2); }
.rt-retorno { padding: var(--space-4); border-radius: var(--radius-md); background: var(--surface-3); }
.rt-retorno__cabeca {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary);
}
.rt-retorno__cabeca i, .rt-retorno__cabeca svg { width: 13px; height: 13px; }
.rt-retorno--aprovado .rt-retorno__cabeca { color: var(--success); }
.rt-retorno--ajuste   .rt-retorno__cabeca { color: var(--warning); }
.rt-retorno__data { margin-left: auto; font-weight: 400; }
.rt-retorno__texto { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }

@media (max-width: 720px) {
    .rt-adicionar__tipos { gap: var(--space-1); }
    .rt-tipo { height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); }
}
</style>
`;
