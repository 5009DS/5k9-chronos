import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { marcarAtivo } from '../lib/ui.js';
import {
    esc, mesExtenso, somarMeses, chaveMes, semanaCurta, semanaAtual,
    nomeDiaCurto, diaCurto, hoje, indiceDia,
} from '../lib/formato.js';
import {
    mesEmSemanas, cobertura, alertasDaSemana, porData, proximo,
    leituraDeslocamento, moverPara,
} from '../lib/cronograma.js';
import {
    listarFases, listarObjetivos, objetivosDaFase, objetivo, nomeFase,
    leitura, conferir, noDiaCerto,
} from '../lib/diretorio.js';
import { chipFase, chipStatus, seloDeslocado, vazioHTML, STATUS } from '../lib/pecas.js';
import { ativarArraste } from '../lib/arrastar.js';
import { timeSalvo } from '../lib/gestor.js';

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

export const renderCronograma = async (container, clienteId) => {
    const { cliente, conteudos } = await store.doCliente(clienteId);

    if (!cliente) {
        const { content } = renderShell(container, {
            path: '/', title: 'Cliente não encontrado',
            subtitle: 'O cadastro pode ter sido removido.',
            actions: `<a href="/" class="ds-btn ds-btn--primary">Voltar aos clientes</a>`,
        });
        content.innerHTML = '';
        return;
    }

    let mes = chaveMes(proximo(conteudos)?.data || hoje());
    let filtro = 'tudo';
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
            <a class="ds-btn ds-btn--ghost" href="/importar/${esc(clienteId)}">
                <i data-lucide="file-up"></i> Importar
            </a>
            <a class="ds-btn ds-btn--ghost" href="/c/${esc(cliente.token)}" target="_blank" rel="noopener">
                <i data-lucide="external-link"></i> Ver como o cliente vê
            </a>
            <button class="ds-btn ds-btn--primary" id="cr-novo">
                <i data-lucide="plus"></i> Novo conteúdo
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const recarregar = () => renderCronograma(container, clienteId);

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
        content.querySelector('#cr-anterior').addEventListener('click', () => { mes = somarMeses(mes, -1); desenhar(); });
        content.querySelector('#cr-proximo').addEventListener('click', () => { mes = somarMeses(mes, 1); desenhar(); });

        content.querySelector('#cr-filtros').addEventListener('click', (e) => {
            const b = e.target.closest('[data-filtro]');
            if (!b) return;
            filtro = b.dataset.filtro;
            marcarAtivo(content, 'filtro', filtro);
            desenhar();
        });

        content.querySelector('#cr-novo-vazio')?.addEventListener('click',
            () => formularioConteudo(null, cliente, mes, recarregar));

        content.querySelectorAll('[data-conteudo]').forEach(el =>
            el.addEventListener('click', () => navegar(`/conteudo/${el.dataset.conteudo}`)));

        content.querySelector('#cr-liberar')?.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            b.disabled = true;
            b.textContent = 'Liberando…';
            /* Um por vez, sem Promise.all: o adaptador local grava a coleção
               inteira a cada salvar, e disparar dez em paralelo faz a última
               escrita sobrescrever as nove anteriores. */
            for (const c of rascunhos) {
                await store.conteudos.salvar({ ...c, status: 'em_revisao' });
            }
            toast(`${rascunhos.length} conteúdo(s) liberado(s) para o cliente.`);
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

    document.getElementById('cr-novo').addEventListener('click',
        () => formularioConteudo(null, cliente, mes, recarregar));

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

    return `
        <button class="vz-conteudo" data-conteudo="${esc(c.id)}"
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
                ${seloDeslocado(desl)}
            </div>
            <i class="cr-seta" data-lucide="chevron-right"></i>
        </button>`;
};

// ═══════════════════════════════════════════════════════════════════════════
// O FORMULÁRIO — onde a inteligência do diretório aparece enquanto se digita
// ═══════════════════════════════════════════════════════════════════════════

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
export function formularioConteudo(c, cliente, mesSugerido, aoTerminar) {
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

                // 2. A conferência do classificador
                const texto = [v.titulo, v.tema].filter(Boolean).join('. ');
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

            selFase.addEventListener('change', () => { repintarObjetivos(); atualizar(); });
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
