import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { abrirMenu } from '../components/menu.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import {
    apelidoSugerido, criticarApelido, temSufixoAleatorio, linkDoCliente,
} from '../lib/apelido.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { marcarAtivo } from '../lib/ui.js';
import {
    esc, mesExtenso, somarMeses, chaveMes, semanaCurta, semanaAtual,
    nomeDiaCurto, diaCurto, hoje, indiceDia, dataBR,
} from '../lib/formato.js';
import {
    mesEmSemanas, cobertura, alertasDaSemana, porData, proximo,
    leituraDeslocamento, moverPara,
} from '../lib/cronograma.js';
import {
    listarFases, listarObjetivos, objetivosDaFase, objetivo, nomeFase,
    leitura, conferir, noDiaCerto, classificar,
} from '../lib/diretorio.js';
import { chipFase, chipStatus, seloDeslocado, vazioHTML, STATUS } from '../lib/pecas.js';
import { chipEtiqueta, injectEstilosEtiqueta, etapaAtual, proximaEtapa, statusParaEtapa } from '../lib/etiquetas.js';
import { moverParaEtapa, mudarStatus } from '../lib/etapas.js';
import { ativarArraste } from '../lib/arrastar.js';
import { timeSalvo } from '../lib/gestor.js';
import { sugerirObjetivo } from '../lib/importar.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CRONOGRAMA DO CLIENTE — a tela onde o mês é montado.

   Mesmo desenho da tela que o cliente vê (semana a semana, com a fita de
   cobertura das três fases), porque quem monta precisa estar olhando o que
   ele vai olhar. A diferença é o que sobra por cima: rascunhos, alertas de
   estratégia, e o botão que libera o mês.

   ── OS ALERTAS ────────────────────────────────────────────────────────────
   A semana avisa quando falta uma fase e quando um conteúdo está no dia
   errado para a fase dele. As duas regras saem do guia estratégico, não de
   opinião — e as duas ficam CALADAS quando está tudo certo. Um painel que
   sempre tem algo na caixa de aviso ensina a ignorar a caixa de aviso.
   ═══════════════════════════════════════════════════════════════════════════ */

const FILTROS = [
    { id: 'tudo',       rotulo: 'Tudo' },
    { id: 'rascunho',   rotulo: 'Rascunhos' },
    { id: 'em_revisao', rotulo: 'Em revisão' },
    { id: 'ajuste',     rotulo: 'Com ajuste' },
];

/* ── ONDE A PESSOA ESTAVA ─────────────────────────────────────────────────
   Mês e filtro sobrevivem à ida e volta para uma demanda. Sem isso, o fluxo
   real virava um labirinto: trocar de mês, filtrar por "em revisão", abrir uma
   demanda, voltar — e cair no mês de hoje, sem filtro, para refazer os dois
   passos antes de abrir a próxima. Cada correção de status custava seis
   cliques, quatro deles para desfazer o que a tela tinha esquecido.

   Guardado POR CLIENTE: quem trabalha em dois cronogramas na mesma sessão não
   quer o mês de um aparecendo no outro. E na memória, não no navegador — é
   estado de navegação, não preferência; abrir o sistema amanhã deve começar do
   mês corrente. */
const ULTIMO = new Map();

/* ── EM QUE MÊS A TELA ABRE ───────────────────────────────────────────────
   No mês corrente, sempre que ele tiver conteúdo. Abria no mês do PRÓXIMO
   conteúdo a publicar, e isso jogava para setembro no dia 23 de agosto só
   porque as peças de agosto já tinham passado da data — o mês ainda estava
   acontecendo, e a tela dizia que não.

   O salto para frente continua existindo para quem tem razão de ver o futuro:
   um cronograma recém-importado para setembro, sem nada em agosto, abre em
   setembro. O que mudou é a ordem da pergunta — primeiro "o mês de hoje tem
   conteúdo?", depois "qual é o próximo?". */
const mesDeAbertura = (conteudos) => {
    const agora = chaveMes(hoje());
    if (conteudos.some(c => chaveMes(c.data) === agora)) return agora;
    return chaveMes(proximo(conteudos)?.data || hoje());
};

export const renderCronograma = async (container, clienteId, mesInicial = null) => {
    const { cliente, conteudos: todos } = await store.doCliente(clienteId);

    /* ── O BANCO DE TEMAS ────────────────────────────────────────────────
       Conteúdo guardado continua existindo com tudo — título, fase, roteiro,
       conversa — e sai das contas do cronograma. É a diferença entre tirar da
       frente e jogar fora: quando a demanda nova ocupa a data de uma antiga, a
       antiga não precisa ser apagada para dar lugar.

       A separação acontece aqui, uma vez, e o resto da tela nem sabe que o
       banco existe. */
    const conteudos = todos.filter(c => !c.banco_em);
    const noBanco = todos.filter(c => c.banco_em)
        .sort((a, b) => String(b.banco_em).localeCompare(String(a.banco_em)));

    if (!cliente) {
        const { content } = renderShell(container, {
            path: '/', title: 'Cliente não encontrado',
            subtitle: 'O cadastro pode ter sido removido.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    // `mesInicial` preserva o mês entre redesenhos: arrastar, liberar o mês ou
    // salvar a ficha redesenham a tela, e sem ele a pessoa era devolvida ao mês
    // corrente a cada ação.
    const lembrado = ULTIMO.get(clienteId) || {};
    let mes = mesInicial || lembrado.mes || mesDeAbertura(conteudos);
    let filtro = lembrado.filtro || 'tudo';

    const lembrar = () => ULTIMO.set(clienteId, { mes, filtro });
    let soltarArraste = null;

    const { content } = renderShell(container, {
        path: '/',
        // Esta tela não é destino da topnav: chega-se a ela por dentro, muitas
        // vezes vindo de um pedido de ajuste no painel. Sem o rastro, o único
        // caminho de volta é o logo — e a pessoa fica sem saber onde está.
        crumbs: [{ href: '/', label: 'Clientes' }],
        title: cliente.nome,
        subtitle: cliente.proposito || 'Cronograma e roteiros deste cliente.',
        actions: `
            <a class="ds-btn ds-btn--ghost" href="/quadro/${esc(clienteId)}">
                <i data-lucide="layout-grid"></i> Quadro do mês
            </a>
            <a class="ds-btn ds-btn--ghost" href="/producao/${esc(clienteId)}">
                <i data-lucide="workflow"></i> Produção
            </a>
            <a class="ds-btn ds-btn--ghost" href="/importar/${esc(clienteId)}">
                <i data-lucide="file-up"></i> Importar
            </a>
            <button class="ds-btn ds-btn--ghost" id="cr-link">
                <i data-lucide="link"></i> Link do cliente
            </button>
            <a class="ds-btn ds-btn--ghost" href="/c/${esc(cliente.apelido || cliente.token)}" target="_blank" rel="noopener">
                <i data-lucide="external-link"></i> Ver como o cliente vê
            </a>
            <button class="ds-btn ds-btn--ghost" id="cr-banco">
                <i data-lucide="archive"></i> Banco de temas
                ${noBanco.length ? `<span class="cr-conta">${noBanco.length}</span>` : ''}
            </button>
            <button class="ds-btn ds-btn--ghost cr-perigo" id="cr-apagar">
                <i data-lucide="trash-2"></i> Apagar cronograma
            </button>
            <button class="ds-btn ds-btn--primary" id="cr-novo">
                <i data-lucide="plus"></i> Novo conteúdo
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosEtiqueta();

    const recarregar = () => renderCronograma(container, clienteId, mes);

    /* O vocabulário de etiquetas não é cadastrado: ele É o que está em uso.
       Ordenado por frequência, para a etiqueta do dia a dia aparecer primeiro
       na lista de sugestões em vez da que alguém usou uma vez em março. */
    const etiquetasEmUso = (() => {
        const conta = new Map();
        for (const x of conteudos) {
            for (const e of x.etiquetas || []) conta.set(e, (conta.get(e) || 0) + 1);
        }
        return [...conta.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
    })();

    const desenhar = () => {
        const semanas = mesEmSemanas(conteudos, mes);
        const doMes = conteudos.filter(c => chaveMes(c.data) === mes);
        const rascunhos = doMes.filter(c => c.status === 'rascunho');

        content.innerHTML = `
            <article class="ds-card vz-barra">
                <div class="vz-mes">
                    <button class="ds-icon-btn" id="cr-anterior" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
                    <span class="vz-mes__rotulo">${esc(mesExtenso(mes))}</span>
                    <button class="ds-icon-btn" id="cr-proximo" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>
                </div>
                <span class="vz-barra__espaco"></span>
                <div class="vz-filtros" id="cr-filtros">
                    ${FILTROS.map(f => `
                        <button class="vz-filtro ${f.id === filtro ? 'is-active' : ''}"
                                data-filtro="${f.id}" aria-pressed="${f.id === filtro}">${f.rotulo}</button>`).join('')}
                </div>
            </article>

            ${rascunhos.length ? `
                <article class="ds-card cr-liberar">
                    <div class="cr-liberar__texto">
                        <strong>${rascunhos.length} conteúdo${rascunhos.length > 1 ? 's' : ''} em rascunho neste mês.</strong>
                        Rascunho não aparece no link do cliente. Libere quando o mês estiver pronto.
                    </div>
                    <button class="ds-btn ds-btn--primary ds-btn--sm" id="cr-liberar">
                        <i data-lucide="send"></i> Liberar o mês para o cliente
                    </button>
                </article>` : ''}

            <div class="cr-semanas">
                ${doMes.length
                    ? semanas.map(s => semanaHTML(s, filtro, conteudos)).join('')
                    : vazioHTML('calendar-plus', 'Nenhum conteúdo neste mês',
                        'Crie o primeiro e a semana começa a se montar sozinha.',
                        `<button class="ds-btn ds-btn--primary" id="cr-novo-vazio">Novo conteúdo</button>`)}
            </div>
        `;

        // ── Eventos ─────────────────────────────────────────────────────
        content.querySelector('#cr-anterior').addEventListener('click', () => { mes = somarMeses(mes, -1); lembrar(); desenhar(); });
        content.querySelector('#cr-proximo').addEventListener('click', () => { mes = somarMeses(mes, 1); lembrar(); desenhar(); });

        content.querySelector('#cr-filtros').addEventListener('click', (e) => {
            const b = e.target.closest('[data-filtro]');
            if (!b) return;
            filtro = b.dataset.filtro;
            lembrar();
            marcarAtivo(content, 'filtro', filtro);
            desenhar();
        });

        content.querySelector('#cr-novo-vazio')?.addEventListener('click',
            () => formularioConteudo(null, cliente, mes, recarregar, etiquetasEmUso));

        /* O ícone de guardar mora DENTRO do cartão, que é um botão que abre o
           roteiro. Sem parar a propagação, guardar abriria o roteiro do que
           acabou de sair da tela. */
        content.querySelectorAll('[data-acoes]').forEach(botao =>
            botao.addEventListener('click', (e) => {
                e.stopPropagation();   // ver a explicação no menu de status
                const alvo = conteudos.find(x => x.id === botao.dataset.acoes);
                if (!alvo) return;

                const proxima = proximaEtapa(alvo.etiquetas);

                abrirMenu(botao, [
                    /* A etapa vem primeiro: é a ação da rotina, e o rótulo diz
                       o destino em vez de exigir que se lembre da ordem. */
                    ...(proxima ? [{
                        id: 'etapa', label: `Mover para ${proxima}`, icon: 'arrow-right',
                        onClick: async () => {
                            // A mesma função da demanda e da esteira.
                            const { novoStatus, reabriu, desfazer } = await moverParaEtapa(alvo, proxima);
                            // O status muda junto quando a etapa exige — e a
                            // mensagem diz, porque mudança calada é a que
                            // ninguém entende depois.
                            toast(`Agora: ${proxima}.`
                                + (novoStatus ? ` Status: ${STATUS[novoStatus]?.rotulo || novoStatus}.` : '')
                                + (reabriu ? ' A volta ficou registrada no histórico.' : ''), {
                                label: 'Desfazer',
                                onClick: async () => { await desfazer(); recarregar(); },
                            });
                            recarregar();
                        },
                    }] : []),
                    ...Object.entries(STATUS)
                        .filter(([id]) => id !== alvo.status)
                        .map(([id, meta]) => ({
                            id: `status-${id}`, label: `Status: ${meta.rotulo}`, icon: meta.icone,
                            separadorAntes: id === 'rascunho',
                            // A MESMA função da tela da demanda: o menu do
                            // cartão não pode deixar a peça num estado que a
                            // outra tela não produziria.
                            onClick: async () => {
                                const { mensagem, desfazer } = await mudarStatus(alvo, id);
                                toast(mensagem, {
                                    label: 'Desfazer',
                                    onClick: async () => { await desfazer(); recarregar(); },
                                });
                                recarregar();
                            },
                        })),
                    { id: 'abrir', label: 'Abrir o roteiro', icon: 'file-text', separadorAntes: true,
                      onClick: () => navegar(`/conteudo/${alvo.id}`) },
                ]);
            }));

        /* Botão de verdade, irmão do cartão: não precisa mais barrar a
           propagação nem disputar o toque com o arraste. */
        content.querySelectorAll('[data-guardar]').forEach(botao =>
            botao.addEventListener('click', async () => {
                const alvo = conteudos.find(x => x.id === botao.dataset.guardar);
                if (!alvo) return;
                botao.disabled = true;
                await store.conteudos.salvar({ ...alvo, banco_em: new Date().toISOString() });
                toast(`"${alvo.titulo}" foi para o banco de temas.`, {
                    label: 'Desfazer',
                    onClick: async () => {
                        await store.conteudos.salvar({ ...alvo, banco_em: null });
                        recarregar();
                    },
                });
                recarregar();
            }));

        content.querySelectorAll('[data-conteudo]').forEach(el =>
            el.addEventListener('click', () => navegar(`/conteudo/${el.dataset.conteudo}`)));

        content.querySelector('#cr-liberar')?.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            b.disabled = true;
            b.textContent = 'Liberando…';
            /* ── CADA UM VAI PARA O STATUS QUE A ETAPA DELE PEDE ───────────
               Este botão escrevia "em revisão" em cima de TODOS os rascunhos,
               e era daqui que saía a contradição mais teimosa do sistema: uma
               peça em rascunho já marcada como "gravado" virava "gravado + em
               revisão" — o cliente sendo convidado a aprovar o roteiro de um
               vídeo que já estava filmado.

               Liberar quer dizer "o cliente passa a ver isto", e não "todo
               mundo volta para o começo da conversa". Quem ainda não entrou na
               esteira vai para "em revisão", como sempre foi; quem já está
               adiante vai para o status que a própria etapa implica — a mesma
               regra que o botão de mover etapa usa (lib/etiquetas.js).

               Um por vez, sem Promise.all: o adaptador local grava a coleção
               inteira a cada salvar, e disparar dez em paralelo faz a última
               escrita sobrescrever as nove anteriores. */
            let adiantados = 0;
            for (const c of rascunhos) {
                const destino = statusParaEtapa('rascunho', etapaAtual(c.etiquetas)?.nome) || 'em_revisao';
                if (destino !== 'em_revisao') adiantados++;
                await store.conteudos.salvar({ ...c, status: destino });
            }
            toast(`${rascunhos.length} conteúdo${rascunhos.length === 1 ? '' : 's'} liberado${rascunhos.length === 1 ? '' : 's'} para o cliente.`
                + (adiantados ? ` ${adiantados} já ${adiantados === 1 ? 'estava' : 'estavam'} adiante na produção e não ${adiantados === 1 ? 'voltou' : 'voltaram'} a pedir aprovação de roteiro.` : ''));
            recarregar();
        });

        /* Arrastar um cartão sobre outro TROCA os dois de lugar. Na lista, o
           alvo é sempre outro conteúdo — não existe "vaga vazia" para receber,
           porque a lista só desenha o que existe. Mover para um dia livre é o
           que o Quadro do mês faz, e é por isso que ele existe. */
        soltarArraste?.();
        soltarArraste = ativarArraste(content, {
            item: '[data-arrastavel]',
            alvo: '[data-solta]',
            podeSoltar: (a, b) => a !== b,
            aoSoltar: async (idA, idB) => {
                const a = conteudos.find(x => x.id === idA);
                const b = conteudos.find(x => x.id === idB);
                if (!a || !b) return;

                const { alterados, desfazer } = moverPara(a, b.data, conteudos);
                for (const c of alterados) await store.conteudos.salvar(c);

                toast(`"${a.titulo.slice(0, 30)}…" trocou de lugar com "${b.titulo.slice(0, 30)}…".`, {
                    label: 'Desfazer',
                    onClick: async () => {
                        for (const c of desfazer) await store.conteudos.salvar(c);
                        toast('Movimento desfeito.');
                        recarregar();
                    },
                });
                recarregar();
            },
        });

        if (window.lucide) lucide.createIcons();
    };

    document.getElementById('cr-link').addEventListener('click',
        () => abrirLinkDoCliente(cliente, recarregar));

    document.getElementById('cr-banco').addEventListener('click',
        () => abrirBancoDeTemas(cliente, noBanco, recarregar));

    document.getElementById('cr-apagar').addEventListener('click',
        () => abrirApagarCronograma(cliente, conteudos, mes, recarregar));

    document.getElementById('cr-novo').addEventListener('click',
        () => formularioConteudo(null, cliente, mes, recarregar, etiquetasEmUso));

    desenhar();
};

// ─────────────────────────────────────────────────────────────────────────

const semanaHTML = ({ segunda, conteudos }, filtro, todos) => {
    const atual = segunda === semanaAtual();
    const cob = cobertura(conteudos);
    const alertas = alertasDaSemana({ conteudos });
    const visiveis = filtro === 'tudo' ? conteudos : conteudos.filter(c => c.status === filtro);

    return `
        <section class="vz-semana ${atual ? 'vz-semana--atual' : ''}">
            <header class="vz-semana__cabeca">
                <h2 class="vz-semana__titulo">
                    ${atual ? 'Esta semana · ' : ''}${esc(semanaCurta(segunda))}
                </h2>
                <div class="cr-semana__lado">
                    <!-- FASES cobertas, não conteúdos. Uma semana com dois de
                         fundo e um de meio tem três conteúdos e duas fases —
                         escrever "3 de 3" ali dava a semana por completa
                         justamente quando o alerta dizia o contrário. -->
                    <span class="vz-semana__meta">
                        ${['fundo', 'meio', 'topo'].filter(f => cob[f]).length} de 3 fases
                    </span>
                    <div class="vz-cobertura">
                        ${['fundo', 'meio', 'topo'].map(f => `
                            <span class="vz-cobertura__casa vz-cobertura__casa--${f} ${cob[f] ? 'is-cheia' : ''}"
                                  title="${esc(nomeFase(f))}${cob[f] ? '' : ' — sem conteúdo'}"></span>`).join('')}
                    </div>
                </div>
            </header>

            ${alertas.map(a => `
                <p class="cr-alerta cr-alerta--${esc(a.tom)}">
                    <i data-lucide="${a.tom === 'atencao' ? 'triangle-alert' : 'info'}"></i>
                    ${esc(a.texto)}
                </p>`).join('')}

            ${visiveis.length
                ? porData(visiveis).map(c => cartaoHTML(c, todos)).join('')
                : `<p class="cr-vazia">${conteudos.length ? 'Nada nesta semana com o filtro escolhido.' : 'Semana sem conteúdo programado.'}</p>`}
        </section>`;
};

const cartaoHTML = (c, todos) => {
    const o = objetivo(c.objetivo);
    // `l` é a leitura do par fase × objetivo; `desl`, a do deslocamento. Duas
    // coisas diferentes que o cartão mostra lado a lado.
    const l = leitura(c.fase, c.objetivo);
    const desl = leituraDeslocamento(c, todos);
    const foraDeLugar = c.fase && !noDiaCerto(c.fase, indiceDia(c.data));

    /* A COR DIZ EM QUE PÉ ESTÁ A PRODUÇÃO, e é a mesma escala dos chips: quem
       aprende a cor num lugar lê no outro. Rascunho fica sem cor nenhuma — é a
       ausência de produção, e pintar tudo faria a cor deixar de significar. */
    const etapa = etapaAtual(c.etiquetas);

    /* ── DUAS ZONAS DE CLIQUE, LADO A LADO E SEPARADAS ────────────────────
       O gatilho do banco morava DENTRO do cartão. Isso trazia dois problemas,
       e o segundo é o que impedia de usar:

         · encostava na seta de abrir, e quem queria ler arquivava;
         · o cartão é arrastável, e o arraste capturava o toque antes de o
           clique acontecer. O botão existia e não respondia — só funcionava no
           Quadro do mês, onde o cartão não é um <button>.

       Agora são dois elementos IRMÃOS, com um vão de verdade entre eles: o
       cartão abre, a caixa guarda, e nenhum dos dois alcança a área do outro. */
    return `
        <div class="cr-item">
        <button class="vz-conteudo ${etapa ? `cr-etapa cr-etapa--${esc(etapa.tom)}` : ''}"
                data-conteudo="${esc(c.id)}"
                data-arrastavel="${esc(c.id)}" data-solta="${esc(c.id)}">
            <span class="vz-fita vz-fita--${esc(c.fase || '')}"></span>
            <div class="vz-conteudo__corpo">
                <div class="vz-conteudo__topo">
                    <span class="vz-conteudo__dia ${foraDeLugar ? 'cr-dia--alerta' : ''}">
                        ${esc(nomeDiaCurto(c.data))} ${esc(diaCurto(c.data))}
                    </span>
                    ${chipFase(c.fase, { curto: true })}
                    ${chipStatus(c.status)}
                    ${l && l.chave === 'conflito' ? `<span class="vz-status vz-status--ajuste"><i data-lucide="octagon-alert"></i>par em conflito</span>` : ''}
                </div>
                <h3 class="vz-conteudo__titulo">${esc(c.titulo)}</h3>
                ${c.tema ? `<p class="vz-conteudo__previa">${esc(c.tema)}</p>` : ''}
                <div class="vz-conteudo__pe">
                    ${o ? `<span>${esc(o.nome)}</span>` : '<span>sem objetivo</span>'}
                    ${c.formato ? `<span>${esc(c.formato)}</span>` : ''}
                    ${c.responsavel ? `<span>${esc(c.responsavel)}</span>` : ''}
                    ${c.revisado ? '<span>revisado</span>' : ''}
                </div>
                ${(c.etiquetas || []).length ? `
                    <div class="cr-etiquetas">
                        ${c.etiquetas.map(chipEtiqueta).join('')}
                    </div>` : ''}
                ${seloDeslocado(desl)}
            </div>
            <i class="cr-seta" data-lucide="chevron-right"></i>
        </button>

        <button class="cr-guardar" data-guardar="${esc(c.id)}"
                title="Mandar para o banco de temas" aria-label="Mandar para o banco de temas">
            <i data-lucide="archive"></i>
        </button>

        ${/* Mudar o status exigia abrir a demanda, mexer lá dentro e voltar —
              e voltar custava refazer mês e filtro. Três telas para trocar uma
              palavra. Aqui as três ações que se faz percorrendo a lista ficam
              a um clique, sem sair de onde se está. */''}
        <button class="cr-acoes" data-acoes="${esc(c.id)}"
                title="Ações" aria-label="Ações" aria-haspopup="menu">
            <i data-lucide="ellipsis-vertical"></i>
        </button>
        </div>`;
};

// ═══════════════════════════════════════════════════════════════════════════
// O FORMULÁRIO — onde a inteligência do diretório aparece enquanto se digita
// ═══════════════════════════════════════════════════════════════════════════

/* ═══════════════════════════════════════════════════════════════════════════
   O LINK DO CLIENTE — ver, personalizar e copiar.

   Existe aqui, e não só no painel, porque é daqui que a pessoa manda o link:
   ela acabou de liberar o mês e quer avisar o cliente. Voltar para a lista de
   clientes só para copiar um endereço é um desvio sem motivo.

   ── POR QUE O AVISO DE SIGILO É GRANDE ────────────────────────────────────
   Este link abre o cronograma inteiro. O token aleatório não é adivinhável; um
   apelido legível é, por construção. Trocar um pelo outro é uma decisão de
   segurança disfarçada de decisão estética, e a tela precisa dizer isso NA
   HORA — não num rodapé de documentação que ninguém lê.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   APAGAR O CRONOGRAMA

   Existe porque importar errado é normal: sobe-se um PDF, o documento vem com
   uma fase faltando ou com os temas repetidos, e o cronograma precisa voltar
   à estaca zero. Sem isto, a saída era apagar oitenta conteúdos um a um.

   ── DUAS PORTAS, E A MENOR PRIMEIRO ───────────────────────────────────────
   Só o mês visível, ou tudo. São situações diferentes: a primeira é "esta
   importação saiu errada", a segunda é "recomeçar o cliente". Oferecer só a
   segunda faria alguém apagar um ano de histórico para consertar um mês.

   ── O QUE VAI JUNTO ───────────────────────────────────────────────────────
   Roteiro e conversa saem com o conteúdo, porque o banco tem cascata — e é o
   comportamento certo: um roteiro sem conteúdo não tem onde aparecer. A
   contagem no painel diz quantos roteiros e quantas conversas vão junto,
   ANTES de apertar; a diferença entre "apaguei 12 rascunhos" e "apaguei 12
   conteúdos com roteiro pronto e a conversa de aprovação" é grande demais
   para ficar implícita.

   ── SEM DESFAZER ──────────────────────────────────────────────────────────
   E o painel diz isso com todas as letras. Desfazer aqui significaria
   remontar conteúdos, blocos e retornos em ordem, com ids novos costurados de
   volta — e um desfazer que às vezes não devolve tudo é pior que nenhum,
   porque muda o cuidado de quem aperta. Por isso a confirmação é digitada:
   este é o único lugar do sistema onde um clique errado custa trabalho de
   verdade.
   ═══════════════════════════════════════════════════════════════════════════ */
function abrirApagarCronograma(cliente, conteudos, mes, aoTerminar) {
    const doMes = conteudos.filter(c => chaveMes(c.data) === mes);
    const escopos = {
        mes:  { lista: doMes,     rotulo: mesExtenso(mes) },
        tudo: { lista: conteudos, rotulo: 'todo o cronograma' },
    };
    let escopo = doMes.length ? 'mes' : 'tudo';

    openDrawer({
        title: 'Apagar cronograma',
        subtitle: cliente.nome,
        body: `
            <div class="cr-apagar">
                <div class="cr-apagar__opcoes" id="cr-escopo">
                    <button type="button" class="cr-apagar__op ${escopo === 'mes' ? 'is-active' : ''}"
                            data-escopo="mes" ${doMes.length ? '' : 'disabled'}>
                        <strong>Só ${esc(mesExtenso(mes))}</strong>
                        <span>${doMes.length} conteúdo${doMes.length === 1 ? '' : 's'}</span>
                    </button>
                    <button type="button" class="cr-apagar__op ${escopo === 'tudo' ? 'is-active' : ''}" data-escopo="tudo">
                        <strong>Tudo</strong>
                        <span>${conteudos.length} conteúdo${conteudos.length === 1 ? '' : 's'}</span>
                    </button>
                </div>

                <p class="cr-apagar__perigo" id="cr-apagar-resumo"></p>

                <label class="vz-rotulo" for="cr-apagar-ok">Para confirmar, escreva <strong>APAGAR</strong></label>
                <input class="ds-input" id="cr-apagar-ok" type="text" autocomplete="off" placeholder="APAGAR">
                <p class="rt-resp__dica">Isto não tem desfazer.</p>
            </div>`,
        footer: `
            <span style="flex:1"></span>
            <button class="ds-btn ds-btn--ghost" id="cr-apagar-cancelar">Cancelar</button>
            <button class="ds-btn cr-btn-perigo" id="cr-apagar-ok-btn" disabled>Apagar</button>`,
        onMount: async (painel) => {
            injectEstilosApagar();
            const resumo = painel.querySelector('#cr-apagar-resumo');
            const campo = painel.querySelector('#cr-apagar-ok');
            const botao = painel.querySelector('#cr-apagar-ok-btn');
            painel.querySelector('#cr-apagar-cancelar').addEventListener('click', closeDrawer);

            /* As duas coleções são lidas UMA vez, e a contagem é recalculada a
               cada troca de escopo — não vale uma ida ao banco por clique. */
            const [blocos, retornos] = await Promise.all([
                store.blocos.listar(), store.retornos.listar(),
            ]);

            const atualizar = () => {
                const { lista, rotulo } = escopos[escopo];
                const ids = new Set(lista.map(c => c.id));
                const comRoteiro = new Set(blocos.filter(b => ids.has(b.conteudo_id)).map(b => b.conteudo_id)).size;
                const conversas = retornos.filter(r => ids.has(r.conteudo_id)).length;

                resumo.innerHTML = `<i data-lucide="triangle-alert"></i> <span>Isto apaga
                    <strong>${lista.length} conteúdo${lista.length === 1 ? '' : 's'}</strong> de ${esc(rotulo)}`
                    + (comRoteiro ? `, incluindo <strong>${comRoteiro} com roteiro escrito</strong>` : '')
                    + (conversas ? ` e <strong>${conversas} registro${conversas === 1 ? '' : 's'} de conversa</strong> com o cliente` : '')
                    + '.</span>';
                botao.textContent = lista.length ? `Apagar ${lista.length}` : 'Nada a apagar';
                botao.disabled = !lista.length || campo.value.trim().toUpperCase() !== 'APAGAR';
                if (window.lucide) lucide.createIcons();
            };

            painel.querySelector('#cr-escopo').addEventListener('click', (e) => {
                const b = e.target.closest('[data-escopo]');
                if (!b || b.disabled) return;
                escopo = b.dataset.escopo;
                painel.querySelectorAll('[data-escopo]').forEach(x => x.classList.toggle('is-active', x === b));
                atualizar();
            });
            campo.addEventListener('input', atualizar);
            atualizar();

            botao.addEventListener('click', async () => {
                const { lista } = escopos[escopo];
                botao.disabled = true;
                botao.textContent = 'Apagando…';
                try {
                    // Um por vez: o adaptador local grava a coleção inteira a
                    // cada escrita, e em paralelo a última sobrescreve as outras.
                    for (const c of lista) await store.conteudos.excluir(c.id);
                    closeDrawer();
                    toast(`${lista.length} conteúdo(s) apagado(s).`);
                    aoTerminar();
                } catch (e) {
                    console.error('[cronograma] falha ao apagar:', e);
                    toast('Não consegui apagar tudo. Recarregue e confira o que sobrou.');
                    botao.disabled = false;
                    botao.textContent = `Apagar ${lista.length}`;
                }
            });
        },
    });
}

function injectEstilosApagar() {
    if (document.getElementById('cronograma-apagar-styles')) return;
    const style = document.createElement('style');
    style.id = 'cronograma-apagar-styles';
    style.textContent = `
        .cr-apagar { display: flex; flex-direction: column; gap: var(--space-3); }
        .cr-apagar__opcoes { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        .cr-apagar__op {
            flex: 1 1 150px; display: flex; flex-direction: column; gap: 2px;
            padding: var(--space-3) var(--space-4); text-align: left;
            border: 1px solid var(--glass-border); border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.06); color: var(--text-secondary);
            font-family: var(--font-sans); cursor: pointer;
        }
        .cr-apagar__op strong { font-size: var(--text-sm); color: var(--text-primary); }
        .cr-apagar__op span { font-size: var(--text-xs); }
        .cr-apagar__op.is-active { border-color: var(--danger); background: var(--danger-muted); }
        .cr-apagar__op[disabled] { opacity: 0.4; cursor: default; }
        .cr-apagar__perigo {
            display: flex; align-items: flex-start; gap: var(--space-2); margin: 0;
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            background: var(--danger-muted); color: var(--danger);
            font-size: var(--text-sm); line-height: var(--leading-body);
        }
        .cr-apagar__perigo i, .cr-apagar__perigo svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }
        .cr-apagar__perigo strong { color: var(--danger); }
        .rt-resp__dica { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); }
        .cr-btn-perigo { background: var(--danger); color: var(--surface-1); border-color: transparent; }
        .cr-btn-perigo:hover { background: var(--danger); filter: brightness(1.1); }
        .cr-btn-perigo[disabled] { opacity: 0.45; filter: none; transform: none; cursor: default; }
    `;
    document.head.appendChild(style);
}

export function abrirLinkDoCliente(cliente, aoTerminar) {
    const painel = openDrawer({
        title: 'Link do cliente',
        subtitle: cliente.nome,
        body: `
            <div class="cr-link">
                <div class="cr-link__caixa">
                    <span class="vz-rotulo">Endereço para mandar</span>
                    <code class="cr-link__url" id="cr-url">${esc(linkDoCliente(cliente))}</code>
                    <div class="cr-link__acoes">
                        <button class="ds-btn ds-btn--primary ds-btn--sm" id="cr-copiar">
                            <i data-lucide="copy"></i> Copiar link
                        </button>
                        <a class="ds-btn ds-btn--ghost ds-btn--sm" id="cr-abrir"
                           href="/c/${esc(cliente.apelido || cliente.token)}" target="_blank" rel="noopener">
                            <i data-lucide="external-link"></i> Abrir
                        </a>
                    </div>
                </div>

                <div class="cr-link__campo">
                    <label class="vz-rotulo" for="cr-apelido">Endereço personalizado</label>
                    <div class="cr-link__entrada">
                        <span>/c/</span>
                        <input class="ds-input" id="cr-apelido" type="text" autocomplete="off"
                               placeholder="${esc(apelidoSugerido(cliente))}"
                               value="${esc(cliente.apelido || '')}">
                    </div>
                    <p class="cr-link__erro" id="cr-erro" hidden></p>
                    <p class="cr-link__nota" id="cr-nota"></p>
                    <div class="cr-link__acoes">
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="cr-sugerir">
                            <i data-lucide="wand-sparkles"></i> Sugerir
                        </button>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="cr-salvar-apelido">Salvar endereço</button>
                    </div>
                </div>

                <p class="ds-hint">
                    <i data-lucide="info"></i>
                    O endereço secreto <code>${esc(cliente.token)}</code> continua funcionando sempre,
                    em paralelo. Apagar o personalizado não quebra nada que você já mandou.
                </p>
            </div>`,
        footer: `<span style="flex:1"></span>
                 <button class="ds-btn ds-btn--ghost" id="cr-fechar">Fechar</button>`,
        onMount: (p) => {
            injectEstilosLink();
            const campo = p.querySelector('#cr-apelido');
            const erro = p.querySelector('#cr-erro');
            const nota = p.querySelector('#cr-nota');
            const salvar = p.querySelector('#cr-salvar-apelido');

            const avaliar = () => {
                const valor = campo.value.trim();
                const critica = criticarApelido(valor);
                erro.textContent = critica || '';
                erro.hidden = !critica;
                salvar.disabled = !!critica;

                if (!valor) {
                    nota.className = 'cr-link__nota';
                    nota.textContent = 'Sem endereço personalizado, vale só o link secreto — o mais seguro.';
                } else if (temSufixoAleatorio(valor, cliente)) {
                    nota.className = 'cr-link__nota cr-link__nota--ok';
                    nota.textContent = 'Legível e com o sufixo imprevisível no fim. É o equilíbrio recomendado.';
                } else {
                    nota.className = 'cr-link__nota cr-link__nota--aviso';
                    nota.textContent = 'Este endereço não tem a parte aleatória no fim, então quem souber o '
                                     + 'nome do cliente pode chegar ao cronograma sem ter recebido o link. '
                                     + 'Use "Sugerir" se quiser mantê-lo imprevisível.';
                }
            };

            campo.addEventListener('input', avaliar);
            avaliar();

            p.querySelector('#cr-sugerir').addEventListener('click', () => {
                campo.value = apelidoSugerido(cliente);
                avaliar();
                campo.focus();
            });

            p.querySelector('#cr-copiar').addEventListener('click', async () => {
                const url = p.querySelector('#cr-url').textContent;
                try {
                    await navigator.clipboard.writeText(url);
                    toast('Link copiado.');
                } catch {
                    // clipboard exige contexto seguro e permissão. Quando falha,
                    // selecionar o texto é melhor que um erro sem saída.
                    const faixa = document.createRange();
                    faixa.selectNodeContents(p.querySelector('#cr-url'));
                    getSelection().removeAllRanges();
                    getSelection().addRange(faixa);
                    toast('Selecione e copie — o navegador bloqueou a cópia automática.');
                }
            });

            salvar.addEventListener('click', async () => {
                const valor = campo.value.trim() || null;
                salvar.disabled = true;
                salvar.textContent = 'Salvando…';
                try {
                    await store.clientes.salvar({ ...cliente, apelido: valor });
                    closeDrawer();
                    toast(valor ? 'Endereço personalizado salvo.' : 'Endereço personalizado removido.');
                    aoTerminar();
                } catch (e) {
                    console.error('[cronograma] falha ao salvar o apelido:', e);
                    /* 23505 é violação de índice único no Postgres: outro cliente
                       já usa este endereço. Vale a mensagem própria — "erro ao
                       salvar" mandaria a pessoa procurar defeito onde não há. */
                    const duplicado = String(e?.code) === '23505' || /duplicate|unique/i.test(e?.message || '');
                    toast(duplicado
                        ? 'Este endereço já está em uso por outro cliente.'
                        : 'Não foi possível salvar. Tente de novo.');
                    salvar.disabled = false;
                    salvar.textContent = 'Salvar endereço';
                }
            });

            p.querySelector('#cr-fechar').addEventListener('click', closeDrawer);
        },
    });
    return painel;
}

function injectEstilosLink() {
    if (document.getElementById('cronograma-link-styles')) return;
    const style = document.createElement('style');
    style.id = 'cronograma-link-styles';
    style.textContent = `
        .cr-link { display: flex; flex-direction: column; gap: var(--space-5); }
        .cr-link__caixa, .cr-link__campo { display: flex; flex-direction: column; gap: var(--space-2); }
        .cr-link__url {
            display: block; padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.08); border: 1px solid var(--glass-border);
            font-family: var(--font-mono); font-size: 12px; color: var(--text-primary);
            word-break: break-all; line-height: var(--leading-body);
        }
        .cr-link__acoes { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

        /* O "/c/" fixo à esquerda deixa claro que o campo é só o final da URL —
           sem ele, alguém colaria o endereço inteiro ali dentro. */
        .cr-link__entrada { display: flex; align-items: center; gap: var(--space-2); }
        .cr-link__entrada > span { font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary); flex-shrink: 0; }
        .cr-link__entrada .ds-input { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 12px; }

        .cr-link__nota { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }
        .cr-link__nota--aviso { color: var(--warning); }
        .cr-link__nota--ok { color: var(--success); }
        .cr-link__erro {
            margin: 0; padding: var(--space-2) var(--space-3);
            border-radius: var(--radius-sm); background: var(--danger-muted);
            font-size: var(--text-xs); color: var(--danger);
        }
        .cr-link__erro[hidden] { display: none; }
        .ds-hint code {
            font-family: var(--font-mono); font-size: 11px;
            padding: 1px 5px; border-radius: var(--radius-xs);
            background: rgba(255, 255, 255, 0.10);
        }
    `;
    document.head.appendChild(style);
}

/**
 * Formulário de conteúdo.
 *
 * Três comportamentos vivos, todos pendurados no gancho `aoMontar`:
 *
 *   1. Trocar a FASE reordena a lista de OBJETIVOS — naturais primeiro, em
 *      conflito por último. A lista ensina enquanto a pessoa escolhe, em vez
 *      de despejar nove opções soltas em ordem alfabética.
 *   2. Escolher os dois mostra a LEITURA do par, com a nota do diretório.
 *      É o pedido original da ferramenta, acontecendo antes de o conteúdo
 *      existir — e não depois, quando corrigir custa reescrever o roteiro.
 *   3. O texto do título e do tema passa pelo classificador. Se ele discorda
 *      da fase escolhida COM CONFIANÇA, avisa e mostra os sinais que
 *      encontrou. Discordar dele é normal; discordar sem saber, não.
 */
/* ═══════════════════════════════════════════════════════════════════════════
   O BANCO DE TEMAS

   A gaveta do que existe e ainda não tem lugar. Um conteúdo vai para lá
   inteiro — título, fase, objetivo, roteiro, conversa — e volta inteiro.

   Voltar pede uma data, e o palpite é a data de onde ele saiu. Na maioria das
   vezes é ela mesma: o conteúdo foi guardado porque a demanda nova ocupou
   aquele dia, e ele volta assim que o dia seguinte abre.

   A ordem é a de quem saiu por último. Banco de temas é pilha, não arquivo:
   o que foi guardado ontem é o que alguém está procurando hoje.
   ═══════════════════════════════════════════════════════════════════════════ */
export function abrirBancoDeTemas(cliente, noBanco, aoTerminar) {
    openDrawer({
        title: 'Banco de temas',
        subtitle: `${cliente.nome} · ${noBanco.length} guardado${noBanco.length === 1 ? '' : 's'}`,
        body: noBanco.length ? `
            <div class="cr-banco">
                <p class="cr-banco__dica">
                    Estes conteúdos existem inteiros — com roteiro e histórico — e não aparecem
                    no cronograma nem para o cliente. Devolva quando houver dia para eles.
                </p>
                ${noBanco.map(c => `
                    <div class="cr-banco__item" data-item="${esc(c.id)}">
                        <span class="vz-fita vz-fita--${esc(c.fase || '')}"></span>
                        <div class="cr-banco__corpo">
                            <div class="cr-banco__topo">
                                ${chipFase(c.fase, { curto: true })}
                                ${chipStatus(c.status)}
                                <span class="cr-banco__desde">guardado em ${esc(dataBR(String(c.banco_em).slice(0, 10)))}</span>
                            </div>
                            <h4 class="cr-banco__titulo">${esc(c.titulo)}</h4>
                            <div class="cr-banco__volta">
                                <input class="ds-input" type="date" data-data="${esc(c.id)}" value="${esc(c.data)}">
                                <button class="ds-btn ds-btn--ghost ds-btn--sm" data-voltar="${esc(c.id)}">
                                    <i data-lucide="corner-up-left"></i> Devolver
                                </button>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>` : `
            <div class="cr-banco">
                ${vazioHTML('archive', 'O banco está vazio',
                    'Quando uma demanda precisar sair do cronograma sem ser apagada, '
                  + 'use o ícone de caixa no cartão dela. Ela fica aqui, inteira, esperando data.')}
            </div>`,
        footer: `
            <span style="flex:1"></span>
            <button class="ds-btn ds-btn--ghost" id="cr-banco-fechar">Fechar</button>`,
        onMount: (painel) => {
            injectEstilosBanco();
            painel.querySelector('#cr-banco-fechar').addEventListener('click', closeDrawer);

            painel.querySelectorAll('[data-voltar]').forEach(b =>
                b.addEventListener('click', async () => {
                    const id = b.dataset.voltar;
                    const c = noBanco.find(x => x.id === id);
                    const data = painel.querySelector(`[data-data="${id}"]`)?.value || c.data;
                    b.disabled = true;
                    /* data_original acompanha: devolver é decisão deliberada
                       sobre onde o conteúdo vai ficar, e não remanejamento —
                       o selo de "saiu do lugar" falaria de uma mudança que
                       ninguém fez. */
                    await store.conteudos.salvar({ ...c, banco_em: null, data, data_original: data });
                    closeDrawer();
                    toast(`"${c.titulo}" voltou para ${dataBR(data)}.`);
                    aoTerminar();
                }));
            if (window.lucide) lucide.createIcons();
        },
    });
}

function injectEstilosBanco() {
    if (document.getElementById('cronograma-banco-styles')) return;
    const style = document.createElement('style');
    style.id = 'cronograma-banco-styles';
    style.textContent = `
        .cr-banco { display: flex; flex-direction: column; gap: var(--space-3); }
        .cr-banco__dica { margin: 0; font-size: var(--text-xs); color: var(--text-tertiary); line-height: var(--leading-body); }
        .cr-banco__item {
            display: flex; gap: var(--space-3); overflow: hidden;
            border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
            background: var(--surface-2);
        }
        .cr-banco__corpo { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4) var(--space-4) 0; min-width: 0; flex: 1; }
        .cr-banco__topo { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
        .cr-banco__desde { font-size: var(--text-xs); color: var(--text-tertiary); }
        .cr-banco__titulo { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); line-height: var(--leading-snug); }
        .cr-banco__volta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
        .cr-banco__volta .ds-input { width: auto; }
    `;
    document.head.appendChild(style);
}

/* `textoDoRoteiro` é opcional e muda a qualidade do palpite: um título como
   "O que avaliar antes de começar" não tem sinal nenhum, e as nove falas
   abaixo dele têm todos. Quem abre a ficha pela tela do roteiro passa o texto;
   quem cria um conteúdo do zero ainda não tem o que passar. */
export function formularioConteudo(c, cliente, mesSugerido, aoTerminar, etiquetasEmUso = [], textoDoRoteiro = '') {
    const opcoesFase = [
        { valor: '', rotulo: '— escolha a fase —' },
        ...listarFases().map(f => ({ valor: f.id, rotulo: `${nomeFase(f.id)} — ${f.posicao_cronograma}` })),
    ];

    const opcoesObjetivo = (faseId) => [
        { valor: '', rotulo: '— escolha o objetivo —' },
        ...(faseId ? objetivosDaFase(faseId) : listarObjetivos()).map(o => ({
            valor: o.id,
            rotulo: faseId
                ? `${o.nome}${o._leitura === 'natural' ? '' : o._leitura === 'conflito' ? '  (em conflito)' : '  (exige cuidado)'}`
                : o.nome,
        })),
    ];

    abrirFormulario({
        titulo: c ? 'Editar conteúdo' : 'Novo conteúdo',
        subtitulo: cliente.nome,
        campos: [
            { nome: 'titulo', rotulo: 'Título', obrigatorio: true,
              placeholder: 'Por que a resistência à insulina acontece' },
            { nome: 'tema', rotulo: 'Tema em uma frase', tipo: 'textarea',
              placeholder: 'O que o conteúdo aborda, para o cliente reconhecer de relance.' },
            { nome: 'data', rotulo: 'Publicação', tipo: 'data', obrigatorio: true, largura: 'metade' },
            { nome: 'formato', rotulo: 'Formato', largura: 'metade', placeholder: 'Reels, carrossel, story…' },

            { nome: 'fase', rotulo: 'Fase do funil', tipo: 'select', opcoes: opcoesFase, largura: 'metade' },
            { nome: 'objetivo', rotulo: 'Objetivo', tipo: 'select', opcoes: opcoesObjetivo(c?.fase), largura: 'metade' },

            { nome: '_leitura', tipo: 'nota-viva', texto: '' },
            { nome: '_sugestao', tipo: 'nota-viva', texto: '' },

            { nome: 'intencao', rotulo: 'O que este conteúdo precisa fazer', tipo: 'textarea',
              placeholder: 'Uma frase. Aparece para o cliente junto da explicação do objetivo.',
              dica: 'Opcional. Complementa a explicação automática do objetivo, não a substitui.' },

            /* O responsável guarda o NOME, não um id. O time vem do 5K9 Gestor,
               que é outro banco — chave estrangeira entre projetos não existe.
               Guardar o nome também faz o dado sobreviver à ponte desligada e a
               alguém sair da equipe: o histórico continua dizendo quem fez. */
            ...(timeSalvo().length ? [{
                nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', largura: 'metade',
                opcoes: [{ valor: '', rotulo: '— sem responsável —' },
                         ...timeSalvo().map(i => ({ valor: i.nome, rotulo: i.papel ? `${i.nome} · ${i.papel}` : i.nome }))],
                dica: 'Lista trazida do 5K9 Gestor.',
            }] : [{
                nome: 'responsavel', rotulo: 'Responsável', largura: 'metade',
                dica: 'Traga o time do Gestor no painel de clientes para virar uma lista.',
            }]),

            { nome: 'status', rotulo: 'Status', tipo: 'select', largura: 'metade', opcoes:
                Object.entries(STATUS).map(([id, s]) => ({ valor: id, rotulo: s.rotulo })) },
            { nome: 'revisado', tipo: 'checkbox', rotulo: 'Conformidade revisada',
              dica: 'Marque depois da conferência jurídica. O cliente vê essa confirmação.' },

            /* Etiqueta é o estado INTERNO que o sistema não interpreta — "a
               gravar", "aguardando data". Fica separada de `status`, que é a
               conversa com o cliente: cada valor de status vira regra em
               código, e este campo existe justamente para o fluxo poder mudar
               sem passar por migração. Ver db/migracao-etiquetas.sql. */
            { nome: 'etiquetas', rotulo: 'Etiquetas', tipo: 'etiquetas',
              sugestoes: etiquetasEmUso,
              placeholder: 'a gravar, aguardando data',
              dica: 'Separe por vírgula. Só a equipe vê. Escreva a que precisar — '
                  + 'a lista se monta sozinha com as que já estão em uso.' },

            { nome: 'nota', rotulo: 'Anotação interna', tipo: 'textarea',
              dica: 'Só a equipe vê.' },
        ],
        valores: c || {
            status: 'rascunho',
            // Data padrão: hoje, se estamos no mês visitado; senão, o dia 1º
            // dele. Abrir o formulário em outubro e receber a data de hoje faz
            // o conteúdo nascer no mês errado sem ninguém perceber.
            data: chaveMes(hoje()) === mesSugerido ? hoje() : `${mesSugerido}-01`,
        },
        rotuloSalvar: c ? 'Salvar' : 'Criar conteúdo',
        aoMontar: (painel, lerValores) => {
            const selFase = painel.querySelector('[name="fase"]');
            const selObj  = painel.querySelector('[name="objetivo"]');
            const notaLeitura = painel.querySelector('#cp-_leitura');
            const notaSugestao = painel.querySelector('#cp-_sugestao');

            const repintarObjetivos = () => {
                const escolhido = selObj.value;
                selObj.innerHTML = opcoesObjetivo(selFase.value)
                    .map(o => `<option value="${esc(o.valor)}" ${o.valor === escolhido ? 'selected' : ''}>${esc(o.rotulo)}</option>`)
                    .join('');
            };

            /* ── A FASE SE PREENCHE SOZINHA ───────────────────────────────
               O classificador já existia e só servia para DISCORDAR depois que
               alguém escolhia. Escrevendo o título, ele agora escolhe — e diz
               por quê, com as palavras que encontrou.

               Só enquanto ninguém escolheu à mão: no instante em que a pessoa
               mexe no seletor, o automático se cala e não volta. Palpite que
               sobrescreve decisão humana é a maneira mais rápida de fazer
               alguém desligar o recurso inteiro.

               E continua sem chutar: sem sinal no texto, `classificar` devolve
               null e o campo fica vazio esperando gente. */
            let faseAutomatica = !c?.fase;
            /* O objetivo tem o mesmo tratamento da fase, e pelo mesmo motivo:
               ele nasce vazio e quase nunca é preenchido, então o cartão de
               leitura estratégica — que é a razão desta ferramenta existir —
               fica sem a metade que explica o conteúdo. */
            let objetivoAutomatico = !c?.objetivo;

            const atualizar = () => {
                const v = lerValores();

                // 1. A leitura do par
                const l = leitura(v.fase, v.objetivo);
                if (l) {
                    notaLeitura.hidden = false;
                    notaLeitura.classList.toggle('cp-viva--erro', l.chave === 'conflito');
                    notaLeitura.innerHTML = `<b>${esc(l.rotulo)}.</b> ${esc(l.nota)}`;
                } else {
                    notaLeitura.hidden = true;
                }

                const texto = [v.titulo, v.tema, textoDoRoteiro].filter(Boolean).join('. ');

                // 2. A fase e o objetivo, enquanto ninguém escolheu
                if (faseAutomatica) {
                    const palpite = classificar(texto);

                    if (palpite) {
                        if (palpite.fase !== selFase.value) {
                            selFase.value = palpite.fase;
                            repintarObjetivos();
                        }
                        if (objetivoAutomatico) sugerirObjetivoPara(texto, palpite.fase);

                        notaSugestao.hidden = false;
                        notaSugestao.classList.remove('cp-viva--erro');
                        notaSugestao.innerHTML =
                            `<b>Fase sugerida: ${esc(nomeFase(palpite.fase))}.</b> `
                            + `Pelo título — ${esc(palpite.termos.slice(0, 4).join(', '))}.`
                            /* Confiança baixa é empate técnico, e dizer isso vale
                               mais que esconder: a pessoa confere UM caso em vez
                               de desconfiar de todos. */
                            + (palpite.confianca === 'baixa'
                                ? ' Os sinais ficaram empatados — vale conferir.'
                                : ' Troque no seletor se discordar.');
                        return;
                    }

                    /* SEM SINAL, A TELA DIZ ISSO. Antes ela ficava muda, e o
                       campo vazio parecia defeito — foi exatamente assim que
                       o recurso foi dado como quebrado. O classificador não
                       chuta, e isso é uma decisão; o que não pode é a decisão
                       ser invisível. */
                    if (texto.trim().length > 12) {
                        notaSugestao.hidden = false;
                        notaSugestao.classList.remove('cp-viva--erro');
                        notaSugestao.innerHTML =
                            '<b>Não reconheci a fase por este título.</b> '
                            + 'Ele não tem nenhuma das palavras que o diretório conhece — '
                            + 'escolha a fase no seletor, ou escreva o roteiro e o sistema tenta de novo por lá.';
                        return;
                    }
                }

                // 3. A conferência do classificador, quando a escolha é humana
                const divergencia = conferir(v.fase, texto);
                if (divergencia) {
                    notaSugestao.hidden = false;
                    notaSugestao.innerHTML =
                        `<b>Confira a fase.</b> ${esc(divergencia.aviso)} `
                        + `Sinais encontrados: ${esc(divergencia.termos.slice(0, 4).join(', '))}.`
                        + (divergencia.regra ? ` <i>Regra: ${esc(divergencia.regra)}</i>` : '');
                } else {
                    notaSugestao.hidden = true;
                }
            };

            /* O palpite de objetivo sai do mesmo lugar que a importação de PDF
               usa há meses (lib/importar.js): a mesma pergunta feita na mesma
               base, para os dois caminhos de entrada não discordarem sobre o
               mesmo texto. */
            function sugerirObjetivoPara(texto, faseId) {
                const palpite = sugerirObjetivo(texto, faseId);
                if (!palpite || selObj.value === palpite) return;
                selObj.value = palpite;
            }

            selObj.addEventListener('change', () => { objetivoAutomatico = false; });

            selFase.addEventListener('change', () => {
                faseAutomatica = false;
                repintarObjetivos();
                atualizar();
            });
            selObj.addEventListener('change', atualizar);
            painel.querySelector('[name="titulo"]').addEventListener('input', atualizar);
            painel.querySelector('[name="tema"]').addEventListener('input', atualizar);
            atualizar();
        },
        aoSalvar: async (dados) => {
            /* Editar a data na ficha é remanejamento DELIBERADO, então a origem
               acompanha. Arrastar é outra coisa: lá a origem fica parada, e é
               a diferença entre as duas que revela o deslocamento. */
            await store.conteudos.salvar({ ...dados, cliente_id: cliente.id, data_original: dados.data });
            toast(c ? 'Conteúdo atualizado.' : 'Conteúdo criado.');
            aoTerminar();
        },
        aoExcluir: c ? async () => {
            /* Os blocos do roteiro somem junto. No banco isso é `on delete
               cascade`; em modo local não há cascade, então a limpeza é
               explícita — senão os blocos ficam órfãos ocupando espaço e
               reaparecem se um id for reutilizado. */
            const blocos = await store.blocos.listar();
            for (const b of blocos.filter(b => b.conteudo_id === c.id)) {
                await store.blocos.excluir(b.id);
            }
            await store.conteudos.excluir(c.id);
            toast('Conteúdo excluído.');
            aoTerminar();
        } : null,
    });
}

const ESTILOS = `
<style>
/* Vermelho só na letra: um botão sólido no cabeçalho pesaria mais que a
   ação mais usada da tela, e apagar cronograma não é ação de rotina. */
.cr-perigo { color: var(--danger); }
.cr-perigo:hover { background: var(--danger-muted); color: var(--danger); }

.cr-semanas { display: flex; flex-direction: column; gap: var(--space-8); }
.cr-semana__lado { display: flex; align-items: center; gap: var(--space-3); }
.cr-seta { width: 16px; height: 16px; color: var(--text-disabled); align-self: center; flex-shrink: 0; }

.cr-vazia {
    margin: 0; padding: var(--space-4);
    border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);
    font-size: var(--text-sm); color: var(--text-tertiary); text-align: center;
}

.cr-alerta {
    display: flex; align-items: flex-start; gap: var(--space-2);
    margin: 0; padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm); line-height: var(--leading-body);
    background: var(--warning-muted); color: var(--warning);
}
.cr-alerta i, .cr-alerta svg { width: 15px; height: 15px; flex-shrink: 0; margin-top: 2px; }
.cr-alerta--info { background: var(--info-muted); color: var(--info); }

/* ── Etiquetas ─────────────────────────────────────────────────────────
   Discretas de propósito: são recado interno, e competir em peso com a
   fase e o status — que dizem coisas que o cliente vê — trocaria a
   hierarquia do cartão. */
/* O ícone de guardar aparece no cartão e some quando o dedo sai. Discreto
   porque é ação ocasional; presente porque procurar em menu uma ação de um
   clique é o que faz ninguém usar. Em toque não há hover, então ele fica. */
/* O item é o par: cartão e caixa, com um vão de 8px que nenhuma das duas
   áreas de clique atravessa. A separação é física, não uma questão de
   alguns pixels a mais de margem interna. */
.cr-item { display: flex; align-items: stretch; gap: var(--space-2); }
.cr-item .vz-conteudo { flex: 1; min-width: 0; }

.cr-guardar {
    flex: 0 0 44px;
    display: flex; align-items: center; justify-content: center;
    border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);
    background: transparent; color: var(--text-disabled);
    cursor: pointer;
    transition: color var(--dur-fast), border-color var(--dur-fast), background-color var(--dur-fast);
}
.cr-guardar i, .cr-guardar svg { width: 17px; height: 17px; }
.cr-guardar:hover { border-style: solid; border-color: var(--accent-border); color: var(--accent); background: var(--accent-muted); }
.cr-guardar:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

.cr-acoes {
    flex: 0 0 34px;
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: var(--radius-md);
    background: transparent; color: var(--text-disabled); cursor: pointer;
    transition: color var(--dur-fast), background-color var(--dur-fast);
}
.cr-acoes i, .cr-acoes svg { width: 17px; height: 17px; }
.cr-acoes:hover { background: var(--surface-3); color: var(--text-primary); }
.cr-acoes:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }

/* Borda tracejada e não sólida: a caixa é ação ocasional, e um segundo
   botão sólido ao lado de cada cartão competiria com o próprio cartão. */


/* O contador ao lado do rótulo, e não um ponto: quantos há muda a decisão
   de abrir. Some quando é zero — um contador em zero só ocupa espaço. */
.cr-conta {
    min-width: 18px; padding: 0 5px; border-radius: var(--radius-pill);
    background: var(--accent); color: var(--accent-contrast, #fff);
    font-size: 11px; font-weight: 700; line-height: 18px; text-align: center;
}
/* ── A cor da etapa ──────────────────────────────────────────────────────
   Um fio à esquerda, do lado oposto à fita de fase: são duas informações
   diferentes — para QUEM o conteúdo fala e em que PÉ ele está — e disputar a
   mesma borda faria uma esconder a outra. */
.cr-etapa { box-shadow: inset -3px 0 0 0 var(--cor-etapa); }
.cr-etapa--atencao { --cor-etapa: var(--warning); }
.cr-etapa--info    { --cor-etapa: var(--info); }
.cr-etapa--ok      { --cor-etapa: var(--success); }
.cr-etapa--espera  { --cor-etapa: var(--accent); }
.cr-etapa--risco   { --cor-etapa: var(--danger); }

.cr-etiquetas { display: flex; flex-wrap: wrap; gap: 5px; margin-top: var(--space-2); }
.cr-dia--alerta { color: var(--warning) !important; }

.cr-liberar {
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-4); flex-wrap: wrap;
    padding: var(--space-4) var(--space-5);
}
.cr-liberar__texto { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); max-width: 62ch; }
.cr-liberar__texto strong { color: var(--text-primary); }

@media (max-width: 720px) {
    .cr-semanas { gap: var(--space-6); }
    .cr-liberar .ds-btn { width: 100%; }
}
</style>
`;
