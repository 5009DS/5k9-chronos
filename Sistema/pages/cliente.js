import { store } from '../store.js';
import { theme } from '../theme.js';
import { navegar } from '../lib/rotas.js';
import { usarDiretorio, objetivo, nomeFase, fase } from '../lib/diretorio.js';
import { mesEmSemanas, cobertura, porData, proximo, retornosDe } from '../lib/cronograma.js';
import { chipFase, cartaoLeitura, explicacaoObjetivo, roteiroHTML, vazioHTML } from '../lib/pecas.js';
import { ordenar, duracaoTotal } from '../lib/roteiro.js';
import {
    esc, mesExtenso, somarMeses, chaveMes, semanaCurta, semanaAtual,
    nomeDiaCurto, diaCurto, quandoRelativo, dataBR, hoje,
} from '../lib/formato.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { toast } from '../components/toast.js';
import { conversas, estadoMeta, ato, daEquipe, novidadesPara } from '../lib/conversa.js';
import { iniciarTour, tourVisto, marcarTourVisto } from '../lib/tour.js';

/* ═══════════════════════════════════════════════════════════════════════════
   A TELA DO CLIENTE — /c/<token> e /c/<token>/<conteúdo>

   A única tela deste sistema que gente de fora abre, quase sempre no celular,
   quase sempre a partir de um link no WhatsApp. Três decisões vêm daí:

   1. NASCE PEQUENA. O CSS desta página é escrito em `min-width`: o desenho
      base é o de celular e ele CRESCE. As outras telas do estúdio fazem o
      contrário, e está certo — lá a mesa é o lugar de trabalho. Aqui não.

   2. NÃO PARECE UM SISTEMA. Sem topnav, sem trocador de ferramenta, sem
      avatar, sem link para o painel. Um cabeçalho com a marca, o nome do
      cliente e o que ele veio ver. Nada sugere que existe um painel por trás
      para explorar, porque não existe — para ele.

   3. EXPLICA SEM SER PERGUNTADA. Cada conteúdo mostra a fase, o objetivo e,
      cruzando os dois, a leitura estratégica que sai do diretório. É a razão
      de a ferramenta existir: o cliente não recebe uma lista de posts, recebe
      um plano que se explica.

   A aprovação acontece aqui. O botão fica numa barra fixa no rodapé, acima da
   área de gestos do iPhone (safe-area) — se ela ficasse no fim do roteiro,
   aprovar exigiria rolar um texto inteiro que a pessoa já leu.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderCliente = async (container, token, conteudoId) => {
    injectStyles();
    container.innerHTML = `<div class="cl-carregando">Carregando…</div>`;

    let visao;
    try {
        visao = await store.visualizacao(token);
    } catch (e) {
        console.error('[cliente] falha ao carregar:', e);
        return desenharAviso(container, 'wifi-off', 'Não conseguimos carregar agora',
            'Verifique a conexão e tente de novo. Se continuar, avise a gente.');
    }

    if (!visao || !visao.cliente) {
        /* Mesma tela para link inválido, expirado e cliente desativado. O
           motivo é de segurança e não de preguiça: distinguir "não existe" de
           "existe mas está desativado" transforma a tela num oráculo que
           confirma tokens válidos para quem estiver tentando adivinhar. */
        return desenharAviso(container, 'link-2-off', 'Este link não está disponível',
            'Ele pode ter sido substituído por um novo. Peça o link atualizado para a equipe da 5K9.');
    }

    // O diretório vigente vem junto com o cronograma, numa ida só ao banco.
    if (visao.diretorio) usarDiretorio(visao.diretorio);

    if (conteudoId) return desenharConteudo(container, token, visao, conteudoId);
    return desenharCronograma(container, token, visao);
};

// ═══════════════════════════════════════════════════════════════════════════
// CRONOGRAMA
// ═══════════════════════════════════════════════════════════════════════════

/* O mês visitado sobrevive à ida e volta para um roteiro. Sem isso, quem
   estava olhando outubro e abriu um conteúdo voltava para o mês atual — e
   perdia o lugar sem entender por quê. */
let mesVisto = null;

const desenharCronograma = (container, token, visao) => {
    const { cliente, conteudos } = visao;

    /* O mês inicial é o do PRÓXIMO conteúdo, não o de hoje. No dia 28, o que
       interessa é o que vem — e um cronograma que abre vazio no fim do mês
       parece um sistema quebrado. */
    if (!mesVisto) mesVisto = chaveMes(proximo(conteudos)?.data || hoje());

    const desenhar = () => {
        const semanas = mesEmSemanas(conteudos, mesVisto);
        const doMes = conteudos.filter(c => chaveMes(c.data) === mesVisto);
        const aguardando = conteudos.filter(c => c.status === 'em_revisao').length;

        container.innerHTML = `
            <div class="cl">
                ${cabecalho(cliente)}

                <main class="cl-corpo">
                    ${aguardando ? `
                        <a class="cl-chamada" href="#semanas">
                            <i data-lucide="clock"></i>
                            <span><strong>${aguardando} conteúdo${aguardando > 1 ? 's' : ''}</strong>
                            ${aguardando > 1 ? 'esperam' : 'espera'} sua aprovação</span>
                        </a>` : ''}

                    <div class="cl-mes">
                        <button class="ds-icon-btn" id="cl-anterior" aria-label="Mês anterior">
                            <i data-lucide="chevron-left"></i>
                        </button>
                        <span class="cl-mes__rotulo">${esc(mesExtenso(mesVisto))}</span>
                        <button class="ds-icon-btn" id="cl-proximo" aria-label="Próximo mês">
                            <i data-lucide="chevron-right"></i>
                        </button>
                    </div>

                    <div class="cl-semanas" id="semanas">
                        ${doMes.length
                            ? semanas.map(s => semanaHTML(s, token)).join('')
                            : vazioHTML('calendar-off', 'Nada programado neste mês',
                                'Quando a equipe publicar o cronograma, ele aparece aqui.')}
                    </div>

                    ${legenda()}
                </main>
            </div>`;

        container.querySelector('#cl-anterior').addEventListener('click', () => {
            mesVisto = somarMeses(mesVisto, -1); desenhar();
        });
        container.querySelector('#cl-proximo').addEventListener('click', () => {
            mesVisto = somarMeses(mesVisto, 1); desenhar();
        });
        container.querySelector('#cl-tour')?.addEventListener('click', () => abrirTour(container, token, visao));
        ligarTema(container);
        if (window.lucide) lucide.createIcons();
    };

    desenhar();

    /* Na primeira visita, o tour começa sozinho. Depois disso, só pelo link no
       rodapé — nada abre por cima de quem já sabe usar a tela. */
    if (!tourVisto(token)) abrirTour(container, token, visao);
};

/* ═══════════════════════════════════════════════════════════════════════════
   O TOUR

   `tourRodando` existe porque o tour NAVEGA: ele redesenha a tela do cliente
   para levar a pessoa até um roteiro, e cada redesenho volta a passar por
   aqui. Sem a trava, o passo que abre um conteúdo dispararia um segundo tour
   por cima do primeiro.

   O exemplo é escolhido, não sorteado: um conteúdo que tenha roteiro — sem
   blocos, metade dos passos não teria o que apontar — e de preferência um que
   esteja esperando resposta, para o passo do "Aprovar" mostrar o botão no
   estado em que a pessoa vai encontrá-lo.

   Sem nenhum conteúdo com roteiro, o tour não roda e não fica marcado como
   visto: ele espera a próxima visita, quando houver o que mostrar.
   ═══════════════════════════════════════════════════════════════════════════ */
let tourRodando = false;

const abrirTour = (container, token, visao) => {
    if (tourRodando) return;

    const comRoteiro = (visao.conteudos || []).filter(c =>
        (visao.blocos || []).some(b => b.conteudo_id === c.id));
    /* Sem exemplo o tour AINDA roda, só sem os passos de dentro do roteiro
       (lib/tour.js corta a lista). Antes ele desistia em silêncio, e o botão
       "Ver o tour desta tela" não fazia nada — que é o mesmo que estar
       quebrado, para quem está do outro lado. */
    const exemplo = comRoteiro.find(c => c.status === 'em_revisao')
                 || comRoteiro.find(c => c.status === 'ajuste')
                 || comRoteiro[0]
                 || null;

    tourRodando = true;
    try {
    iniciarTour({
        cliente: visao.cliente,
        conteudoId: exemplo?.id || null,
        /* Navega pelo ROTEADOR, e não chamando renderCliente direto. Desenhar
           na mão deixaria o endereço mostrando o cronograma enquanto a tela
           mostra um roteiro — e quem fechasse o tour ali e recarregasse a
           página cairia noutro lugar. O caminho tem de acompanhar a tela. */
        irPara: async (conteudoId) => {
            navegar(conteudoId ? `/c/${token}/${conteudoId}` : `/c/${token}`);
            // Um quadro para o desenho assentar antes de o tour medir o alvo.
            await new Promise(r => requestAnimationFrame(() => setTimeout(r, 120)));
        },
        aoFim: () => {
            tourRodando = false;
            marcarTourVisto(token);
        },
    });
    } catch (e) {
        /* Se o tour quebrar, ele não pode levar a tela junto NEM sumir calado:
           a pessoa apertou um botão e precisa saber que ele foi apertado. */
        console.error('[cliente] falha ao abrir o tour:', e);
        tourRodando = false;
        toast('Não consegui abrir o tour agora. O cronograma continua funcionando normalmente.');
    }
};

const semanaHTML = ({ segunda, conteudos }, token) => {
    const atual = segunda === semanaAtual();
    const cob = cobertura(conteudos);

    return `
        <section class="vz-semana ${atual ? 'vz-semana--atual' : ''}">
            <header class="vz-semana__cabeca">
                <h2 class="vz-semana__titulo">
                    ${atual ? 'Esta semana · ' : ''}${esc(semanaCurta(segunda))}
                </h2>
                <div class="vz-cobertura" role="img"
                     aria-label="${['fundo', 'meio', 'topo'].filter(f => cob[f]).length} de 3 fases programadas">
                    ${['fundo', 'meio', 'topo'].map(f => `
                        <span class="vz-cobertura__casa vz-cobertura__casa--${f} ${cob[f] ? 'is-cheia' : ''}"></span>
                    `).join('')}
                </div>
            </header>

            ${conteudos.length
                ? porData(conteudos).map(c => cartaoConteudo(c, token)).join('')
                : `<p class="cl-semana-vazia">Sem publicações programadas nesta semana.</p>`}
        </section>`;
};

const cartaoConteudo = (c, token) => {
    const o = objetivo(c.objetivo);
    return `
        <a class="vz-conteudo" href="/c/${esc(token)}/${esc(c.id)}">
            <span class="vz-fita vz-fita--${esc(c.fase || '')}"></span>
            <div class="vz-conteudo__corpo">
                <div class="vz-conteudo__topo">
                    <span class="vz-conteudo__dia">${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}</span>
                    ${chipFase(c.fase, { curto: true })}
                </div>
                <h3 class="vz-conteudo__titulo">${esc(c.titulo)}</h3>
                ${c.tema ? `<p class="vz-conteudo__previa">${esc(c.tema)}</p>` : ''}
                <div class="vz-conteudo__pe">
                    ${o ? `<span>${esc(o.nome)}</span>` : ''}
                    ${c.formato ? `<span>${esc(c.formato)}</span>` : ''}
                    ${estadoCurto(c)}
                </div>
            </div>
            <i class="cl-seta" data-lucide="chevron-right"></i>
        </a>`;
};

/* O que o CLIENTE precisa saber sobre o estado — não o estado interno cru.
   "Em revisão" é linguagem de quem produz; para quem recebe, a informação é
   "esperando você". */
const estadoCurto = (c) => {
    if (c.status === 'aprovado')  return `<span class="cl-estado cl-estado--ok">aprovado por você</span>`;
    if (c.status === 'ajuste')    return `<span class="cl-estado cl-estado--ajuste">ajuste pedido</span>`;
    if (c.status === 'publicado') return `<span class="cl-estado">publicado</span>`;
    if (c.status === 'em_revisao') return `<span class="cl-estado cl-estado--espera">aguardando você</span>`;
    return '';
};

// ═══════════════════════════════════════════════════════════════════════════
// ROTEIRO
// ═══════════════════════════════════════════════════════════════════════════

const desenharConteudo = (container, token, visao, conteudoId) => {
    const { cliente, conteudos, blocos, retornos } = visao;
    const c = conteudos.find(x => x.id === conteudoId);

    if (!c) {
        return desenharAviso(container, 'file-question', 'Conteúdo não encontrado',
            'Ele pode ter saído do cronograma. Volte e veja o que está programado.',
            `<a href="/c/${esc(token)}" class="ds-btn ds-btn--primary">Ver o cronograma</a>`);
    }

    const meus = ordenar(blocos.filter(b => b.conteudo_id === conteudoId));
    const o = objetivo(c.objetivo);
    const f = fase(c.fase);
    const historico = retornosDe(retornos, c.id);
    const podeResponder = ['em_revisao', 'aprovado', 'ajuste'].includes(c.status);
    /* Lido ANTES de marcar a visita: marcar primeiro apagaria a novidade no
       instante em que ela deveria aparecer. */
    const novidades = novidadesPara(historico, ultimaVisita(c.id));

    container.innerHTML = `
        <div class="cl cl--roteiro">
            <header class="cl-topo-roteiro">
                <a class="cl-voltar" href="/c/${esc(token)}">
                    <i data-lucide="arrow-left"></i> Cronograma
                </a>
                <span class="cl-topo-cliente">${esc(cliente.nome)}</span>
            </header>

            <main class="cl-corpo">
                <section class="cl-ficha">
                    <div class="cl-ficha__chips">
                        ${chipFase(c.fase)}
                        ${o ? `<span class="vz-status"><i data-lucide="${esc(o.icone || 'compass')}"></i>${esc(o.nome)}</span>` : ''}
                    </div>
                    <h1 class="cl-titulo">${esc(c.titulo)}</h1>
                    <p class="cl-quando">
                        ${esc(dataBR(c.data))} · ${esc(quandoRelativo(c.data))}
                        ${c.formato ? ` · ${esc(c.formato)}` : ''}
                        ${meus.length ? ` · ${esc(duracaoTotal(meus))} de fala (estimado)` : ''}
                    </p>
                    ${c.tema ? `<p class="cl-tema">${esc(c.tema)}</p>` : ''}
                </section>

                <!-- ══ O que o sistema explica sozinho ══════════════════ -->
                <section class="cl-estrategia">
                    ${c.intencao ? `
                        <div class="vz-leitura">
                            <div class="vz-leitura__cabeca"><i data-lucide="crosshair"></i> O que este conteúdo precisa fazer</div>
                            <p class="vz-leitura__texto">${esc(c.intencao)}</p>
                        </div>` : ''}
                    ${cartaoLeitura(c.fase, c.objetivo)}
                    ${explicacaoObjetivo(c.fase, c.objetivo)}
                    ${f ? `
                        <details class="vz-saiba">
                            <summary><i data-lucide="filter"></i> Por que este conteúdo é ${esc(nomeFase(c.fase).toLowerCase())}</summary>
                            <div class="vz-saiba__corpo">
                                <p class="vz-nota">${esc(f.nome)} fala com quem tem consciência ${esc(f.nivel_consciencia_publico)}.
                                   O objetivo da fase é ${esc(f.objetivo_principal)}.</p>
                                <!-- "costuma ficar" e não "fica": esta é uma regra geral da
                                     fase, e o conteúdo específico pode ter sido remanejado
                                     para outro dia. Afirmar o dia aqui contradiria a data
                                     que está impressa três linhas acima. -->
                                <p class="vz-nota"><strong>Na semana,</strong> essa fase costuma ficar no
                                   ${esc(f.posicao_cronograma)} — é o Funil Invertido: a semana começa
                                   pedindo ação e termina atraindo público novo.</p>
                                <p class="vz-nota"><strong>Tom:</strong> ${esc((f.tom || []).join(', '))}.</p>
                            </div>
                        </details>` : ''}
                    ${conformidadeHTML(c)}
                </section>

                <!-- ══ O roteiro ═══════════════════════════════════════ -->
                <section class="cl-roteiro">
                    <h2 class="cl-secao-titulo">Roteiro</h2>
                    ${novidades.length ? `
                        <!-- Some sozinho na próxima visita: é um aviso de
                             mudança, não um estado permanente da tela. -->
                        <p class="cl-novidade">
                            <i data-lucide="sparkles"></i>
                            A equipe mexeu em ${novidades.length === 1 ? 'um ponto' : `${novidades.length} pontos`}
                            desde a sua última visita. ${novidades.length === 1 ? 'Ele está marcado' : 'Eles estão marcados'} abaixo.
                        </p>` : ''}
                    ${meus.length && podeResponder ? `
                        <p class="cl-roteiro__dica">
                            <i data-lucide="hand-pointer"></i>
                            Toque em uma fala para comentar só nela.
                        </p>` : ''}
                    ${meus.length
                        ? roteiroHTML(meus)
                        : vazioHTML('file-text', 'Roteiro ainda não escrito',
                            'A equipe está preparando. Você recebe um aviso quando estiver pronto.')}
                </section>

                <!-- Só o que é do conteúdo INTEIRO. O que foi dito sobre uma
                     fala específica já aparece grudado nela, e repetir aqui
                     faria o cliente achar que mandou duas vezes. -->
                ${historico.filter(r => !r.bloco_id).length
                    ? historicoHTML(historico.filter(r => !r.bloco_id)) : ''}

                <div class="cl-espaco-barra"></div>
            </main>

            ${podeResponder ? barraAcao(c) : ''}
        </div>`;

    if (podeResponder) {
        ligarAcoes(container, token, c);
        ligarFalas(container, token, c, meus, historico);
    }
    desenharConversas(container, token, c, meus, historico, novidades);
    if (window.lucide) lucide.createIcons();
    window.scrollTo(0, 0);
    marcarVisita(c.id);
};

/* ═══════════════════════════════════════════════════════════════════════════
   COMENTAR UMA FALA

   O pedido de ajuste do rodapé fala do conteúdo inteiro. Serve, e é insuficiente
   no caso mais comum: "a abertura ficou agressiva". A equipe recebia isso e
   abria um roteiro de nove blocos para descobrir qual era a abertura.

   Aqui o cliente TOCA na fala. Ela se acende, e o campo de comentário abre logo
   abaixo dela — não num painel que cobre a tela, porque o texto que ele está
   criticando precisa continuar visível enquanto ele escreve a crítica.

   ── UMA POR VEZ ───────────────────────────────────────────────────────────
   Só uma fala fica selecionada. Poder abrir cinco campos ao mesmo tempo
   convidaria a escrever cinco comentários e mandar nenhum: cada envio é um
   registro, e o cliente precisa ver cada um chegar.

   ── O QUE NÃO É CLICÁVEL ──────────────────────────────────────────────────
   Seção é divisória e orientação de gravação é instrução interna. Comentar
   "muda essa" numa divisória não diz nada a ninguém.
   ═══════════════════════════════════════════════════════════════════════════ */
function ligarFalas(container, token, conteudo, blocos, historico) {
    const comentaveis = new Set(
        blocos.filter(b => !['secao', 'nota'].includes(b.tipo)).map(b => b.id));

    let aberto = null;   // id do bloco com o campo aberto

    const fechar = () => {
        container.querySelectorAll('.cl-comentario').forEach(e => e.remove());
        container.querySelectorAll('.is-selecionada').forEach(e => e.classList.remove('is-selecionada'));
        aberto = null;
    };

    container.querySelectorAll('[data-bloco]').forEach(el => {
        const id = el.dataset.bloco;
        if (!comentaveis.has(id)) return;

        el.classList.add('cl-fala');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'Comentar nesta fala');

        const abrir = () => {
            if (aberto === id) { fechar(); return; }
            fechar();
            aberto = id;
            el.classList.add('is-selecionada');

            const bloco = blocos.find(b => b.id === id);
            const caixa = document.createElement('div');
            caixa.className = 'cl-comentario';
            caixa.innerHTML = `
                <label class="cl-comentario__rotulo" for="cl-cmt">O que muda nesta fala?</label>
                <textarea class="ds-input cl-comentario__campo" id="cl-cmt" rows="3"
                          placeholder="Ex.: essa palavra ficou dura demais, prefiro algo mais acolhedor."></textarea>
                <input class="ds-input cl-comentario__nome" id="cl-cmt-nome" type="text"
                       placeholder="Seu nome" autocomplete="name" value="${esc(lembrarNome() || '')}">
                <p class="cl-comentario__erro" id="cl-cmt-erro" hidden></p>
                <div class="cl-comentario__acoes">
                    <button class="ds-btn ds-btn--ghost ds-btn--sm" data-cmt-cancelar>Cancelar</button>
                    <button class="ds-btn ds-btn--primary ds-btn--sm" data-cmt-enviar>Enviar comentário</button>
                </div>`;
            el.insertAdjacentElement('afterend', caixa);
            if (window.lucide) lucide.createIcons();

            const campo = caixa.querySelector('#cl-cmt');
            campo.focus();
            /* Rola o conjunto para o meio da tela: com o teclado aberto no
               celular, o campo nasceria atrás dele — e a pessoa digitaria sem
               ver o que escreve nem a fala que está comentando.

               Com conferência: `behavior: 'smooth'` é ignorado em silêncio por
               alguns navegadores, sem erro no console. O salto seco é pior que
               a animação e melhor que o campo ficar atrás do teclado. */
            setTimeout(() => {
                const antes = window.scrollY;
                caixa.scrollIntoView({ block: 'center', behavior: 'smooth' });
                setTimeout(() => {
                    if (window.scrollY === antes) caixa.scrollIntoView({ block: 'center' });
                }, 350);
            }, 120);

            caixa.querySelector('[data-cmt-cancelar]').addEventListener('click', (e) => {
                e.stopPropagation();
                fechar();
            });

            caixa.querySelector('[data-cmt-enviar]').addEventListener('click', async (e) => {
                e.stopPropagation();
                const botao = e.target.closest('button');
                const texto = campo.value.trim();
                const erro = caixa.querySelector('#cl-cmt-erro');

                if (!texto) {
                    erro.textContent = 'Escreva o que precisa mudar nesta fala.';
                    erro.hidden = false;
                    campo.focus();
                    return;
                }
                botao.disabled = true;
                botao.textContent = 'Enviando…';
                try {
                    const nome = caixa.querySelector('#cl-cmt-nome').value.trim();
                    guardarNome(nome);
                    await store.registrarRetorno(token, {
                        conteudo_id: conteudo.id,
                        tipo: 'ajuste',
                        texto,
                        autor: nome || null,
                        bloco_id: id,
                        // O texto de HOJE. A equipe vai reescrever esta fala, e
                        // sem o trecho o comentário perde o que ele critica.
                        trecho: bloco?.texto || bloco?.titulo || null,
                    });
                    toast('Comentário enviado. A equipe já foi avisada.');
                    await renderCliente(container, token, conteudo.id);
                } catch (err) {
                    console.error('[cliente] falha ao comentar a fala:', err);
                    erro.textContent = err.message || 'Não foi possível enviar agora.';
                    erro.hidden = false;
                    botao.disabled = false;
                    botao.textContent = 'Enviar comentário';
                }
            });
        };

        el.addEventListener('click', abrir);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
   A CONVERSA, DO LADO DE QUEM PEDIU

   O comentário do cliente virava um bilhete que ele mandava e nunca mais via
   resposta. Aqui a fala carrega o fio inteiro: o que ele pediu, o que a equipe
   fez, e — quando a equipe já respondeu — o botão que encerra o assunto.

   ── O ESTADO É O MESMO DOS DOIS LADOS ─────────────────────────────────────
   Sai de lib/conversa.js, o mesmo módulo que a tela da equipe usa. As palavras
   é que mudam: "pendente" é linguagem de quem deve a resposta; para quem
   espera, a informação é "a equipe está vendo isto".

   ── "FICOU BOM" NÃO APROVA O CONTEÚDO ─────────────────────────────────────
   Encerra UM assunto. A aprovação da peça inteira continua sendo o botão do
   rodapé — quem gostou de uma frase corrigida não disse que o roteiro está
   pronto. A função do banco garante isso e não depende desta tela (ver
   db/migracao-conversa.sql).
   ═══════════════════════════════════════════════════════════════════════════ */
function desenharConversas(container, token, conteudo, blocos, historico, novidades) {
    const { porBloco } = conversas(historico);
    const novos = new Set(novidades.map(r => r.id));

    for (const [blocoId, conversa] of porBloco) {
        const el = container.querySelector(`[data-bloco="${blocoId}"]`);
        if (!el) continue;

        const bloco = blocos.find(b => b.id === blocoId);
        const atual = bloco?.texto || bloco?.titulo || '';
        const meta = estadoMeta(conversa.estado);
        const temNovidade = conversa.entradas.some(r => novos.has(r.id));

        el.classList.add('cl-fala--conversa', `cl-fala--${conversa.estado}`);

        el.insertAdjacentHTML('afterend', `
            <div class="cl-fio cl-fio--${esc(conversa.estado)} ${temNovidade ? 'cl-fio--novo' : ''}">
                <div class="cl-fio__estado">
                    <i data-lucide="${esc(meta.icone)}"></i>
                    ${esc(meta.cliente)}
                    ${temNovidade ? '<span class="cl-fio__novo">novo</span>' : ''}
                </div>

                ${conversa.entradas.map(r => {
                    const equipe = daEquipe(r);
                    /* O trecho só aparece quando a fala mudou desde então —
                       e aí ele é a única coisa que faz o comentário antigo
                       continuar fazendo sentido. */
                    const mudou = !equipe && r.trecho && r.trecho !== atual;
                    return `
                    <div class="cl-fio__item cl-fio__item--${equipe ? 'equipe' : 'voce'}">
                        <div class="cl-fio__quem">
                            ${equipe
                                ? `<i data-lucide="${esc(ato(r).icone)}"></i> ${esc(ato(r).rotulo)}`
                                : `<i data-lucide="message-circle"></i> Você${r.autor ? ` (${esc(r.autor)})` : ''}${r.tipo === 'aprovado' ? ' encerrou o assunto' : ' pediu'}`}
                            <span class="cl-fio__data">${esc(dataBR(String(r.criado_em).slice(0, 10)))}</span>
                        </div>
                        ${r.texto ? `<p class="cl-fio__texto">${esc(r.texto)}</p>` : ''}
                        ${mudou ? `<p class="cl-fio__antes">Era: “${esc(r.trecho)}”</p>` : ''}
                    </div>`;
                }).join('')}

                ${conversa.estado === 'respondido' ? `
                    <button class="ds-btn ds-btn--primary ds-btn--sm cl-fio__ok" data-ok-bloco="${esc(blocoId)}">
                        <i data-lucide="circle-check"></i> Ficou bom, pode encerrar
                    </button>` : ''}
            </div>`);
    }

    // ── Encerrar um assunto ─────────────────────────────────────────────
    container.querySelectorAll('[data-ok-bloco]').forEach(botao =>
        botao.addEventListener('click', async (e) => {
            e.stopPropagation();   // o clique não pode abrir o campo da fala
            const blocoId = botao.dataset.okBloco;
            const bloco = blocos.find(b => b.id === blocoId);
            botao.disabled = true;
            botao.textContent = 'Registrando…';
            try {
                await store.registrarRetorno(token, {
                    conteudo_id: conteudo.id,
                    tipo: 'aprovado',
                    texto: null,
                    autor: lembrarNome() || null,
                    bloco_id: blocoId,
                    trecho: bloco?.texto || bloco?.titulo || null,
                });
                toast('Assunto encerrado. Obrigado!');
                await renderCliente(container, token, conteudo.id);
            } catch (err) {
                console.error('[cliente] falha ao encerrar o assunto:', err);
                toast(err.message || 'Não foi possível registrar agora.');
                botao.disabled = false;
                botao.textContent = 'Ficou bom, pode encerrar';
            }
        }));
}

/* ── O que mudou desde a última visita ───────────────────────────────────
   O cliente pede o ajuste e volta dias depois. Sem marca, ele reabre um
   roteiro de nove blocos e procura a diferença — que é exatamente o trabalho
   que ele delegou ao pedir o ajuste.

   A data da última visita fica no NAVEGADOR dele, não no banco. Guardar no
   banco significaria gravar em cada abertura de link, transformando uma
   leitura numa escrita — e o dado só interessa àquele aparelho.

   Na primeira visita não marca nada (ver novidadesPara em lib/conversa.js):
   destacar tudo é a maneira mais rápida de ensinar que o destaque não
   significa nada. */
const CHAVE_VISITA = '5k9_visualizador_visto';

const ultimaVisita = (conteudoId) => {
    try { return localStorage.getItem(`${CHAVE_VISITA}_${conteudoId}`) || null; }
    catch { return null; }
};

const marcarVisita = (conteudoId) => {
    try { localStorage.setItem(`${CHAVE_VISITA}_${conteudoId}`, new Date().toISOString()); }
    catch { /* navegador sem localStorage: some a marca de novidade, nada mais */ }
};

/* A nota de conformidade que o CLIENTE vê é diferente da interna. Ele não
   precisa da instrução de redação ("evite promessa de resultado") — precisa
   saber que a peça passa por conferência antes de ir ao ar, que é o que
   responde à insegurança dele com a norma do CFM. */
const conformidadeHTML = (c) => {
    const f = fase(c.fase);
    const o = objetivo(c.objetivo);
    if (!f?.compliance_flag && !o?.compliance) return '';
    return `
        <div class="vz-leitura vz-leitura--atencao">
            <div class="vz-leitura__cabeca"><i data-lucide="scale"></i> Conformidade</div>
            <p class="vz-leitura__texto">
                Este formato é sensível à Resolução CFM 2.336/2023${o?.compliance ? ' (uso de depoimento e resultado)' : ''}.
                ${c.revisado
                    ? 'A revisão de conformidade já foi feita.'
                    : 'Ele passa por conferência de conformidade antes de ser publicado.'}
            </p>
        </div>`;
};

/* A conversa sobre o conteúdo INTEIRO. O que foi dito sobre uma fala aparece
   grudado nela — repetir aqui faria o cliente achar que mandou duas vezes.
   A resposta da equipe entra na mesma lista: é o mesmo assunto, e separar em
   "suas respostas" e "respostas da equipe" quebraria a ordem do diálogo. */
const historicoHTML = (historico) => `
    <section class="cl-historico">
        <h2 class="cl-secao-titulo">Esta conversa</h2>
        ${historico.map(r => {
            const equipe = daEquipe(r);
            const a = ato(r);
            return `
            <div class="cl-retorno cl-retorno--${esc(a.tom)} ${equipe ? 'cl-retorno--equipe' : ''}">
                <div class="cl-retorno__cabeca">
                    <i data-lucide="${esc(a.icone)}"></i>
                    ${equipe
                        ? esc(a.rotulo)
                        : `${r.tipo === 'aprovado' ? 'Você aprovou' : 'Você pediu ajuste'}${r.autor ? ` (${esc(r.autor)})` : ''}`}
                    <span class="cl-retorno__data">${esc(dataBR(r.criado_em))}</span>
                </div>
                ${r.texto ? `<p class="cl-retorno__texto">${esc(r.texto)}</p>` : ''}
            </div>`;
        }).join('')}
    </section>`;

const barraAcao = (c) => `
    <div class="cl-barra">
        <div class="cl-barra__estado">
            ${c.status === 'aprovado' ? '<i data-lucide="circle-check"></i> Você aprovou'
              : c.status === 'ajuste' ? '<i data-lucide="message-circle"></i> Ajuste pedido'
              : '<i data-lucide="clock"></i> Aguardando você'}
        </div>
        <div class="cl-barra__botoes">
            <button class="ds-btn ds-btn--ghost" id="cl-ajuste">Pedir ajuste</button>
            <button class="ds-btn ds-btn--primary" id="cl-aprovar">
                ${c.status === 'aprovado' ? 'Aprovado' : 'Aprovar'}
            </button>
        </div>
    </div>`;

function ligarAcoes(container, token, c) {
    const aprovar = container.querySelector('#cl-aprovar');
    const ajustar = container.querySelector('#cl-ajuste');

    const enviar = async (tipo, texto, autor) => {
        await store.registrarRetorno(token, {
            conteudo_id: c.id, tipo,
            // Vazio vira null, dos dois lados. Sem isso o adaptador local
            // grava '' e a tela mostra "Aprovado por " com o nome faltando,
            // enquanto o remoto (que usa nullif) grava null e mostra certo —
            // dois comportamentos para o mesmo clique.
            texto: texto || null,
            autor: autor || null,
        });
        // Recarrega a rota atual em vez de remendar o DOM: o retorno muda o
        // status, a barra, o histórico e o cartão no cronograma. Redesenhar
        // com o dado novo é mais curto que sincronizar quatro pedaços.
        const caminho = window.location.pathname;
        await renderCliente(container, token, caminho.split('/')[3] || null);
    };

    aprovar.addEventListener('click', async () => {
        if (c.status === 'aprovado') return;
        aprovar.disabled = true;
        aprovar.textContent = 'Aprovando…';
        try {
            await enviar('aprovado', null, lembrarNome());
            toast('Aprovado. A equipe já foi avisada.');
        } catch (e) {
            console.error('[cliente] falha ao aprovar:', e);
            toast(e.message || 'Não foi possível registrar agora.');
            aprovar.disabled = false;
            aprovar.textContent = 'Aprovar';
        }
    });

    ajustar.addEventListener('click', () => {
        openDrawer({
            title: 'Pedir ajuste',
            subtitle: c.titulo,
            body: `
                <div class="cl-form">
                    <label class="cl-form__rotulo" for="cl-texto">O que precisa mudar?</label>
                    <textarea class="ds-input cl-form__area" id="cl-texto" rows="5"
                              placeholder="Ex.: trocar a abertura, o exemplo do segundo bloco não combina com a clínica…"></textarea>
                    <label class="cl-form__rotulo" for="cl-autor">Seu nome</label>
                    <input class="ds-input" id="cl-autor" type="text" placeholder="Para a equipe saber com quem falar"
                           value="${esc(lembrarNome() || '')}" autocomplete="name">
                    <p class="cl-form__dica">A equipe recebe o pedido junto com o roteiro. Você pode pedir ajuste quantas vezes precisar.</p>
                    <p class="cl-form__erro" id="cl-erro" hidden></p>
                </div>`,
            footer: `
                <span style="flex:1"></span>
                <button class="ds-btn ds-btn--ghost" id="cl-cancelar">Cancelar</button>
                <button class="ds-btn ds-btn--primary" id="cl-enviar">Enviar pedido</button>`,
            onMount: (painel) => {
                const erro = painel.querySelector('#cl-erro');
                const botao = painel.querySelector('#cl-enviar');
                painel.querySelector('#cl-cancelar').addEventListener('click', closeDrawer);

                botao.addEventListener('click', async () => {
                    const texto = painel.querySelector('#cl-texto').value.trim();
                    const autor = painel.querySelector('#cl-autor').value.trim();
                    if (!texto) {
                        erro.textContent = 'Escreva o que precisa mudar — sem isso a equipe não sabe por onde começar.';
                        erro.hidden = false;
                        painel.querySelector('#cl-texto').focus();
                        return;
                    }
                    botao.disabled = true;
                    botao.textContent = 'Enviando…';
                    try {
                        guardarNome(autor);
                        closeDrawer();
                        await enviar('ajuste', texto, autor);
                        toast('Pedido enviado. A equipe já foi avisada.');
                    } catch (e) {
                        console.error('[cliente] falha ao pedir ajuste:', e);
                        toast(e.message || 'Não foi possível enviar agora.');
                    }
                });
            },
        });
    });
}

/* O nome de quem responde fica no navegador do cliente, não no banco. Digitar
   o próprio nome a cada aprovação é o tipo de atrito que faz a pessoa parar
   de usar a ferramenta e voltar para o WhatsApp. */
const CHAVE_NOME = '5k9_visualizador_nome';
const lembrarNome = () => { try { return localStorage.getItem(CHAVE_NOME) || ''; } catch { return ''; } };
const guardarNome = (nome) => { try { if (nome) localStorage.setItem(CHAVE_NOME, nome); } catch {} };

// ═══════════════════════════════════════════════════════════════════════════
// Pedaços comuns
// ═══════════════════════════════════════════════════════════════════════════

const cabecalho = (cliente) => `
    <header class="cl-topo">
        <div class="cl-topo__marca">
            <img class="cl-logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                 alt="5K9 Studio" width="816" height="185">
            <button class="ds-icon-btn cl-tema" id="cl-tema" aria-label="Alternar tema">
                <i data-lucide="${theme.get() === 'dark' ? 'sun' : 'moon'}"></i>
            </button>
        </div>
        <h1 class="cl-nome ds-display">${esc(cliente.nome)}</h1>
        ${cliente.proposito ? `<p class="cl-proposito">${esc(cliente.proposito)}</p>` : ''}
    </header>`;

/* A legenda descreve PAPÉIS, não dias.

   Ela citava o dia de cada fase ("Fundo: segunda e terça"), o que estava certo
   enquanto o cronograma era fixo. Desde que a equipe passou a remanejar
   conteúdo — trocar um de sexta com um de segunda quando a gravação atrasa —
   essa frase virou uma promessa que a própria tela desmente logo acima: o
   cliente lê "fundo é segunda" e vê um fundo marcado na sexta.

   A data verdadeira de cada conteúdo já está no cartão dele. A legenda existe
   para explicar por que os três papéis existem, e isso não muda de lugar. */
const legenda = () => `
    <section class="cl-legenda">
        <h2 class="cl-secao-titulo">Como ler o cronograma</h2>
        <p class="cl-legenda__intro">
            Cada conteúdo tem um papel. O <strong>Funil Invertido</strong> organiza a semana
            por esses papéis: ela começa falando com quem já está pronto para decidir e termina
            abrindo a porta para quem ainda não conhece você. A data de cada um está no cartão.
        </p>
        <div class="cl-legenda__linhas">
            ${[
                ['fundo', 'Fundo', 'Para quem já conhece você e está a um passo de decidir. Pede uma ação — agendar, responder, garantir a vaga.'],
                ['meio',  'Meio',  'A aula. Para quem já sabe que tem um problema e está avaliando quem resolve.'],
                ['topo',  'Topo',  'A porta aberta. Para quem ainda não conhece você — útil a ponto de valer o compartilhamento.'],
            ].map(([id, nome, texto]) => `
                <div class="cl-legenda__linha">
                    <span class="vz-ponto vz-ponto--${id}"></span>
                    <span><strong>${nome} de funil.</strong> ${texto}</span>
                </div>`).join('')}
        </div>
        <!-- Rever o tour precisa existir em algum lugar: ele roda uma vez só, e
             quem fechou no primeiro passo — ou abriu o link noutro aparelho —
             não teria como voltar. Discreto de propósito: é para quem procura. -->
        <button class="cl-tour-link" id="cl-tour">
            <i data-lucide="compass"></i> Ver o tour desta tela
        </button>
    </section>`;

function ligarTema(container) {
    container.querySelector('#cl-tema')?.addEventListener('click', () => {
        theme.alternar();
        // Redesenha a rota atual: o ícone do botão e o logo mudam com o tema.
        navegar(window.location.pathname);
        window.dispatchEvent(new PopStateEvent('popstate'));
    });
}

const desenharAviso = (container, icone, titulo, texto, acao = '') => {
    container.innerHTML = `
        <div class="cl cl--aviso">
            <div class="cl-aviso">
                <img class="cl-logo" src="/assets/logo/5k9-lockup-horizontal-white.png"
                     alt="5K9 Studio" width="816" height="185">
                ${vazioHTML(icone, titulo, texto, acao)}
            </div>
        </div>`;
    if (window.lucide) lucide.createIcons();
};

// ═══════════════════════════════════════════════════════════════════════════
function injectStyles() {
    if (document.getElementById('cliente-styles')) return;
    const style = document.createElement('style');
    style.id = 'cliente-styles';
    /* MIN-WIDTH, ao contrário do resto do estúdio: ver o cabeçalho do arquivo.
       O desenho base é o de celular; as regras que crescem estão no fim. */
    style.textContent = `
        .cl {
            flex: 1; min-width: 0;
            display: flex; flex-direction: column;
            background: var(--surface-base);
            font-family: var(--font-sans); color: var(--text-primary);
        }
        .cl-carregando {
            flex: 1; display: flex; align-items: center; justify-content: center;
            font-family: var(--font-sans); color: var(--text-tertiary); font-size: var(--text-sm);
        }

        /* ── Cabeçalho ─────────────────────────────────────────────────── */
        .cl-topo {
            display: flex; flex-direction: column; gap: var(--space-3);
            padding: max(var(--space-5), env(safe-area-inset-top)) var(--space-5) var(--space-5);
            border-bottom: 1px solid var(--border-subtle);
        }
        .cl-topo__marca { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
        /* Regra do DS: lockup dimensionado pela ALTURA, largura em auto. */
        .cl-logo { height: 20px; width: auto; display: block; }
        html[data-theme="light"] .cl-logo { content: url("/assets/logo/5k9-lockup-horizontal-ink.png"); }

        .cl-nome {
            margin: 0; font-size: 30px; line-height: 1.05;
            letter-spacing: var(--tracking-display); color: var(--text-primary);
        }
        .cl-proposito {
            margin: 0; font-size: var(--text-sm); color: var(--text-secondary);
            line-height: var(--leading-body); max-width: 60ch;
        }

        .cl-corpo {
            flex: 1; display: flex; flex-direction: column; gap: var(--space-6);
            padding: var(--space-5);
            max-width: 760px; width: 100%; margin: 0 auto;
        }

        /* ── Chamada de pendência ──────────────────────────────────────── */
        .cl-chamada {
            display: flex; align-items: center; gap: var(--space-3);
            padding: var(--space-4);
            border-radius: var(--radius-md);
            background: var(--accent-muted); border: 1px solid var(--accent-border);
            color: var(--text-primary); font-size: var(--text-sm); text-decoration: none;
        }
        .cl-chamada i, .cl-chamada svg { width: 17px; height: 17px; color: var(--accent); flex-shrink: 0; }

        /* ── Seletor de mês ────────────────────────────────────────────── */
        .cl-mes { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
        .cl-mes__rotulo { font-size: var(--text-h3); font-weight: 600; letter-spacing: var(--tracking-tight); }
        .cl-mes__rotulo::first-letter { text-transform: uppercase; }

        .cl-semanas { display: flex; flex-direction: column; gap: var(--space-6); }
        .cl-semana-vazia {
            margin: 0; padding: var(--space-4);
            border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);
            font-size: var(--text-sm); color: var(--text-tertiary); text-align: center;
        }
        .cl-seta { width: 16px; height: 16px; color: var(--text-disabled); align-self: center; flex-shrink: 0; }

        .cl-estado { font-weight: 600; }
        .cl-estado--ok     { color: var(--success); }
        .cl-estado--ajuste { color: var(--warning); }
        .cl-estado--espera { color: var(--accent); }

        /* ── Legenda ───────────────────────────────────────────────────── */
        .cl-secao-titulo {
            margin: 0 0 var(--space-3); font-size: var(--text-xs); font-weight: 700;
            color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide);
        }
        .cl-legenda {
            padding: var(--space-5); border-radius: var(--radius-md);
            background: var(--surface-1); border: 1px solid var(--border-subtle);
        }
        .cl-legenda__intro { margin: 0 0 var(--space-4); font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
        .cl-legenda__intro strong { color: var(--text-primary); }
        .cl-legenda__linhas { display: flex; flex-direction: column; gap: var(--space-3); }
        .cl-legenda__linha { display: flex; align-items: flex-start; gap: var(--space-3); font-size: var(--text-sm); color: var(--text-tertiary); line-height: var(--leading-body); }
        .cl-tour-link {
            display: inline-flex; align-items: center; gap: var(--space-2);
            align-self: flex-start; min-height: 40px; padding: 0 var(--space-3);
            margin-top: var(--space-2);
            border: 1px solid var(--border-subtle); border-radius: var(--radius-pill);
            background: transparent; color: var(--text-tertiary);
            font-family: var(--font-sans); font-size: var(--text-xs); font-weight: 600;
            cursor: pointer;
        }
        .cl-tour-link:hover { border-color: var(--accent-border); color: var(--accent); }
        .cl-tour-link i, .cl-tour-link svg { width: 14px; height: 14px; }
        .cl-legenda__linha .vz-ponto { margin-top: 7px; }
        .cl-legenda__linha strong { color: var(--text-primary); }

        /* ── Roteiro ───────────────────────────────────────────────────── */
        .cl-topo-roteiro {
            position: sticky; top: 0; z-index: 5;
            display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
            padding: max(var(--space-3), env(safe-area-inset-top)) var(--space-5) var(--space-3);
            background: var(--glass-bg);
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
            border-bottom: 1px solid var(--border-subtle);
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .cl-topo-roteiro { background: var(--surface-1); }
        }
        .cl-voltar {
            display: inline-flex; align-items: center; gap: var(--space-2);
            font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); text-decoration: none;
            /* 44px de alvo: é o mínimo confortável para o polegar, e este é o
               único caminho de volta que a tela oferece. */
            min-height: 44px;
        }
        .cl-voltar i, .cl-voltar svg { width: 16px; height: 16px; }
        .cl-topo-cliente { font-size: var(--text-xs); color: var(--text-tertiary); }

        .cl-ficha { display: flex; flex-direction: column; gap: var(--space-3); }
        .cl-ficha__chips { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
        .cl-titulo { margin: 0; font-size: 26px; font-weight: 600; line-height: var(--leading-snug); letter-spacing: var(--tracking-tight); }
        .cl-quando { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        .cl-tema { flex-shrink: 0; }
        .cl-tema i, .cl-tema svg { width: 16px; height: 16px; }

        .cl-estrategia { display: flex; flex-direction: column; gap: var(--space-3); }
        .cl-roteiro, .cl-historico { display: flex; flex-direction: column; }

        /* ── Comentar uma fala ─────────────────────────────────────────── */
        .cl-roteiro__dica {
            display: flex; align-items: center; gap: var(--space-2);
            margin: 0 0 var(--space-3);
            font-size: var(--text-xs); color: var(--text-tertiary);
        }
        .cl-roteiro__dica i, .cl-roteiro__dica svg { width: 14px; height: 14px; }

        /* A fala clicável não anuncia isso o tempo todo: um roteiro inteiro de
           caixas destacadas viraria um formulário. Ela só reage ao toque, e a
           dica acima da lista explica uma vez. */
        .cl-fala { cursor: pointer; transition: border-color var(--dur-fast), background-color var(--dur-fast); }
        .cl-fala:hover { border-color: var(--accent-border); }
        .cl-fala:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
        .cl-fala.is-selecionada {
            border-color: var(--accent);
            box-shadow: 0 0 0 1px var(--accent);
        }

        .cl-comentario {
            display: flex; flex-direction: column; gap: var(--space-2);
            margin-top: calc(var(--space-3) * -1 + 2px);
            padding: var(--space-4);
            border: 1px solid var(--accent); border-top: none;
            border-radius: 0 0 var(--radius-md) var(--radius-md);
            background: var(--accent-muted);
        }
        .cl-comentario__rotulo { font-size: var(--text-xs); font-weight: 600; color: var(--text-primary); }
        .cl-comentario__campo {
            height: auto; padding: var(--space-3); resize: vertical;
            font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--leading-body);
        }
        .cl-comentario__nome { font-size: var(--text-sm); }
        .cl-comentario__acoes { display: flex; gap: var(--space-2); }
        .cl-comentario__acoes .ds-btn { flex: 1; min-height: 42px; }
        .cl-comentario__erro {
            margin: 0; padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-sm); background: var(--danger-muted);
            font-size: var(--text-xs); color: var(--danger);
        }
        .cl-comentario__erro[hidden] { display: none; }

        /* ── O fio da conversa, sob a fala ────────────────────────────────
           A cor da borda diz de quem é a vez sem exigir leitura: amarelo é "a
           equipe está vendo", roxo é "responderam, olha aí", verde é
           "encerrado". A mesma escala da tela da equipe — os dois lados
           precisam estar falando do mesmo estado. */
        .cl-fala--conversa   { border-left-width: 3px; border-left-style: solid; }
        .cl-fala--pendente   { border-left-color: var(--warning); }
        .cl-fala--respondido { border-left-color: var(--accent); }
        .cl-fala--fechado    { border-left-color: var(--success); }

        .cl-fio {
            display: flex; flex-direction: column; gap: var(--space-3);
            margin: var(--space-2) 0 0 var(--space-4);
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            background: var(--surface-2); border: 1px solid var(--border-subtle);
        }
        .cl-fio--respondido { border-color: color-mix(in oklch, var(--accent) 40%, transparent); }
        .cl-fio--fechado    { border-color: color-mix(in oklch, var(--success) 30%, transparent); }
        .cl-fio--novo       { background: var(--accent-muted); }

        .cl-fio__estado {
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
            font-size: var(--text-xs); font-weight: 700; color: var(--text-tertiary);
            text-transform: uppercase; letter-spacing: var(--tracking-wide);
        }
        .cl-fio__estado i, .cl-fio__estado svg { width: 13px; height: 13px; }
        .cl-fio--pendente   .cl-fio__estado { color: var(--warning); }
        .cl-fio--respondido .cl-fio__estado { color: var(--accent); }
        .cl-fio--fechado    .cl-fio__estado { color: var(--success); }
        .cl-fio__novo {
            padding: 1px 7px; border-radius: var(--radius-pill);
            background: var(--accent); color: var(--surface-1);
            font-size: 10px; letter-spacing: var(--tracking-wide);
        }

        .cl-fio__item { display: flex; flex-direction: column; gap: 4px; }
        /* A equipe entra recuada, como em qualquer conversa: o recuo diz quem
           falou antes de o texto ser lido. */
        .cl-fio__item--equipe { padding-left: var(--space-4); border-left: 2px solid var(--border-subtle); }
        .cl-fio__quem {
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
            font-size: var(--text-xs); font-weight: 600; color: var(--text-secondary);
        }
        .cl-fio__quem i, .cl-fio__quem svg { width: 13px; height: 13px; }
        .cl-fio__data { margin-left: auto; font-weight: 400; color: var(--text-tertiary); }
        .cl-fio__texto { margin: 0; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body); }
        .cl-fio__antes { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); font-style: italic; line-height: var(--leading-body); }
        /* 44px: é ação consequente, e o dedo é o único ponteiro desta tela. */
        .cl-fio__ok { min-height: 44px; }

        /* Some sozinho na próxima visita: é aviso de mudança, não estado. */
        .cl-novidade {
            display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            background: var(--accent-muted); color: var(--accent);
            font-size: var(--text-sm); font-weight: 500; line-height: var(--leading-body);
        }
        .cl-novidade i, .cl-novidade svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }

        .cl-retorno {
            padding: var(--space-4); border-radius: var(--radius-md);
            background: var(--surface-2); border: 1px solid var(--border-subtle);
            margin-bottom: var(--space-2);
        }
        .cl-retorno__cabeca {
            display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
            font-size: var(--text-xs); font-weight: 600; color: var(--text-tertiary);
        }
        .cl-retorno__cabeca i, .cl-retorno__cabeca svg { width: 13px; height: 13px; }
        .cl-retorno--ok      .cl-retorno__cabeca { color: var(--success); }
        .cl-retorno--atencao .cl-retorno__cabeca { color: var(--warning); }
        .cl-retorno--info    .cl-retorno__cabeca { color: var(--accent); }
        .cl-retorno--equipe { margin-left: var(--space-4); }
        .cl-retorno__data { margin-left: auto; font-weight: 400; }
        .cl-retorno__texto { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }

        /* ── Barra de ação ─────────────────────────────────────────────────
           Fixa no rodapé, com respiro para a área de gestos do iPhone. Se ela
           ficasse no fim do roteiro, aprovar exigiria rolar de volta um texto
           que a pessoa acabou de ler. */
        .cl-espaco-barra { height: 132px; }
        /* EMPILHADA por padrão. Em linha, "Aguardando você" + dois botões
           passavam da largura do celular e o "Aprovar" era cortado pela borda
           direita — o botão mais importante da tela, justamente. O estado sobe
           para uma linha própria e os botões dividem a largura por igual. */
        .cl-barra {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
            display: flex; flex-direction: column; align-items: stretch; gap: var(--space-2);
            padding: var(--space-3) var(--space-4);
            padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
            background: var(--glass-bg);
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
            border-top: 1px solid var(--border-default);
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .cl-barra { background: var(--surface-1); }
        }
        .cl-barra__estado {
            display: flex; align-items: center; justify-content: center; gap: var(--space-2);
            font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap;
        }
        .cl-barra__estado i, .cl-barra__estado svg { width: 14px; height: 14px; }
        .cl-barra__botoes { display: flex; align-items: center; gap: var(--space-2); }
        /* Dividem a largura por igual. Um botão de "Aprovar" mais estreito que
           o "Pedir ajuste" sugeriria uma hierarquia que não existe: as duas são
           respostas legítimas, e a cor já diz qual é a principal. */
        .cl-barra__botoes .ds-btn { flex: 1; }
        /* 44px de altura: são as únicas ações da tela e as mais consequentes.
           Botão de 32px em toque é onde nasce o "cliquei e não aconteceu". */
        .cl-barra .ds-btn { min-height: 44px; }

        /* ── Painel de pedido de ajuste ────────────────────────────────── */
        .cl-form { display: flex; flex-direction: column; gap: var(--space-3); }
        .cl-form__rotulo { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
        .cl-form__area { height: auto; padding: var(--space-3) var(--space-4); resize: vertical; line-height: var(--leading-body); font-family: var(--font-sans); }
        .cl-form__dica { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }
        .cl-form__erro {
            margin: 0; padding: var(--space-3) var(--space-4);
            background: var(--danger-muted); border-radius: var(--radius-md);
            font-size: var(--text-sm); color: var(--danger);
        }
        .cl-form__erro[hidden] { display: none; }

        /* ── Aviso (link inválido, sem conexão) ────────────────────────── */
        .cl--aviso { align-items: center; justify-content: center; }
        .cl-aviso { display: flex; flex-direction: column; align-items: center; gap: var(--space-6); padding: var(--space-8) var(--space-5); }

        /* ── E ENTÃO CRESCE ────────────────────────────────────────────────
           A partir daqui, tela grande. Tudo acima já funciona sem isto. */
        /* Cabendo em linha, volta a ser uma faixa só — o estado à esquerda e as
           ações à direita, que é a leitura mais rápida quando há espaço. */
        @media (min-width: 480px) {
            .cl-barra { flex-direction: row; align-items: center; justify-content: space-between; gap: var(--space-3); padding-left: var(--space-5); padding-right: var(--space-5); }
            .cl-barra__botoes .ds-btn { flex: 0 0 auto; }
            .cl-espaco-barra { height: 96px; }
        }

        @media (min-width: 720px) {
            .cl-topo { padding: var(--space-8) var(--space-8) var(--space-6); align-items: center; }
            .cl-topo__marca, .cl-nome, .cl-proposito { width: 100%; max-width: 760px; }
            .cl-nome { font-size: 44px; }
            .cl-corpo { padding: var(--space-8) var(--space-8) var(--space-12); gap: var(--space-8); }
            .cl-titulo { font-size: 34px; }
            .cl-topo-roteiro { padding: var(--space-4) var(--space-8); }

            /* Na mesa a barra deixa de ser uma faixa colada no rodapé e vira
               um cartão flutuante centralizado: largura de tela inteira para
               dois botões pareceria um alerta do sistema. */
            .cl-barra {
                left: 50%; right: auto; bottom: var(--space-6);
                transform: translateX(-50%);
                width: min(560px, calc(100vw - var(--space-8) * 2));
                border: 1px solid var(--border-default);
                border-radius: var(--radius-pill);
                box-shadow: var(--shadow-lg);
                padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
            }
            .cl-espaco-barra { height: 110px; }
        }
    `;
    document.head.appendChild(style);
}
