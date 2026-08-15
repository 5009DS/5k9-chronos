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
        ligarTema(container);
        if (window.lucide) lucide.createIcons();
    };

    desenhar();
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
                                <p class="vz-nota"><strong>Posição na semana:</strong> ${esc(f.posicao_cronograma)} —
                                   é o Funil Invertido: a semana começa pedindo ação e termina atraindo público novo.</p>
                                <p class="vz-nota"><strong>Tom:</strong> ${esc((f.tom || []).join(', '))}.</p>
                            </div>
                        </details>` : ''}
                    ${conformidadeHTML(c)}
                </section>

                <!-- ══ O roteiro ═══════════════════════════════════════ -->
                <section class="cl-roteiro">
                    <h2 class="cl-secao-titulo">Roteiro</h2>
                    ${meus.length
                        ? roteiroHTML(meus)
                        : vazioHTML('file-text', 'Roteiro ainda não escrito',
                            'A equipe está preparando. Você recebe um aviso quando estiver pronto.')}
                </section>

                ${historico.length ? historicoHTML(historico) : ''}

                <div class="cl-espaco-barra"></div>
            </main>

            ${podeResponder ? barraAcao(c) : ''}
        </div>`;

    if (podeResponder) ligarAcoes(container, token, c);
    if (window.lucide) lucide.createIcons();
    window.scrollTo(0, 0);
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

const historicoHTML = (historico) => `
    <section class="cl-historico">
        <h2 class="cl-secao-titulo">Suas respostas</h2>
        ${historico.map(r => `
            <div class="cl-retorno cl-retorno--${esc(r.tipo)}">
                <div class="cl-retorno__cabeca">
                    <i data-lucide="${r.tipo === 'aprovado' ? 'circle-check' : 'message-circle'}"></i>
                    ${r.tipo === 'aprovado' ? 'Aprovado' : 'Ajuste pedido'}
                    ${r.autor ? `por ${esc(r.autor)}` : ''}
                    <span class="cl-retorno__data">${esc(dataBR(r.criado_em))}</span>
                </div>
                ${r.texto ? `<p class="cl-retorno__texto">${esc(r.texto)}</p>` : ''}
            </div>`).join('')}
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

const legenda = () => `
    <section class="cl-legenda">
        <h2 class="cl-secao-titulo">Como ler o cronograma</h2>
        <p class="cl-legenda__intro">
            A semana segue o <strong>Funil Invertido</strong>: começa pedindo ação, no dia em que
            as pessoas estão mais dispostas a resolver pendências, e termina atraindo público novo,
            quando o consumo é mais leve.
        </p>
        <div class="cl-legenda__linhas">
            ${[
                ['fundo', 'Fundo', 'Segunda e terça · para quem já conhece você e está a um passo de decidir.'],
                ['meio',  'Meio',  'Quarta e quinta · a aula. Para quem sabe do problema e avalia soluções.'],
                ['topo',  'Topo',  'Sexta a domingo · a porta aberta. Para quem ainda não conhece você.'],
            ].map(([id, nome, texto]) => `
                <div class="cl-legenda__linha">
                    <span class="vz-ponto vz-ponto--${id}"></span>
                    <span><strong>${nome} de funil.</strong> ${texto}</span>
                </div>`).join('')}
        </div>
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
        .cl-retorno--aprovado .cl-retorno__cabeca { color: var(--success); }
        .cl-retorno--ajuste   .cl-retorno__cabeca { color: var(--warning); }
        .cl-retorno__data { margin-left: auto; font-weight: 400; }
        .cl-retorno__texto { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }

        /* ── Barra de ação ─────────────────────────────────────────────────
           Fixa no rodapé, com respiro para a área de gestos do iPhone. Se ela
           ficasse no fim do roteiro, aprovar exigiria rolar de volta um texto
           que a pessoa acabou de ler. */
        .cl-espaco-barra { height: 88px; }
        .cl-barra {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 10;
            display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
            padding: var(--space-3) var(--space-5);
            padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
            background: var(--glass-bg);
            -webkit-backdrop-filter: var(--glass-blur); backdrop-filter: var(--glass-blur);
            border-top: 1px solid var(--border-default);
        }
        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
            .cl-barra { background: var(--surface-1); }
        }
        .cl-barra__estado {
            display: flex; align-items: center; gap: var(--space-2);
            font-size: var(--text-xs); color: var(--text-tertiary); white-space: nowrap;
        }
        .cl-barra__estado i, .cl-barra__estado svg { width: 14px; height: 14px; }
        .cl-barra__botoes { display: flex; align-items: center; gap: var(--space-2); }
        /* 44px de altura nos dois botões: são as únicas ações da tela e as
           mais consequentes. Botão de 32px em toque é onde nasce o "cliquei e
           não aconteceu nada". */
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
