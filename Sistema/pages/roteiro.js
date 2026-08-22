import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirMenu } from '../components/menu.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { lerRoteiroUnico } from '../lib/importar.js';
import { toast } from '../components/toast.js';
import { esc, dataBR, quandoRelativo, nomeDia, duracao, segundosDeFala } from '../lib/formato.js';
import { objetivo, classificar, nomeFase } from '../lib/diretorio.js';
import { retornosDe } from '../lib/cronograma.js';
import { timeSalvo } from '../lib/gestor.js';
import { linkDoCliente } from '../lib/apelido.js';
import { abrirTeleprompter } from '../lib/teleprompter.js';
import { ETAPAS, etapaAtual, proximaEtapa, chipEtiqueta, etiquetaMeta, injectEstilosEtiqueta } from '../lib/etiquetas.js';
import { moverParaEtapa } from '../lib/etapas.js';
import {
    conversas, estadoMeta, ato, daEquipe, textoOriginal, entradaDaEquipe,
} from '../lib/conversa.js';
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
    /* A leitura das conversas sai de lib/conversa.js e é a MESMA que a tela do
       cliente usa. Duas leituras do mesmo histórico acabariam discordando, e o
       sistema perderia a única coisa que ele oferece: um lugar onde os dois
       lados olham o mesmo estado. */
    /* ── Limpeza de quem ficou órfão, e SÓ dele ──────────────────────────
       A regra "sem roteiro, sem conversa" vale na exclusão. Ela também roda ao
       abrir, para alcançar o que foi apagado antes de a regra existir — mas
       agora só quando há CONVERSA órfã, que é o sinal de que houve um roteiro
       ali um dia.

       Antes ela bastava o status não ser rascunho, e isso pegava o caso mais
       comum do mundo: uma demanda recém-criada, liberada para o cliente e
       ainda sem roteiro escrito. Abrir para trabalhar nela rebaixava para
       rascunho, tirava da tela do cliente e devolvia a pessoa para o mês
       errado — três coisas que ninguém pediu, no meio de outra tarefa.

       Sem conversa, o sistema não mexe em nada. A contradição continua sendo
       apontada em /conferencia, com o conserto ao lado, onde a decisão é de
       quem está olhando. */
    if (!blocos.length && historico.length) {
        for (const r of historico) await store.retornos.excluir(r.id);
        if (c.status !== 'rascunho') await store.conteudos.salvar({ ...c, status: 'rascunho' });
        toast('Este conteúdo estava sem roteiro: a conversa e o estado antigos saíram junto.');
        return renderRoteiro(container, conteudoId);
    }

    const fio = conversas(historico);

    /* ── Seleção múltipla ───────────────────────────────────────────────
       Vive fora de desenhar() porque desenhar() é chamado a cada mudança, e
       uma seleção que se perde ao trocar o tipo de um bloco é pior que não
       existir: a pessoa marca cinco falas, encosta em qualquer outra coisa e
       recomeça. */
    let selecionando = false;
    let selecionadas = new Set();

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
            </button>
            ${/* A esteira fica na OUTRA PONTA da linha de ações, separada das
                  que abrem telas. É a única daqui que muda o estado da peça, e
                  encostá-la em "Editar ficha" convidaria ao clique errado. */''}
            <span class="rt-esteira">
                <button class="ds-btn ds-btn--primary ds-btn--sm" id="rt-avancar">
                    <i data-lucide="arrow-right"></i> ${esc(rotuloAvancar(c))}
                </button>
                <button class="ds-btn ds-btn--primary ds-btn--sm rt-esteira__mais" id="rt-etapas"
                        aria-label="Escolher outra etapa" aria-haspopup="menu">
                    <i data-lucide="chevron-down"></i>
                </button>
            </span>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosEtiqueta();

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
                        ${/* A etapa da esteira ao lado do status: um é a
                              conversa com o cliente, o outro é onde a peça
                              está na produção. Ler os dois juntos é o que
                              responde "e agora?". */''}
                        ${(c.etiquetas || []).map(chipEtiqueta).join('')}
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
                ${sugestaoDeFase(c, blocos)}
                ${explicacaoObjetivo(c.fase, c.objetivo)}
                ${c.nota ? `<p class="rt-interna"><i data-lucide="lock"></i> ${esc(c.nota)}</p>` : ''}
            </article>

            ${historico.length ? `
                <article class="ds-card vz-secao">
                    <div class="vz-secao__cabeca">
                        <div>
                            <h2 class="ds-card-title">A conversa</h2>
                            <span class="ds-card-sub">${esc(resumoDoFio(fio, historico))}</span>
                        </div>
                        ${fio.respondidas ? `
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-avisar">
                                <i data-lucide="send"></i> Avisar o cliente
                            </button>` : ''}
                    </div>
                    <div class="rt-retornos">
                        ${historico.map(r => {
                            const a = ato(r);
                            /* Clicável quando fala de uma fala. Ler "a abertura
                               ficou agressiva" aqui e ter de caçar qual bloco é
                               o trabalho que este clique elimina. */
                            const tag = r.bloco_id ? 'button' : 'div';
                            return `
                            <${tag} class="rt-retorno rt-retorno--${esc(a.tom)} ${r.bloco_id ? 'rt-retorno--ir' : ''}"
                                    ${r.bloco_id ? `data-ir-bloco="${esc(r.bloco_id)}" title="Ir até a fala"` : ''}>
                                <div class="rt-retorno__cabeca">
                                    <i data-lucide="${esc(a.icone)}"></i>
                                    ${esc(daEquipe(r) ? a.rotulo : (r.tipo === 'aprovado' ? 'O cliente aprovou' : 'O cliente pediu ajuste'))}
                                    ${r.autor ? `· ${esc(r.autor)}` : ''}
                                    <span class="rt-retorno__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                                </div>
                                ${r.texto ? `<p class="rt-retorno__texto">${esc(r.texto)}</p>` : ''}
                                ${r.bloco_id ? `<span class="rt-retorno__ir"><i data-lucide="corner-down-right"></i> ver a fala</span>` : ''}
                            </${tag}>`;
                        }).join('')}
                    </div>

                    ${/* O pedido do RODAPÉ da tela do cliente fala do conteúdo
                          inteiro e não tem bloco para pendurar resposta. Sem
                          estas ações, o pedido mais antigo do sistema seria o
                          único que a equipe não consegue encerrar. */''}
                    ${fio.doConteudo.estado && fio.doConteudo.estado !== 'fechado' ? `
                        <div class="rt-fio__acoes">
                            <button class="ds-btn ds-btn--primary ds-btn--sm" data-responder-conteudo="ajustado">
                                <i data-lucide="pencil-line"></i> Ajustamos o roteiro
                            </button>
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" data-responder-conteudo="resposta">
                                <i data-lucide="message-square-reply"></i> Responder
                            </button>
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-encerrar-conteudo">
                                <i data-lucide="circle-check"></i> Encerrar
                            </button>
                        </div>` : ''}
                </article>` : ''}

            <!-- ══ Roteiro ═════════════════════════════════════════════ -->
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Roteiro</h2>
                        <span class="ds-card-sub" id="rt-medida">${esc(medida(blocos))}</span>
                    </div>
                    <div class="rt-acoes-topo">
                        ${blocos.length ? `
                            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-prompter">
                                <i data-lucide="captions"></i> Teleprompter
                            </button>` : ''}
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-colar">
                            <i data-lucide="clipboard-paste"></i> Colar roteiro
                        </button>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-copiar">
                            <i data-lucide="copy"></i> Copiar texto
                        </button>
                        ${blocos.length ? `
                            <button class="ds-btn ds-btn--ghost ds-btn--sm ${selecionando ? 'is-ativo' : ''}" id="rt-selecionar">
                                <i data-lucide="${selecionando ? 'x' : 'list-checks'}"></i>
                                ${selecionando ? 'Cancelar seleção' : 'Selecionar'}
                            </button>
                            <button class="ds-btn ds-btn--ghost ds-btn--sm rt-perigo" id="rt-excluir-tudo">
                                <i data-lucide="trash-2"></i> Excluir roteiro
                            </button>` : ''}
                    </div>
                </div>

                ${avisos.length ? `
                    <div class="rt-avisos">
                        ${avisos.map(a => `<p class="rt-aviso"><i data-lucide="triangle-alert"></i> ${esc(a)}</p>`).join('')}
                    </div>` : ''}

                ${selecionando ? barraSelecao(blocos, selecionadas) : ''}

                <div class="rt-blocos ${selecionando ? 'rt-blocos--selecionando' : ''}" id="rt-blocos">
                    ${blocos.length
                        ? blocos.map((b, i) => blocoEditavel(b, i, blocos.length, fio.porBloco.get(b.id),
                                                            selecionando, selecionadas.has(b.id))).join('')
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

    /* A barra é atualizada no lugar, sem redesenho: redesenhar a página a cada
       marcação a devolveria ao topo, e marcar sete falas exigiria rolar sete
       vezes até o mesmo ponto. */
    function atualizarBarra() {
        const n = selecionadas.size;
        const conta = content.querySelector('#rt-sel-conta');
        const excluir = content.querySelector('#rt-sel-excluir');
        const todas = content.querySelector('#rt-sel-todas');
        if (!conta) return;
        conta.textContent = n
            ? `${n} de ${blocos.length} selecionada${n > 1 ? 's' : ''}`
            : 'Marque as falas que vão sair';
        if (excluir) {
            excluir.disabled = !n;
            excluir.querySelector('span').textContent = n > 1 ? `Excluir ${n}` : 'Excluir';
        }
        if (todas) todas.textContent = n === blocos.length ? 'Limpar seleção' : 'Selecionar todas';
    }

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

        content.querySelector('#rt-aplicar-fase')?.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            b.disabled = true;
            const anterior = c.fase;
            await store.conteudos.salvar({ ...c, fase: b.dataset.fase });
            toast(`Fase: ${nomeFase(b.dataset.fase)}.`, {
                label: 'Desfazer',
                onClick: async () => {
                    await store.conteudos.salvar({ ...c, fase: anterior });
                    recarregar();
                },
            });
            recarregar();
        });

        content.querySelector('#rt-prompter')?.addEventListener('click', () => {
            const { erro } = abrirTeleprompter(c, blocos);
            if (erro) toast(erro);
        });

        content.querySelector('#rt-avisar')?.addEventListener('click', abrirAviso);

        // ── Seleção múltipla ────────────────────────────────────────────
        content.querySelector('#rt-selecionar')?.addEventListener('click', () => {
            selecionando = !selecionando;
            selecionadas.clear();
            desenhar();
        });

        content.querySelector('#rt-excluir-tudo')?.addEventListener('click', confirmarExcluirTudo);

        content.querySelectorAll('[data-marcar]').forEach(caixa =>
            caixa.addEventListener('change', () => {
                const id = caixa.dataset.marcar;
                if (caixa.checked) selecionadas.add(id); else selecionadas.delete(id);
                /* Sem redesenhar: a página inteira voltaria ao topo a cada
                   marcação, e marcar sete falas exigiria rolar sete vezes. */
                caixa.closest('[data-bloco]').classList.toggle('rt-bloco--marcada', caixa.checked);
                atualizarBarra();
            }));

        content.querySelector('#rt-sel-todas')?.addEventListener('click', () => {
            const todas = selecionadas.size === blocos.length;
            selecionadas = todas ? new Set() : new Set(blocos.map(b => b.id));
            content.querySelectorAll('[data-marcar]').forEach(caixa => {
                caixa.checked = !todas;
                caixa.closest('[data-bloco]').classList.toggle('rt-bloco--marcada', !todas);
            });
            atualizarBarra();
        });

        content.querySelector('#rt-sel-excluir')?.addEventListener('click', async (e) => {
            const botao = e.target.closest('button');
            botao.disabled = true;
            const escolhidos = blocos.filter(b => selecionadas.has(b.id));
            const esvaziou = await excluirBlocos(escolhidos, {
                rotulo: `${escolhidos.length} bloco${escolhidos.length > 1 ? 's excluídos.' : ' excluído.'}`,
            });
            selecionadas.clear();
            selecionando = false;
            if (!esvaziou) desenhar();
        });

        // ── Ir até a fala comentada ─────────────────────────────────────
        content.querySelectorAll('[data-ir-bloco]').forEach(botao =>
            botao.addEventListener('click', () => irAteOBloco(botao.dataset.irBloco)));

        // ── Responder e encerrar ────────────────────────────────────────
        content.querySelectorAll('[data-responder]').forEach(botao =>
            botao.addEventListener('click', () => responder(
                blocos.find(x => x.id === botao.dataset.blocoFio), botao.dataset.responder)));

        content.querySelectorAll('[data-fio]').forEach(caixa =>
            caixa.addEventListener('toggle', () => guardarFio(caixa.dataset.fio, caixa.open)));

        content.querySelectorAll('[data-responder-conteudo]').forEach(botao =>
            botao.addEventListener('click', () => responder(null, botao.dataset.responderConteudo)));

        content.querySelector('#rt-encerrar-conteudo')?.addEventListener('click', async (e) => {
            const botao = e.target.closest('button');
            botao.disabled = true;
            await store.retornos.salvar(entradaDaEquipe({
                conteudoId: c.id, blocoId: null, tipo: 'aprovado',
                texto: null, autor: autorPadrao(),
            }));
            toast('Assunto encerrado. Fica no histórico.');
            recarregar();
        });

        content.querySelectorAll('[data-encerrar]').forEach(botao =>
            botao.addEventListener('click', async () => {
                const b = blocos.find(x => x.id === botao.dataset.encerrar);
                botao.disabled = true;
                await store.retornos.salvar(entradaDaEquipe({
                    conteudoId: c.id, blocoId: b.id, tipo: 'aprovado',
                    texto: null, autor: autorPadrao(),
                    trecho: b.texto || b.titulo || null,
                }));
                toast('Assunto encerrado. Fica no histórico.');
                recarregar();
            }));

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

                const conversa = fio.porBloco.get(id);

                abrirMenu(botao, [
                    /* O histórico vem PRIMEIRO quando existe. Quem abre o menu
                       de um bloco marcado como pendente quase sempre quer ver
                       o que já foi dito, não trocar o tipo dele. */
                    ...(conversa ? [{
                        id: 'historico', label: 'Histórico da conversa', icon: 'history',
                        onClick: () => abrirHistorico(b, conversa),
                    }] : []),
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
       RESPONDER AO CLIENTE

       O comentário chegava e a equipe não tinha o que fazer com ele. Reescrever
       o bloco resolvia o roteiro e não resolvia a conversa: o pedido continuava
       com a mesma cara de pendência, e ninguém conseguia dizer se aquilo tinha
       sido tratado.

       Dois desfechos, e eles são diferentes de propósito:
         AJUSTAMOS  o texto mudou — o `trecho` congela como ele ficou
         RESPONDEMOS não mudou, e aqui está o porquê

       Colapsar os dois num "resolvido" ensinaria a marcar como ajustado o que
       não foi ajustado, que é a maneira mais rápida de tornar o histórico
       inútil.

       O QUE A EQUIPE ESCREVE AQUI, O CLIENTE LÊ. O painel diz isso em letras
       grandes: a mesma tabela alimenta as duas telas, e um comentário interno
       digitado por engano aqui vai parar no celular dele.
       ═══════════════════════════════════════════════════════════════════ */
    function responder(bloco, tipo) {
        const ajustou = tipo === 'ajustado';
        /* `bloco` nulo = a conversa é sobre o conteúdo inteiro, que é o que o
           pedido de ajuste do rodapé produz na tela do cliente. Sem este caso,
           o pedido mais antigo do sistema seria o único sem resposta possível. */
        const atual = bloco ? (bloco.texto || bloco.titulo || '') : '';

        openDrawer({
            title: ajustou
                ? (bloco ? 'Ajustamos esta fala' : 'Ajustamos o roteiro')
                : 'Responder ao cliente',
            subtitle: c.titulo,
            body: `
                <div class="rt-resp">
                    <p class="rt-resp__aviso">
                        <i data-lucide="eye"></i>
                        O cliente lê esta mensagem no link dele. Não é nota interna.
                    </p>

                    ${ajustou && bloco ? `
                        <div class="rt-resp__texto">
                            <span class="vz-rotulo">Como a fala está agora</span>
                            <p>${esc(atual) || '<em>vazia</em>'}</p>
                        </div>
                        <p class="rt-resp__dica">
                            Edite a fala na página antes de mandar, se ainda não editou —
                            é este texto que fica registrado como o "depois".
                        </p>` : ''}

                    <label class="vz-rotulo" for="rt-resp-texto">
                        ${ajustou ? 'O que mudou (opcional)' : 'O que você quer dizer a ele'}
                    </label>
                    <textarea class="ds-input rt-resp__campo" id="rt-resp-texto" rows="4"
                              placeholder="${esc(ajustou
                                  ? 'Ex.: trocamos a abertura por uma pergunta mais leve.'
                                  : 'Ex.: preferimos manter esse trecho porque é o que segura a atenção nos 3 primeiros segundos.')}"></textarea>

                    <label class="vz-rotulo" for="rt-resp-autor">Quem está respondendo</label>
                    <input class="ds-input" id="rt-resp-autor" type="text" list="rt-time"
                           value="${esc(autorPadrao())}" placeholder="Seu nome" autocomplete="off">
                    <datalist id="rt-time">
                        ${timeSalvo().map(i => `<option value="${esc(i.nome)}"></option>`).join('')}
                    </datalist>

                    <p class="rt-resp__erro" id="rt-resp-erro" hidden></p>
                </div>`,
            footer: `
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="rt-resp-cancelar">Cancelar</button>
                <button class="ds-btn ds-btn--primary" id="rt-resp-enviar">
                    ${ajustou ? 'Marcar como ajustado' : 'Enviar resposta'}
                </button>`,
            onMount: (painel) => {
                injectEstilosPainel();
                const campo = painel.querySelector('#rt-resp-texto');
                const erro = painel.querySelector('#rt-resp-erro');
                const botao = painel.querySelector('#rt-resp-enviar');
                painel.querySelector('#rt-resp-cancelar').addEventListener('click', closeDrawer);

                botao.addEventListener('click', async () => {
                    const texto = campo.value.trim();
                    const autor = painel.querySelector('#rt-resp-autor').value.trim();

                    /* Texto é obrigatório em "responder" e opcional em
                       "ajustamos". Uma resposta sem texto não responde nada;
                       um ajuste sem texto ainda diz a coisa mais importante,
                       que é "mexemos nisto" — e o texto novo está na tela. */
                    if (!ajustou && !texto) {
                        erro.textContent = 'Escreva a resposta — é ela que o cliente vai ler.';
                        erro.hidden = false;
                        campo.focus();
                        return;
                    }

                    botao.disabled = true;
                    botao.textContent = 'Enviando…';
                    try {
                        guardarAutor(autor);
                        await store.retornos.salvar(entradaDaEquipe({
                            conteudoId: c.id, blocoId: bloco?.id || null, tipo,
                            texto, autor,
                            // O texto de AGORA. É ele que vira o "depois" no
                            // histórico, e o que sobrevive à próxima edição.
                            trecho: atual || null,
                        }));
                        closeDrawer();
                        toast(ajustou ? 'Marcado como ajustado.' : 'Resposta enviada.', {
                            label: 'Avisar o cliente',
                            onClick: abrirAviso,
                        });
                        recarregar();
                    } catch (e) {
                        console.error('[roteiro] falha ao responder:', e);
                        erro.textContent = e.message || 'Não foi possível gravar agora.';
                        erro.hidden = false;
                        botao.disabled = false;
                        botao.textContent = ajustou ? 'Marcar como ajustado' : 'Enviar resposta';
                    }
                });
                campo.focus();
            },
        });
    }

    /* O histórico completo de UMA fala, em painel.

       O fio dentro do bloco mostra a conversa, e é o suficiente enquanto ela é
       curta. Depois de três idas e vindas ele empurra o roteiro para baixo e
       atrapalha justamente quem está escrevendo. O painel é onde a conversa
       inteira cabe sem custar espaço à tela de trabalho — com o texto de
       partida e o de chegada lado a lado, que é a pergunta real: mudou o quê? */
    function abrirHistorico(bloco, conversa) {
        const atual = bloco.texto || bloco.titulo || '';
        const original = textoOriginal(conversa.entradas, atual);
        const meta = estadoMeta(conversa.estado);

        openDrawer({
            title: 'Histórico da conversa',
            subtitle: `${tipoBloco(bloco.tipo).nome} · ${c.titulo}`,
            body: `
                <div class="rt-hist">
                    <div class="rt-hist__estado rt-hist__estado--${esc(meta.tom)}">
                        <i data-lucide="${esc(meta.icone)}"></i> ${esc(meta.rotulo)}
                    </div>

                    ${original ? `
                        <div class="rt-hist__diff">
                            <div class="rt-hist__lado">
                                <span class="vz-rotulo">Como começou</span>
                                <p class="rt-hist__antes">${esc(original)}</p>
                            </div>
                            <i class="rt-hist__seta" data-lucide="arrow-down"></i>
                            <div class="rt-hist__lado">
                                <span class="vz-rotulo">Como está hoje</span>
                                <p class="rt-hist__depois">${esc(atual)}</p>
                            </div>
                        </div>` : `
                        <div class="rt-hist__lado">
                            <span class="vz-rotulo">A fala</span>
                            <p class="rt-hist__depois">${esc(atual)}</p>
                            <p class="rt-hist__igual">O texto não mudou desde o primeiro comentário.</p>
                        </div>`}

                    <ol class="rt-hist__linha">
                        ${conversa.entradas.map(r => {
                            const a = ato(r);
                            const equipe = daEquipe(r);
                            return `
                            <li class="rt-hist__item rt-hist__item--${equipe ? 'equipe' : 'cliente'}">
                                <span class="rt-hist__marca rt-hist__marca--${esc(a.tom)}">
                                    <i data-lucide="${esc(a.icone)}"></i>
                                </span>
                                <div>
                                    <div class="rt-hist__cabeca">
                                        ${esc(equipe ? a.rotulo : (r.tipo === 'aprovado' ? 'O cliente aprovou' : 'O cliente pediu ajuste'))}
                                        ${r.autor ? `· ${esc(r.autor)}` : ''}
                                        <span class="rt-hist__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                                    </div>
                                    ${r.texto ? `<p class="rt-hist__texto">${esc(r.texto)}</p>` : ''}
                                    ${r.trecho ? `<p class="rt-hist__trecho">“${esc(r.trecho)}”</p>` : ''}
                                </div>
                            </li>`;
                        }).join('')}
                    </ol>
                </div>`,
            footer: `
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="rt-hist-fechar">Fechar</button>`,
            onMount: (painel) => {
                injectEstilosPainel();
                painel.querySelector('#rt-hist-fechar').addEventListener('click', closeDrawer);
                if (window.lucide) lucide.createIcons();
            },
        });
    }

    /* ═══════════════════════════════════════════════════════════════════
       AVISAR O CLIENTE

       Ele pediu o ajuste e foi embora. Sem aviso, o roteiro corrigido fica
       esperando alguém que não sabe que precisa voltar — e a equipe cobra por
       WhatsApp, que é onde a conversa some.

       ── O QUE ESTA TELA FAZ E O QUE NÃO FAZ ──────────────────────────────
       Ela ESCREVE a mensagem e abre o canal. Não envia sozinha: o Chronos é
       um site estático sobre um banco, sem servidor que possa mandar e-mail em
       nome do estúdio. O botão de e-mail abre o cliente de e-mail DA PESSOA,
       com tudo preenchido, e quem aperta enviar é ela.

       É menos automático e mais honesto que a alternativa — e tem uma
       vantagem que não é consolo: a mensagem sai do endereço do estúdio, com
       a assinatura de sempre, em vez de um "noreply" que o cliente ignora.

       O botão de copiar existe porque o canal real destes clientes é o
       WhatsApp, e ninguém vai colar HTML lá.
       ═══════════════════════════════════════════════════════════════════ */
    function abrirAviso() {
        const link = `${linkDoCliente(cliente)}/${c.id}`;
        const mensagem = mensagemDeAviso(c, cliente, fio, link);

        openDrawer({
            title: 'Avisar o cliente',
            subtitle: c.titulo,
            body: `
                <div class="rt-aviso-cli">
                    <p class="rt-resp__dica">
                        A mensagem já está escrita, com o link que abre direto neste roteiro.
                        Confira e mande pelo canal que vocês usam.
                    </p>

                    <label class="vz-rotulo" for="rt-aviso-msg">Mensagem</label>
                    <textarea class="ds-input rt-resp__campo" id="rt-aviso-msg" rows="8">${esc(mensagem)}</textarea>

                    <label class="vz-rotulo" for="rt-aviso-email">E-mail do cliente</label>
                    <input class="ds-input" id="rt-aviso-email" type="email"
                           value="${esc(cliente?.email || '')}"
                           placeholder="para@clinica.com.br" autocomplete="off">
                    <p class="rt-resp__dica">
                        Fica gravado na ficha do cliente — na próxima vez já vem preenchido.
                        ${cliente?.contato ? `Quem aprova por lá: <strong>${esc(cliente.contato)}</strong>.` : ''}
                    </p>

                    <p class="rt-resp__erro" id="rt-aviso-erro" hidden></p>
                </div>`,
            footer: `
                <button class="ds-btn ds-btn--ghost" id="rt-aviso-copiar">
                    <i data-lucide="copy"></i> Copiar
                </button>
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="rt-aviso-fechar">Fechar</button>
                <button class="ds-btn ds-btn--primary" id="rt-aviso-email-btn">
                    <i data-lucide="mail"></i> Abrir e-mail
                </button>`,
            onMount: (painel) => {
                injectEstilosPainel();
                const msg = painel.querySelector('#rt-aviso-msg');
                const campoEmail = painel.querySelector('#rt-aviso-email');
                const erro = painel.querySelector('#rt-aviso-erro');
                painel.querySelector('#rt-aviso-fechar').addEventListener('click', closeDrawer);

                painel.querySelector('#rt-aviso-copiar').addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(msg.value);
                        toast('Mensagem copiada. Cole no WhatsApp.');
                    } catch {
                        msg.select();
                        toast('Não consegui copiar. O texto está selecionado.');
                    }
                });

                painel.querySelector('#rt-aviso-email-btn').addEventListener('click', async () => {
                    const email = campoEmail.value.trim();
                    if (!email || !email.includes('@')) {
                        erro.textContent = 'Escreva o e-mail de quem aprova.';
                        erro.hidden = false;
                        campoEmail.focus();
                        return;
                    }
                    erro.hidden = true;

                    // Guarda na ficha antes de abrir o cliente de e-mail: a
                    // navegação para mailto: pode tirar o foco da página, e uma
                    // gravação disparada depois disso às vezes não acontece.
                    if (cliente && cliente.email !== email) {
                        try { await store.clientes.salvar({ ...cliente, email }); }
                        catch (e) { console.error('[roteiro] falha ao gravar o e-mail:', e); }
                    }

                    const assunto = `Roteiro ajustado — ${c.titulo}`;
                    window.location.href = `mailto:${encodeURIComponent(email)}`
                        + `?subject=${encodeURIComponent(assunto)}`
                        + `&body=${encodeURIComponent(msg.value)}`;
                    closeDrawer();
                });
                if (window.lucide) lucide.createIcons();
            },
        });
    }

    /* Rola até a fala e a acende por um instante.

       Só rolar não basta: quem clicou num comentário chega numa tela de sete
       blocos parecidos e precisa de meio segundo para saber em qual deles
       parou. O pisca responde isso sem exigir leitura. */
    function irAteOBloco(id) {
        const el = content.querySelector(`[data-bloco="${id}"]`);
        if (!el) return;

        /* Rola suave, e confere se rolou. `behavior: 'smooth'` é ignorado em
           silêncio por alguns navegadores — visto aqui, num deles, sem erro
           nenhum no console: a classe de destaque entrava e a página não saía
           do lugar. O salto seco é pior que a animação e infinitamente melhor
           que não ir a lugar nenhum. */
        const rolador = el.closest('.sh-scroll') || document.scrollingElement;
        const antes = rolador?.scrollTop ?? 0;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => {
            if (rolador && rolador.scrollTop === antes) el.scrollIntoView({ block: 'center' });
        }, 350);

        el.classList.remove('rt-bloco--piscando');
        void el.offsetWidth;   // reinicia a animação quando é o mesmo bloco
        el.classList.add('rt-bloco--piscando');
        setTimeout(() => el.classList.remove('rt-bloco--piscando'), 1600);
    }

    /* ═══════════════════════════════════════════════════════════════════
       EXCLUIR MAIS DE UM DE UMA VEZ

       Apagar bloco a bloco pelo menu ⋯ funciona para um engano. Não funciona
       para o caso real: a roteirista mandou a versão nova inteira, e as sete
       falas antigas precisam sair juntas — sete menus, sete confirmações e
       sete redesenhos.

       ── O DESFAZER DEVOLVE OS COMENTÁRIOS TAMBÉM ─────────────────────────
       Excluir um bloco não apaga a conversa dele: o banco só solta o vínculo
       (`on delete set null`), e o comentário passa a flutuar sem a fala que
       ele critica. Se o desfazer devolvesse só os blocos, o "desfazer" seria
       mentira — a fala voltaria órfã do que o cliente disse sobre ela.

       Por isso os retornos afetados são copiados ANTES de excluir e gravados
       de volta com o mesmo id (`upsert`) na hora de desfazer.
       ═══════════════════════════════════════════════════════════════════ */
    async function excluirBlocos(lista, { rotulo, aoTerminar }) {
        if (!lista.length) return;

        const apagados = lista.map(b => ({ ...b }));
        const ids = new Set(apagados.map(b => b.id));
        const comentarios = historico.filter(r => ids.has(r.bloco_id)).map(r => ({ ...r }));

        for (const b of apagados) await store.blocos.excluir(b.id);
        blocos = renumerar(blocos.filter(x => !ids.has(x.id)));
        for (const x of blocos) await store.blocos.salvar(x);

        /* ── O ROTEIRO ACABOU: A CONVERSA ACABA JUNTO ────────────────────
           Enquanto sobra um bloco, o histórico continua de pé — ele fala de
           um texto que ainda existe. Quando não sobra nenhum, ele passa a
           falar do nada: "aprovado por você" num conteúdo sem roteiro, e
           pedidos de ajuste sobre falas que ninguém consegue mais ler.

           Isto contraria a regra geral da tabela, que é nunca apagar retorno,
           e a contradição é deliberada: o valor daquele histórico era provar
           o que foi combinado sobre UM texto. Sem o texto, ele deixa de ser
           prova e vira ruído com data.

           O status volta para RASCUNHO pelo mesmo motivo. "Aprovado" sem
           roteiro é mentira, "em revisão" é mentira maior — não há o que
           revisar — e rascunho é o único estado honesto: existe no
           cronograma da equipe e não aparece para o cliente até haver texto. */
        const esvaziou = blocos.length === 0;
        const conversaMorta = esvaziou ? historico.map(r => ({ ...r })) : [];
        const statusAnterior = c.status;

        if (esvaziou) {
            for (const r of conversaMorta) await store.retornos.excluir(r.id);
            if (c.status !== 'rascunho') await store.conteudos.salvar({ ...c, status: 'rascunho' });
        }

        const nota = esvaziou
            ? (conversaMorta.length
                ? ` A conversa (${conversaMorta.length}) e o estado foram junto.`
                : ' O conteúdo voltou a rascunho.')
            : (comentarios.length
                ? ` ${comentarios.length} comentário${comentarios.length > 1 ? 's ficaram' : ' ficou'} sem fala.`
                : '');

        toast(`${rotulo}${nota}`, {
            label: 'Desfazer',
            onClick: async () => {
                for (const b of apagados) await store.blocos.salvar(b);
                // Os comentários voltam a apontar para a fala que criticam.
                for (const r of comentarios) await store.retornos.salvar(r);
                // E a conversa inteira volta, com o estado que o conteúdo
                // tinha antes — desfazer pela metade não é desfazer.
                for (const r of conversaMorta) await store.retornos.salvar(r);
                if (esvaziou && statusAnterior !== 'rascunho') {
                    await store.conteudos.salvar({ ...c, status: statusAnterior });
                }
                recarregar();
            },
        });

        /* Esvaziou: a tela inteira mudou de assunto — o cartão da conversa
           deixou de existir e o status é outro. Redesenhar com o `historico`
           que esta função ainda tem na memória mostraria a conversa que
           acabou de ser apagada. Recarrega, e quem chamou não redesenha. */
        if (esvaziou) { recarregar(); return true; }

        aoTerminar?.();
        return false;
    }

    /* Excluir o roteiro inteiro PERGUNTA antes; excluir uma seleção, não.

       Não é inconsistência. A seleção é uma escolha que a pessoa acabou de
       fazer, item por item, e o desfazer do aviso cobre o engano. "Excluir
       roteiro" é um botão só, ao lado de "Copiar texto", e a distância entre
       clicar nele por engano e perder trinta falas não pode ser um clique. */
    function confirmarExcluirTudo() {
        openDrawer({
            title: 'Excluir o roteiro inteiro',
            subtitle: c.titulo,
            body: `
                <div class="rt-resp">
                    <p class="rt-resp__perigo">
                        <i data-lucide="triangle-alert"></i>
                        Isto apaga <strong>${blocos.length} bloco${blocos.length > 1 ? 's' : ''}</strong>${historico.length
                            ? ` e <strong>a conversa inteira</strong> deste conteúdo (${historico.length} registro${historico.length > 1 ? 's' : ''})`
                            : ''}.
                        A data e a classificação continuam como estão.
                    </p>
                    <p class="rt-resp__dica">
                        Sem roteiro, o conteúdo volta a <strong>rascunho</strong> e sai da tela do
                        cliente${c.status === 'aprovado' ? ' — inclusive o "aprovado por você", que passaria a valer para um texto que não existe mais' : ''}.
                    </p>
                    <p class="rt-resp__dica">
                        Dá para desfazer logo depois, pelo aviso que aparece no rodapé.
                        Depois de sair da página, não.
                    </p>
                </div>`,
            footer: `
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="rt-del-cancelar">Cancelar</button>
                <button class="ds-btn rt-btn-perigo" id="rt-del-confirmar">
                    Excluir ${blocos.length} bloco${blocos.length > 1 ? 's' : ''}
                </button>`,
            onMount: (painel) => {
                injectEstilosPainel();
                painel.querySelector('#rt-del-cancelar').addEventListener('click', closeDrawer);
                painel.querySelector('#rt-del-confirmar').addEventListener('click', async (e) => {
                    const botao = e.target.closest('button');
                    botao.disabled = true;
                    botao.textContent = 'Excluindo…';
                    const todos = [...blocos];
                    closeDrawer();
                    const esvaziou = await excluirBlocos(todos, { rotulo: 'Roteiro excluído.' });
                    selecionando = false;
                    selecionadas.clear();
                    if (!esvaziou) desenhar();
                });
                if (window.lucide) lucide.createIcons();
            },
        });
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
                injectEstilosPainel();
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
    /* Avançar é um clique; escolher outra etapa é o menu ao lado. O botão diz
       para ONDE vai — "Mover para gravado" — em vez de um "avançar" que
       obrigaria a lembrar a ordem de cor. */
    const irParaEtapa = async (nome) => {
        const { novoStatus, reabriu, desfazer } = await moverParaEtapa(c, nome, { autor: autorPadrao() });
        toast(`Agora: ${nome}.`
            + (novoStatus ? ` Status: ${STATUS[novoStatus]?.rotulo || novoStatus}.` : '')
            + (reabriu ? ' A volta ficou registrada no histórico.' : ''), {
            label: 'Desfazer',
            onClick: async () => { await desfazer(); recarregar(); },
        });
        recarregar();
    };

    document.getElementById('rt-avancar')?.addEventListener('click', () => {
        const proxima = proximaEtapa(c.etiquetas);
        if (proxima) irParaEtapa(proxima);
    });

    document.getElementById('rt-etapas')?.addEventListener('click', (e) => {
        e.stopPropagation();   // ver a explicação no menu de status
        const atual = etapaAtual(c.etiquetas);
        abrirMenu(e.target.closest('button'), ETAPAS.map(et => ({
            id: et.nome,
            label: et.nome === atual?.nome ? `${et.nome} (agora)` : et.nome,
            icon: et.icone,
            onClick: () => { if (et.nome !== atual?.nome) irParaEtapa(et.nome); },
        })));
    });

    document.getElementById('rt-editar').addEventListener('click', () =>
        formularioConteudo(c, cliente, c.data.slice(0, 7), recarregar,
            [...new Set(conteudos.flatMap(x => x.etiquetas || []))],
            paraTexto(c, blocos)));

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════════
   A FASE, LIDA DO ROTEIRO INTEIRO

   O formulário já classificava pelo título. Aqui há muito mais texto: nove
   falas escritas para convencer alguém, que é exatamente onde os sinais de
   fase moram. Um título como "O que avaliar antes de começar" não diz nada;
   a fala "agende sua avaliação" diz tudo.

   Dois casos, e um silêncio:
     · sem fase   → sugere, e um clique aplica;
     · com fase   → só fala se DISCORDAR, e nunca com confiança baixa;
     · sem sinal  → não aparece. Um cartão que sempre tem palpite ensina a
                    ignorar o cartão.
   ═══════════════════════════════════════════════════════════════════════ */
const sugestaoDeFase = (c, blocos) => {
    const texto = [c.titulo, c.tema, paraTexto(c, blocos)].filter(Boolean).join('. ');
    const s = classificar(texto);
    if (!s) return '';
    if (c.fase && (s.fase === c.fase || s.confianca === 'baixa')) return '';

    const termos = s.termos.slice(0, 5).join(', ');
    return `
        <div class="vz-leitura ${c.fase ? 'vz-leitura--atencao' : ''}">
            <div class="vz-leitura__cabeca">
                <i data-lucide="${c.fase ? 'triangle-alert' : 'wand-sparkles'}"></i>
                ${c.fase ? 'O roteiro discorda da fase' : 'Fase sugerida pelo roteiro'}
            </div>
            <p class="vz-leitura__texto">
                <strong>${esc(nomeFase(s.fase))}.</strong>
                ${c.fase
                    ? `A ficha diz ${esc(nomeFase(c.fase).toLowerCase())}, mas o texto tem mais sinais de ${esc(nomeFase(s.fase).toLowerCase())}`
                    : 'Lido do título e do roteiro'}${termos ? ` — ${esc(termos)}` : ''}.
                ${s.regra ? `<em>${esc(s.regra)}</em>` : ''}
            </p>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-aplicar-fase" data-fase="${esc(s.fase)}">
                <i data-lucide="check"></i> ${c.fase ? `Trocar para ${esc(nomeFase(s.fase).toLowerCase())}` : `Marcar como ${esc(nomeFase(s.fase).toLowerCase())}`}
            </button>
        </div>`;
};

/* O rótulo do botão diz o destino, e o destino sai da esteira: peça sem etapa
   nenhuma começa pelo primeiro estágio, peça publicada não tem para onde ir. */
const rotuloAvancar = (c) => {
    const proxima = proximaEtapa(c.etiquetas);
    if (!proxima) return 'No fim da esteira';
    return `Mover para ${proxima}`;
};

const medida = (blocos) => {
    if (!blocos.length) return 'Nenhum bloco ainda';
    return `${blocos.length} bloco${blocos.length > 1 ? 's' : ''} · ${contarPalavras(blocos)} palavras · `
         + `~${duracaoTotal(blocos)} de fala (estimado)`;
};

const blocoEditavel = (b, i, total, conversa = null, selecionando = false, marcada = false) => {
    const t = tipoBloco(b.tipo);
    const usaTitulo = ['secao', 'bloco'].includes(b.tipo);
    const soTitulo = b.tipo === 'secao';
    const estado = conversa?.estado || null;

    return `
        <div class="rt-bloco rt-bloco--${esc(b.tipo)} ${estado ? `rt-bloco--fio rt-bloco--${esc(estado)}` : ''}
                    ${marcada ? 'rt-bloco--marcada' : ''}"
             data-bloco="${esc(b.id)}">
            <div class="rt-bloco__cabeca">
                ${selecionando ? `
                    <label class="rt-marca">
                        <input type="checkbox" data-marcar="${esc(b.id)}" ${marcada ? 'checked' : ''}
                               aria-label="Selecionar ${esc(t.nome.toLowerCase())}">
                    </label>` : ''}
                <span class="rt-bloco__tipo"><i data-lucide="${esc(t.icone)}"></i>${esc(t.nome)}</span>
                ${t.falado ? `<span class="rt-bloco__dur" data-duracao>${esc(duracao(segundosDeFala(b.texto)))}</span>` : ''}
                ${/* O selo de EDITADO é sobre o texto; o de estado é sobre a
                      conversa. São perguntas diferentes: "esta fala foi
                      reescrita?" e "ainda devo resposta a alguém?" — e um
                      bloco pode ter sido reescrito e continuar pendente. */''}
                ${conversa?.editado ? `<span class="rt-selo rt-selo--edit"><i data-lucide="pencil-line"></i>editado</span>` : ''}
                ${estado ? `<span class="rt-selo rt-selo--${esc(estadoMeta(estado).tom)}">
                    <i data-lucide="${esc(estadoMeta(estado).icone)}"></i>${esc(estadoMeta(estado).curto)}
                </span>` : ''}
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

            ${conversa ? fioHTML(b, conversa) : ''}
        </div>`;
};

/* ═══════════════════════════════════════════════════════════════════════════
   O FIO DA CONVERSA, DENTRO DO BLOCO

   Mora aqui e não numa lista à parte. É a diferença entre "o cliente reclamou
   de alguma coisa" e "o cliente reclamou DISTO" — e é o motivo inteiro de o
   comentário por fala existir.

   As ações ficam no fim do fio, não no menu ⋯. Responder é a continuação
   natural de ler, e esconder a resposta atrás de um menu é o que fazia a
   equipe ler o comentário e não ter o que fazer com ele.
   ═══════════════════════════════════════════════════════════════════════════ */
const fioHTML = (b, { entradas, estado }) => {
    const atual = b.texto || b.titulo || '';
    const meta = estadoMeta(estado);

    return `
        <details class="rt-fio-caixa" data-fio="${esc(b.id)}" ${fioAberto(b.id, estado) ? 'open' : ''}>
            <summary class="rt-fio__resumo">
                <i class="rt-fio__seta" data-lucide="chevron-right"></i>
                <span class="rt-fio__rotulo rt-fio__rotulo--${esc(meta.tom)}">
                    <i data-lucide="${esc(meta.icone)}"></i>${esc(meta.rotulo)}
                </span>
                <!-- "mensagens", não "mensagems": o plural de palavra terminada
                     em -m troca o m por n. O ternário de sempre erraria aqui. -->
                <span class="rt-fio__quantas">${entradas.length} ${entradas.length > 1 ? 'mensagens' : 'mensagem'}</span>
            </summary>
        <div class="rt-fio">
            ${entradas.map(r => {
                const a = ato(r);
                const equipe = daEquipe(r);
                /* O trecho congelado só aparece quando difere do texto de
                   AGORA. Igual, é ruído com cara de informação — e diferente,
                   é a única coisa que faz a crítica continuar legível depois
                   que a fala foi reescrita. */
                const mudou = r.trecho && r.trecho !== atual;
                return `
                <div class="rt-fala rt-fala--${equipe ? 'equipe' : 'cliente'} rt-fala--${esc(a.tom)}">
                    <div class="rt-fala__cabeca">
                        <i data-lucide="${esc(a.icone)}"></i>
                        ${esc(equipe ? a.rotulo : (r.tipo === 'aprovado' ? 'O cliente aprovou' : 'O cliente pediu ajuste'))}
                        ${r.autor ? `· ${esc(r.autor)}` : ''}
                        <span class="rt-fala__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                    </div>
                    ${r.texto ? `<p class="rt-fala__texto">${esc(r.texto)}</p>` : ''}
                    ${mudou ? `
                        <p class="rt-fala__antes">
                            <i data-lucide="history"></i>
                            ${equipe ? 'Ficou assim na época:' : 'Na época ele estava lendo:'}
                            “${esc(r.trecho)}”
                        </p>` : ''}
                </div>`;
            }).join('')}

            ${estado === 'fechado' ? '' : `
                <div class="rt-fio__acoes">
                    <button class="ds-btn ds-btn--primary ds-btn--sm" data-responder="ajustado" data-bloco-fio="${esc(b.id)}">
                        <i data-lucide="pencil-line"></i> Ajustamos
                    </button>
                    <button class="ds-btn ds-btn--ghost ds-btn--sm" data-responder="resposta" data-bloco-fio="${esc(b.id)}">
                        <i data-lucide="message-square-reply"></i> Responder
                    </button>
                    <button class="ds-btn ds-btn--ghost ds-btn--sm" data-encerrar="${esc(b.id)}">
                        <i data-lucide="circle-check"></i> Encerrar
                    </button>
                </div>`}
        </div>
        </details>`;
};

/* ── Recolher a conversa ─────────────────────────────────────────────────
   Nem sempre o time quer reler o desenrolar de um ajuste num roteiro que
   segue vivo — e um fio de seis mensagens empurra o roteiro inteiro para
   baixo justamente de quem está escrevendo.

   O padrão é o estado da conversa, não uma preferência: PENDENTE nasce aberta
   porque é dívida nossa, ENCERRADA nasce fechada porque é arquivo. Respondida
   fica aberta — a bola está com o cliente e a equipe precisa ver o que
   mandou. Quem discorda clica, e a escolha vale para aquele bloco.

   <details> e não um botão com estado em JavaScript: abre e fecha sozinho,
   funciona no teclado, e sobrevive a qualquer redesenho da página. */
const CHAVE_FIO = '5k9_visualizador_fio';

const fioAberto = (blocoId, estado) => {
    try {
        const guardado = localStorage.getItem(`${CHAVE_FIO}_${blocoId}`);
        if (guardado !== null) return guardado === '1';
    } catch { /* sem localStorage: vale o padrão */ }
    return estado !== 'fechado';
};

const guardarFio = (blocoId, aberto) => {
    try { localStorage.setItem(`${CHAVE_FIO}_${blocoId}`, aberto ? '1' : '0'); }
    catch { /* a preferência não persiste, e nada mais quebra */ }
};

/* A barra da seleção múltipla.

   Fica no TOPO da lista, não flutuando no rodapé. A lista de blocos é longa e
   a página inteira rola: uma barra fixa no rodapé cobriria justamente a última
   fala, que é onde a mão está quando se termina de marcar. No topo ela some da
   vista enquanto se rola e reaparece ao voltar — e a contagem é a única coisa
   que precisa ser vista, não o botão. */
const barraSelecao = (blocos, selecionadas) => {
    const n = selecionadas.size;
    return `
        <div class="rt-selecao">
            <span class="rt-selecao__conta" id="rt-sel-conta">
                ${n ? `${n} de ${blocos.length} selecionada${n > 1 ? 's' : ''}` : 'Marque as falas que vão sair'}
            </span>
            <button class="ds-btn ds-btn--ghost ds-btn--sm" id="rt-sel-todas">
                ${n === blocos.length ? 'Limpar seleção' : 'Selecionar todas'}
            </button>
            <button class="ds-btn ds-btn--sm rt-btn-perigo" id="rt-sel-excluir" ${n ? '' : 'disabled'}>
                <i data-lucide="trash-2"></i> <span>${n > 1 ? `Excluir ${n}` : 'Excluir'}</span>
            </button>
        </div>`;
};

/* O subtítulo do cartão da conversa. Diz o que está PENDENTE antes de dizer o
   tamanho: "4 respostas" é estatística; "1 fala esperando a equipe" é tarefa. */
const resumoDoFio = (fio, historico) => {
    const partes = [];
    if (fio.pendentes)   partes.push(`${fio.pendentes} esperando a equipe`);
    if (fio.respondidas) partes.push(`${fio.respondidas} esperando o cliente`);
    partes.push(`${historico.length} registro${historico.length > 1 ? 's' : ''} no total`);
    return partes.join(' · ');
};

/* ── Quem está respondendo ───────────────────────────────────────────────
   Fica no navegador de quem usa, como o nome do cliente do outro lado. É
   conveniência, não dado do sistema: se sumir, o campo volta a vir vazio. A
   lista de sugestões vem da cartela do Gestor (lib/gestor.js). */
const CHAVE_AUTOR = '5k9_visualizador_autor';
const autorPadrao = () => {
    try { return localStorage.getItem(CHAVE_AUTOR) || ''; } catch { return ''; }
};
const guardarAutor = (nome) => {
    try { if (nome) localStorage.setItem(CHAVE_AUTOR, nome); } catch { /* sem localStorage */ }
};

/**
 * A mensagem de aviso, já escrita.
 *
 * Ela diz O QUE mudou, e não só "atualizamos o roteiro". Um aviso genérico
 * obriga o cliente a reler o roteiro inteiro procurando a diferença — que é
 * exatamente o trabalho que ele delegou ao pedir o ajuste.
 */
const mensagemDeAviso = (c, cliente, fio, link) => {
    const nome = (cliente?.contato || '').split(/[(,]/)[0].trim();
    const n = fio.respondidas;
    return [
        nome ? `Oi, ${nome}!` : 'Oi!',
        '',
        n === 1
            ? `Mexemos no ponto que você comentou em "${c.titulo}".`
            : `Mexemos nos ${n} pontos que você comentou em "${c.titulo}".`,
        'Dá uma olhada e, se ficou bom, é só confirmar por lá:',
        '',
        link,
        '',
        'Qualquer coisa, comenta direto na fala que a gente ajusta de novo.',
    ].join('\n');
};

/* Os estilos dos painéis vão num <style> próprio, injetado uma vez. Não podem
   entrar no ESTILOS da página: o painel mora no <body>, fora do #app que o
   roteador reescreve, e o bloco da página some junto com ela. */
function injectEstilosPainel() {
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

        /* ── Responder e avisar ───────────────────────────────────────────── */
        .rt-resp, .rt-aviso-cli, .rt-hist { display: flex; flex-direction: column; gap: var(--space-3); }
        .rt-resp__campo {
            height: auto; padding: var(--space-3) var(--space-4);
            resize: vertical; line-height: var(--leading-body);
            font-family: var(--font-sans);
        }
        /* O aviso mais importante do painel: o que se escreve aqui sai no
           celular do cliente. Vale o destaque — a mesma tabela alimenta as
           duas telas, e uma nota interna digitada por engano vai junto. */
        .rt-resp__aviso {
            display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            background: var(--accent-muted); color: var(--accent);
            font-size: var(--text-sm); font-weight: 500; line-height: var(--leading-body);
        }
        .rt-resp__aviso i, .rt-resp__aviso svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }
        .rt-resp__dica { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }
        .rt-resp__dica strong { color: var(--text-secondary); }
        .rt-resp__texto {
            display: flex; flex-direction: column; gap: var(--space-2);
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.06); border: 1px solid var(--glass-border);
        }
        .rt-resp__texto p { margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body); }
        .rt-resp__erro {
            margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
            background: var(--danger-muted); font-size: var(--text-xs); color: var(--danger);
        }
        .rt-resp__erro[hidden] { display: none; }
        .rt-resp__perigo {
            display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            background: var(--danger-muted); color: var(--danger);
            font-size: var(--text-sm); line-height: var(--leading-body);
        }
        .rt-resp__perigo i, .rt-resp__perigo svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }
        .rt-resp__perigo strong { color: var(--danger); }

        /* ── Histórico ────────────────────────────────────────────────────
           Antes e depois EMPILHADOS, não lado a lado. Duas colunas de texto
           corrido no painel dariam trinta caracteres por linha, e comparar
           duas frases quebradas em seis linhas cada é mais difícil que ler as
           duas inteiras uma sob a outra. */
        .rt-hist__estado {
            display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start;
            padding: 5px var(--space-3); border-radius: var(--radius-pill);
            font-size: var(--text-xs); font-weight: 600;
        }
        .rt-hist__estado i, .rt-hist__estado svg { width: 13px; height: 13px; }
        .rt-hist__estado--atencao { background: var(--warning-muted); color: var(--warning); }
        .rt-hist__estado--info    { background: var(--accent-muted);  color: var(--accent); }
        .rt-hist__estado--ok      { background: var(--success-muted); color: var(--success); }

        .rt-hist__diff { display: flex; flex-direction: column; gap: var(--space-2); }
        .rt-hist__lado { display: flex; flex-direction: column; gap: var(--space-2); }
        .rt-hist__seta { width: 16px; height: 16px; color: var(--text-disabled); align-self: center; }
        .rt-hist__antes, .rt-hist__depois {
            margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            font-size: var(--text-sm); line-height: var(--leading-body);
        }
        .rt-hist__antes {
            background: var(--surface-3); color: var(--text-tertiary);
            text-decoration: line-through; text-decoration-color: var(--text-disabled);
        }
        .rt-hist__depois { background: var(--success-muted); color: var(--text-primary); }
        .rt-hist__igual { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }

        .rt-hist__linha { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--space-4); }
        .rt-hist__item { display: flex; gap: var(--space-3); }
        .rt-hist__item > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .rt-hist__marca {
            display: flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: 26px; height: 26px; border-radius: 50%;
        }
        .rt-hist__marca i, .rt-hist__marca svg { width: 13px; height: 13px; }
        .rt-hist__marca--atencao { background: var(--warning-muted); color: var(--warning); }
        .rt-hist__marca--info    { background: var(--accent-muted);  color: var(--accent); }
        .rt-hist__marca--ok      { background: var(--success-muted); color: var(--success); }
        .rt-hist__cabeca {
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
            font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary);
        }
        .rt-hist__data { color: var(--text-tertiary); font-weight: 400; }
        .rt-hist__texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body); }
        .rt-hist__trecho {
            margin: 0; font-size: var(--text-xs); color: var(--text-tertiary);
            font-style: italic; line-height: var(--leading-body);
            padding-left: var(--space-3); border-left: 2px solid var(--border-subtle);
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
/* Botão e menu colados, como um controle só: são a mesma decisão em dois
   níveis de precisão. */
.rt-esteira { display: inline-flex; }
.rt-esteira .ds-btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.rt-esteira__mais {
    border-top-left-radius: 0; border-bottom-left-radius: 0;
    padding: 0 var(--space-2); min-width: 0;
    box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.25);
}

.rt-chips { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
/* flex-wrap: com quatro botões, o último era cortado pela borda numa tela de
   trabalho estreita — o mesmo defeito que já custou a barra do celular. */
.rt-acoes-topo, .rt-status-troca { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

/* Excluir o roteiro fica ao lado de "Copiar texto" e precisa não se parecer
   com ele. Vermelho só na letra: um botão sólido vermelho no cabeçalho pesaria
   mais que a ação mais usada da tela. */
.rt-perigo { color: var(--danger); }
.rt-perigo:hover { background: var(--danger-muted); color: var(--danger); }
.ds-btn.is-ativo { background: var(--accent-muted); color: var(--accent); }

/* O DS não tem botão destrutivo sólido — tem primary, solid e ghost. Em vez de
   inventar um ds-btn--danger que o estúdio não desenhou, e que a próxima
   atualização de ds/ sobrescreveria, a variante mora aqui, no escopo desta
   página, com o nome do sistema e não o do DS.

   (Sem crase neste comentário: ele vive DENTRO de um template literal, e uma
   crase aqui fecha a string no meio do CSS. O erro que sai disso é
   "invalid left-hand side expression in postfix operation", apontando para os
   dois hifens de um nome de token — nada que leve a pensar em aspas.) */
.rt-btn-perigo { background: var(--danger); color: var(--surface-1); border-color: transparent; }
.rt-btn-perigo:hover { background: var(--danger); filter: brightness(1.1); }
.rt-btn-perigo[disabled] { opacity: 0.45; filter: none; transform: none; cursor: default; }

/* ── Seleção múltipla ────────────────────────────────────────────────── */
.rt-selecao {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--accent-border); border-radius: var(--radius-md);
    background: var(--accent-muted);
}
.rt-selecao__conta {
    flex: 1; min-width: 140px;
    font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);
}
.rt-marca { display: flex; align-items: center; }
/* 20px e não o tamanho padrão: em toque, caixa de seleção pequena é onde
   nasce o "marquei e não marcou". */
.rt-marca input { width: 20px; height: 20px; accent-color: var(--accent); cursor: pointer; }
.rt-bloco--marcada { border-color: var(--accent); background: var(--accent-muted); }
/* Em modo de seleção o clique é para marcar. Os campos continuam editáveis —
   travá-los seria impedir a correção que a pessoa acabou de ver ao reler. */
.rt-blocos--selecionando .rt-bloco { cursor: default; }

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

/* ── A conversa dentro do bloco ──────────────────────────────────────────
   Mora DENTRO do bloco, não numa lista à parte. É a diferença entre "o cliente
   reclamou de alguma coisa" e "o cliente reclamou disto aqui" — e é o motivo
   inteiro de o comentário por fala existir.

   A COR DA BORDA É O ESTADO. De quem é a vez se lê de longe, rolando a página,
   sem abrir nada: amarelo é dívida nossa, roxo é bola com o cliente, verde é
   assunto encerrado. */
.rt-bloco--pendente   { border-color: color-mix(in oklch, var(--warning) 45%, transparent); }
.rt-bloco--respondido { border-color: color-mix(in oklch, var(--accent) 45%, transparent); }
.rt-bloco--fechado    { border-color: color-mix(in oklch, var(--success) 35%, transparent); }

/* O selo de EDITADO é sobre o texto; o de estado é sobre a conversa. Um bloco
   pode ter sido reescrito e continuar pendente — são perguntas diferentes. */
.rt-selo {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 8px; border-radius: var(--radius-pill);
    font-size: 10px; font-weight: 700; letter-spacing: var(--tracking-wide);
    text-transform: uppercase; white-space: nowrap;
}
.rt-selo i, .rt-selo svg { width: 11px; height: 11px; }
.rt-selo--edit    { background: var(--surface-3);     color: var(--text-secondary); }
.rt-selo--atencao { background: var(--warning-muted); color: var(--warning); }
.rt-selo--info    { background: var(--accent-muted);  color: var(--accent); }
.rt-selo--ok      { background: var(--success-muted); color: var(--success); }

.rt-fio-caixa { margin-top: var(--space-2); }
.rt-fio__resumo {
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer; list-style: none;
    font-size: var(--text-xs);
}
.rt-fio__resumo::-webkit-details-marker { display: none; }
.rt-fio__resumo:hover { background: var(--surface-3); }
.rt-fio__seta {
    width: 13px; height: 13px; flex-shrink: 0; color: var(--text-tertiary);
    transition: transform var(--dur-fast);
}
.rt-fio-caixa[open] .rt-fio__seta { transform: rotate(90deg); }
.rt-fio__rotulo { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; }
.rt-fio__rotulo i, .rt-fio__rotulo svg { width: 13px; height: 13px; }
.rt-fio__rotulo--atencao { color: var(--warning); }
.rt-fio__rotulo--info    { color: var(--accent); }
.rt-fio__rotulo--ok      { color: var(--success); }
.rt-fio__quantas { margin-left: auto; color: var(--text-tertiary); }

.rt-fio { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.rt-fala {
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm);
}
/* O lado de quem falou se lê pelo recuo, antes de qualquer texto: o cliente
   encosta à esquerda, a equipe entra deslocada. É a leitura de qualquer
   conversa, e dispensa procurar o nome. */
.rt-fala--cliente { background: color-mix(in oklch, var(--warning) 10%, transparent); }
.rt-fala--equipe  { background: var(--surface-3); margin-left: var(--space-5); }
.rt-fala__cabeca {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary);
}
.rt-fala__cabeca i, .rt-fala__cabeca svg { width: 13px; height: 13px; }
.rt-fala--atencao .rt-fala__cabeca { color: var(--warning); }
.rt-fala--info .rt-fala__cabeca    { color: var(--accent); }
.rt-fala--ok .rt-fala__cabeca      { color: var(--success); }
.rt-fala__data { margin-left: auto; font-weight: 400; color: var(--text-tertiary); }
.rt-fala__texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body); }
.rt-fala__antes {
    display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
    font-size: var(--text-xs); color: var(--text-tertiary); font-style: italic; line-height: var(--leading-body);
}
.rt-fala__antes i, .rt-fala__antes svg { width: 12px; height: 12px; flex-shrink: 0; margin-top: 2px; }

/* As ações ficam no fim do fio, não no menu ⋯: responder é a continuação
   natural de ler, e esconder isso atrás de um menu é o que fazia a equipe ler
   o comentário e não ter o que fazer com ele. */
.rt-fio__acoes { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

/* O pisca de quem chegou aqui clicando num comentário. Só rolar não basta:
   a tela tem sete blocos parecidos, e sem o destaque leva meio segundo para
   saber em qual deles a rolagem parou. */
@keyframes rt-piscar {
    0%, 100% { box-shadow: 0 0 0 0 transparent; }
    25%      { box-shadow: 0 0 0 3px var(--accent); }
    60%      { box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 30%, transparent); }
}
.rt-bloco--piscando { animation: rt-piscar 1.6s ease-out; }
@media (prefers-reduced-motion: reduce) {
    .rt-bloco--piscando { animation: none; box-shadow: 0 0 0 3px var(--accent); }
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

/* ── A conversa, em resumo ───────────────────────────────────────────────
   O item que fala de uma fala é um BOTÃO e leva até ela. Ler "a abertura ficou
   agressiva" aqui e ter de caçar qual bloco é a abertura era o trabalho que
   este clique elimina. */
.rt-retornos { display: flex; flex-direction: column; gap: var(--space-2); }
.rt-retorno {
    display: block; width: 100%; text-align: left;
    padding: var(--space-4); border: 1px solid transparent; border-radius: var(--radius-md);
    background: var(--surface-3); font-family: var(--font-sans);
}
.rt-retorno--ir { cursor: pointer; transition: border-color var(--dur-fast), background-color var(--dur-fast); }
.rt-retorno--ir:hover { border-color: var(--accent-border); background: var(--surface-2); }
.rt-retorno--ir:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.rt-retorno__cabeca {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary);
}
.rt-retorno__cabeca i, .rt-retorno__cabeca svg { width: 13px; height: 13px; }
.rt-retorno--ok      .rt-retorno__cabeca { color: var(--success); }
.rt-retorno--atencao .rt-retorno__cabeca { color: var(--warning); }
.rt-retorno--info    .rt-retorno__cabeca { color: var(--accent); }
.rt-retorno__data { margin-left: auto; font-weight: 400; }
.rt-retorno__texto { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.rt-retorno__ir {
    display: inline-flex; align-items: center; gap: 5px; margin-top: var(--space-2);
    font-size: var(--text-xs); font-weight: 600; color: var(--accent);
}
.rt-retorno__ir i, .rt-retorno__ir svg { width: 12px; height: 12px; }

@media (max-width: 720px) {
    .rt-adicionar__tipos { gap: var(--space-1); }
    .rt-tipo { height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); }
}
</style>
`;
