import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirMenu } from '../components/menu.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { lerRoteiroUnico } from '../lib/importar.js';
import { toast } from '../components/toast.js';
import { esc, dataBR, quandoRelativo, nomeDia, duracao, segundosDeFala } from '../lib/formato.js';
import { objetivo } from '../lib/diretorio.js';
import { retornosDe } from '../lib/cronograma.js';
import {
    TIPOS, tipo as tipoBloco, ordenar, mover, renumerar, blocoNovo, proximaOrdem,
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
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-colar">
                            <i data-lucide="clipboard-paste"></i> Colar roteiro
                        </button>
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
                        ? blocos.map((b, i) => blocoEditavel(b, i, blocos.length, historico)).join('')
                        : vazioHTML('clipboard-paste', 'Roteiro em branco',
                            'Cole o roteiro inteiro de uma vez — o sistema separa em blocos e marca o gancho, '
                          + 'as falas e a chamada para ação. Ou monte à mão, bloco a bloco, abaixo.',
                            `<button class="ds-btn ds-btn--primary" id="rt-colar-vazio">
                                <i data-lucide="clipboard-paste"></i> Colar roteiro
                             </button>`)}
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
        content.querySelector('#rt-colar').addEventListener('click', abrirColar);
        content.querySelector('#rt-colar-vazio')?.addEventListener('click', abrirColar);

        content.querySelector('#rt-status').addEventListener('click', (e) => {
            /* stopPropagation é OBRIGATÓRIO aqui. O menu se fecha sozinho em
               qualquer clique no documento (ver components/menu.js), e sem
               barrar a propagação este mesmo clique sobe até o document e
               fecha o menu no instante em que ele abre — o botão parece morto,
               sem erro nenhum no console. */
            e.stopPropagation();
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
            botao.addEventListener('click', (e) => {
                e.stopPropagation();   // ver a explicação no menu de status
                const id = botao.dataset.acoesBloco;
                const b = blocos.find(x => x.id === id);
                const i = blocos.findIndex(x => x.id === id);

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
                        id: 'duplicar', label: 'Duplicar bloco', icon: 'copy', separadorAntes: true,
                        onClick: async () => {
                            /* A cópia entra LOGO ABAIXO do original, não no fim.
                               Duplicar serve para escrever uma variação da fala
                               que está ali; mandar a cópia para o fim do roteiro
                               obrigaria a subi-la de volta clique a clique. */
                            const copia = {
                                ...b, id: crypto.randomUUID(),
                                criado_em: new Date().toISOString(),
                            };
                            blocos = renumerar([...blocos.slice(0, i + 1), copia, ...blocos.slice(i + 1)]);
                            for (const x of blocos) await store.blocos.salvar(x);
                            toast('Bloco duplicado.');
                            desenhar();
                        },
                    },
                    {
                        id: 'excluir', label: 'Excluir bloco', icon: 'trash-2',
                        variante: 'danger', separadorAntes: true,
                        onClick: async () => {
                            const apagado = { ...b };
                            const posicao = i;
                            await store.blocos.excluir(id);
                            blocos = renumerar(blocos.filter(x => x.id !== id));
                            for (const x of blocos) await store.blocos.salvar(x);

                            toast('Bloco excluído.', {
                                label: 'Desfazer',
                                onClick: async () => {
                                    blocos = renumerar([
                                        ...blocos.slice(0, posicao), apagado, ...blocos.slice(posicao),
                                    ]);
                                    for (const x of blocos) await store.blocos.salvar(x);
                                    desenhar();
                                },
                            });
                            desenhar();
                        },
                    },
                ]);
            }));
    }

    /* ═══════════════════════════════════════════════════════════════════
       COLAR O ROTEIRO INTEIRO

       O caminho normal desta tela é montar bloco a bloco, e ele é bom para
       ESCREVER. Não serve para RECEBER: a roteirista manda o roteiro pronto
       num bloco de texto, e transformar isso em nove blocos à mão — clicando
       "Fala", colando, clicando "Fala", colando — é trabalho de digitação
       que o sistema pode fazer sozinho.

       A separação e a tipagem saem de lib/importar.js, o mesmo parser da tela
       de importação em massa. E, como lá, nada entra sem a pessoa ver antes o
       que foi entendido.
       ═══════════════════════════════════════════════════════════════════ */
    function abrirColar() {
        const temRoteiro = blocos.length > 0;

        openDrawer({
            title: 'Colar roteiro',
            subtitle: c.titulo,
            body: `
                <div class="rt-colar">
                    <p class="rt-colar__dica">
                        Cole o texto como a roteirista mandou. Cada marcador
                        (<code>-</code>, <code>*</code>, <code>1.</code>) ou parágrafo vira um bloco.
                        A primeira fala vira <strong>gancho</strong>, a última vira
                        <strong>chamada para ação</strong> se pedir algo, e frases curtas viram
                        <strong>frase curta</strong>. Tudo é editável depois.
                    </p>
                    <textarea class="ds-input rt-colar__campo" id="rt-texto" rows="12"
                              placeholder="*ROTEIRO FLACIDEZ NA FACE*&#10;&#10;- Você emagreceu e percebeu que seu rosto ficou mais caído?&#10;&#10;- Isso é mais comum do que parece.&#10;&#10;- Eu sou a Dra. Laiz e te aguardo pra uma avaliação!"></textarea>

                    ${temRoteiro ? `
                        <!-- A escolha entre substituir e acrescentar mora AQUI, e
                             não no rodapé. Ela é sobre o conteúdo — pertence ao
                             lado do texto que a pessoa acabou de colar. E dois
                             botões de ação mais o Cancelar não cabem na largura
                             do painel: o principal era cortado pela borda. -->
                        <div class="rt-modo">
                            <span class="vz-rotulo">Este conteúdo já tem ${blocos.length} bloco${blocos.length > 1 ? 's' : ''}</span>
                            <div class="rt-modo__opcoes" id="rt-modo">
                                <button type="button" class="rt-modo__op is-active" data-modo="substituir">
                                    <i data-lucide="replace"></i>
                                    <span><strong>Substituir</strong>O roteiro atual sai.</span>
                                </button>
                                <button type="button" class="rt-modo__op" data-modo="acrescentar">
                                    <i data-lucide="list-plus"></i>
                                    <span><strong>Acrescentar</strong>Entra no fim do que já existe.</span>
                                </button>
                            </div>
                        </div>` : ''}

                    <div id="rt-previa"></div>
                </div>`,
            footer: `
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="rt-cancelar">Cancelar</button>
                <button class="ds-btn ds-btn--primary" id="rt-gravar" disabled>
                    ${temRoteiro ? 'Gravar' : 'Criar roteiro'}
                </button>`,
            onMount: (painel) => {
                injectEstilosColar();
                const campo = painel.querySelector('#rt-texto');
                const previa = painel.querySelector('#rt-previa');
                const gravarBtn = painel.querySelector('#rt-gravar');
                const seletorModo = painel.querySelector('#rt-modo');
                let modo = 'substituir';
                let lido = { titulo: null, blocos: [] };

                seletorModo?.addEventListener('click', (e) => {
                    const b = e.target.closest('[data-modo]');
                    if (!b) return;
                    modo = b.dataset.modo;
                    seletorModo.querySelectorAll('[data-modo]').forEach(x =>
                        x.classList.toggle('is-active', x === b));
                    analisar();
                });

                const analisar = () => {
                    lido = lerRoteiroUnico(campo.value);
                    const vazio = !lido.blocos.length;
                    gravarBtn.disabled = vazio;
                    if (!vazio) {
                        gravarBtn.textContent = temRoteiro
                            ? (modo === 'substituir'
                                ? `Substituir por ${lido.blocos.length}`
                                : `Acrescentar ${lido.blocos.length}`)
                            : `Criar ${lido.blocos.length} bloco${lido.blocos.length > 1 ? 's' : ''}`;
                    }

                    if (vazio) { previa.innerHTML = ''; return; }

                    const conta = {};
                    for (const b of lido.blocos) conta[b.tipo] = (conta[b.tipo] || 0) + 1;

                    previa.innerHTML = `
                        <div class="rt-previa">
                            <div class="rt-previa__cabeca">
                                <i data-lucide="wand-sparkles"></i>
                                ${lido.blocos.length} bloco${lido.blocos.length > 1 ? 's' : ''} ·
                                ${Object.entries(conta).map(([t, n]) => `${n} ${tipoBloco(t).nome.toLowerCase()}`).join(', ')}
                                · ~${esc(duracaoTotal(lido.blocos))} de fala
                            </div>
                            ${lido.titulo && lido.titulo.toLowerCase() !== c.titulo.toLowerCase() ? `
                                <p class="rt-previa__titulo">
                                    O texto se chama “${esc(lido.titulo)}”. O título do conteúdo não muda —
                                    continua “${esc(c.titulo)}”.
                                </p>` : ''}
                            <ol class="rt-previa__lista">
                                ${lido.blocos.map(b => `
                                    <li>
                                        <span class="rt-previa__tipo rt-previa__tipo--${esc(b.tipo)}">
                                            <i data-lucide="${esc(tipoBloco(b.tipo).icone)}"></i>${esc(tipoBloco(b.tipo).nome)}
                                        </span>
                                        <span class="rt-previa__texto">${esc(b.texto || b.titulo || '')}</span>
                                    </li>`).join('')}
                            </ol>
                        </div>`;
                    if (window.lucide) lucide.createIcons();
                };

                campo.addEventListener('input', analisar);
                painel.querySelector('#rt-cancelar').addEventListener('click', closeDrawer);

                const gravar = async () => {
                    const rotuloAnterior = gravarBtn.textContent;
                    gravarBtn.disabled = true;
                    gravarBtn.textContent = 'Gravando…';
                    try {
                        if (modo === 'substituir') {
                            for (const antigo of blocos) await store.blocos.excluir(antigo.id);
                        }
                        let ordem = modo === 'substituir' ? 10 : proximaOrdem(blocos);
                        for (const bloco of lido.blocos) {
                            await store.blocos.salvar({
                                conteudo_id: conteudoId,
                                tipo: bloco.tipo,
                                titulo: bloco.titulo || null,
                                texto: bloco.texto || null,
                                ordem,
                            });
                            ordem += 10;
                        }
                        closeDrawer();
                        toast(`${lido.blocos.length} bloco(s) criado(s). Confira os tipos antes de liberar.`);
                        recarregar();
                    } catch (e) {
                        console.error('[roteiro] falha ao colar:', e);
                        toast('Não foi possível gravar. Tente de novo.');
                        gravarBtn.disabled = false;
                        gravarBtn.textContent = rotuloAnterior;
                    }
                };

                gravarBtn.addEventListener('click', gravar);
                campo.focus();
            },
        });
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

const blocoEditavel = (b, i, total, historico = []) => {
    const t = tipoBloco(b.tipo);
    const usaTitulo = ['secao', 'bloco'].includes(b.tipo);
    const soTitulo = b.tipo === 'secao';
    const comentarios = historico.filter(r => r.bloco_id === b.id);

    return `
        <div class="rt-bloco rt-bloco--${esc(b.tipo)} ${comentarios.length ? 'rt-bloco--comentado' : ''}"
             data-bloco="${esc(b.id)}">
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

            ${comentarios.map(r => `
                <div class="rt-comentario">
                    <div class="rt-comentario__cabeca">
                        <i data-lucide="message-circle"></i>
                        O cliente pediu ajuste nesta fala
                        ${r.autor ? `· ${esc(r.autor)}` : ''}
                        <span class="rt-comentario__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                    </div>
                    <p class="rt-comentario__texto">${esc(r.texto || '')}</p>
                    ${r.trecho && r.trecho !== b.texto ? `
                        <!-- Só aparece quando o texto MUDOU desde o comentário. Sem
                             isso, quem lê depois não entende a crítica: ela fala de
                             uma frase que já foi reescrita. -->
                        <p class="rt-comentario__antes">
                            <i data-lucide="history"></i>
                            Na época ele estava lendo: “${esc(r.trecho)}”
                        </p>` : ''}
                </div>`).join('')}
        </div>`;
};

/* Os estilos do painel de colar vão num <style> próprio, injetado uma vez.
   Não podem entrar no ESTILOS da página: o painel mora no <body>, fora do
   #app que o roteador reescreve, e o bloco da página some junto com ela. */
function injectEstilosColar() {
    if (document.getElementById('roteiro-colar-styles')) return;
    const style = document.createElement('style');
    style.id = 'roteiro-colar-styles';
    style.textContent = `
        .rt-colar { display: flex; flex-direction: column; gap: var(--space-4); }
        .rt-colar__dica { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
        .rt-colar__dica strong { color: var(--text-primary); }
        .rt-colar__dica code {
            font-family: var(--font-mono); font-size: 12px;
            padding: 1px 5px; border-radius: var(--radius-xs);
            background: rgba(255, 255, 255, 0.10); color: var(--text-primary);
        }
        .rt-colar__campo {
            height: auto; padding: var(--space-3) var(--space-4);
            resize: vertical; line-height: var(--leading-body);
            font-family: var(--font-sans); font-size: var(--text-sm);
        }

        /* ── Substituir ou acrescentar ────────────────────────────────────
           Duas caixas grandes em vez de dois botões no rodapé. A diferença
           entre elas é destrutiva de um lado e não do outro, e essa distinção
           precisa de espaço para uma linha de explicação — que num botão de
           rodapé não cabe. */
        .rt-modo { display: flex; flex-direction: column; gap: var(--space-2); }
        .rt-modo__opcoes { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .rt-modo__op {
            flex: 1 1 180px; min-width: 0;
            display: flex; align-items: flex-start; gap: var(--space-3);
            padding: var(--space-3) var(--space-4);
            border: 1px solid var(--glass-border); border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.06);
            color: var(--text-secondary); text-align: left; cursor: pointer;
            font-family: var(--font-sans);
            transition: border-color var(--dur-fast), background-color var(--dur-fast);
        }
        .rt-modo__op:hover { border-color: var(--accent-border); }
        .rt-modo__op.is-active { border-color: var(--accent); background: var(--accent-muted); }
        .rt-modo__op i, .rt-modo__op svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; }
        .rt-modo__op.is-active i, .rt-modo__op.is-active svg { color: var(--accent); }
        .rt-modo__op span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .rt-modo__op strong { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
        .rt-modo__op span span, .rt-modo__op span { font-size: var(--text-xs); line-height: var(--leading-body); }

        /* ── Prévia ───────────────────────────────────────────────────────
           Aparece enquanto se cola e some quando o campo esvazia. É o que
           transforma "confie no parser" em "veja o que ele entendeu". */
        .rt-previa {
            display: flex; flex-direction: column; gap: var(--space-3);
            padding: var(--space-4);
            border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid var(--glass-border);
        }
        .rt-previa__cabeca {
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
            font-size: var(--text-xs); font-weight: 700; color: var(--accent);
            text-transform: uppercase; letter-spacing: var(--tracking-wide);
        }
        .rt-previa__cabeca i, .rt-previa__cabeca svg { width: 14px; height: 14px; }
        .rt-previa__titulo { margin: 0; font-size: var(--text-xs); color: var(--text-secondary); line-height: var(--leading-body); }

        .rt-previa__lista { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-2); max-height: 40vh; overflow-y: auto; }
        .rt-previa__lista li { display: flex; flex-direction: column; gap: 3px; }
        .rt-previa__tipo {
            display: inline-flex; align-items: center; gap: 5px; align-self: flex-start;
            font-size: 10px; font-weight: 700; letter-spacing: var(--tracking-wide);
            text-transform: uppercase; color: var(--text-tertiary);
        }
        .rt-previa__tipo i, .rt-previa__tipo svg { width: 11px; height: 11px; }
        /* Os três tipos que o sistema DEDUZIU ganham cor. O resto é fala, que
           é o padrão — colorir tudo faria a cor deixar de significar algo. */
        .rt-previa__tipo--gancho { color: var(--accent); }
        .rt-previa__tipo--cta    { color: var(--success); }
        .rt-previa__tipo--frase  { color: var(--data-3); }
        .rt-previa__texto {
            font-size: var(--text-sm); color: var(--text-primary);
            line-height: var(--leading-body);
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
    `;
    document.head.appendChild(style);
}

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

/* ── Comentário do cliente numa fala ─────────────────────────────────────
   Mora DENTRO do bloco, não numa lista à parte. É a diferença entre "o cliente
   reclamou de alguma coisa" e "o cliente reclamou disto aqui" — e é o motivo
   inteiro de o comentário por fala existir. */
.rt-bloco--comentado { border-color: color-mix(in oklch, var(--warning) 45%, transparent); }
.rt-comentario {
    display: flex; flex-direction: column; gap: var(--space-2);
    margin-top: var(--space-2); padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: color-mix(in oklch, var(--warning) 10%, transparent);
}
.rt-comentario__cabeca {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); font-weight: 600; color: var(--warning);
}
.rt-comentario__cabeca i, .rt-comentario__cabeca svg { width: 13px; height: 13px; }
.rt-comentario__data { margin-left: auto; font-weight: 400; color: var(--text-tertiary); }
.rt-comentario__texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body); }
.rt-comentario__antes {
    display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
    font-size: var(--text-xs); color: var(--text-tertiary); font-style: italic; line-height: var(--leading-body);
}
.rt-comentario__antes i, .rt-comentario__antes svg { width: 12px; height: 12px; flex-shrink: 0; margin-top: 2px; }

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
