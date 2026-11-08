import { store } from '../store.js';
import { abrirFormulario } from './campos.js';
import { openDrawer, closeDrawer } from './drawer.js';
import { toast } from './toast.js';
import { esc, hoje, dataBR } from '../lib/formato.js';
import { COLUNAS, colunaDe, ativos, euSou, avisarResponsaveis, responsaveisDe, avatarHTML, injectEstilosAvatar } from '../lib/pedidos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PEDIDOS — os painéis que mais de uma tela abre.

   O formulário de pedido nasce na tela de Pedidos e no quadro do cliente; o
   cadastro da equipe, na tela de Pedidos; o aviso de decisões, na demanda.
   Ficam aqui para as telas não terem, cada uma, a sua versão.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Novo pedido, ou edição de um existente.
 *
 * @param {object}   opts
 * @param {object}   [opts.pedido]     o pedido a editar
 * @param {string}   [opts.clienteId]  cliente já decidido (tela do cliente, quadro)
 * @param {object[]} opts.clientes
 * @param {object[]} opts.conteudos    para ligar o pedido a uma demanda
 * @param {object[]} opts.equipe
 * @param {function} opts.aoSalvar     (pedido salvo | null se excluído) => void
 */
export const abrirPedido = ({ pedido = null, clienteId = null, clientes, conteudos, equipe, aoSalvar }) => {
    const fixo = pedido?.cliente_id || clienteId;
    const cliente = fixo ? clientes.find(c => c.id === fixo) : null;
    const pessoas = ativos(equipe);
    const { pessoa: eu } = euSou(equipe);

    /* As demandas do cliente, da mais recente para a mais antiga. Só aparece
       com o cliente decidido: a lista dependeria de outro campo do mesmo
       painel, e quem anota um pedido rápido não precisa disso. */
    const demandas = fixo
        ? conteudos.filter(c => c.cliente_id === fixo)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)))
        : [];

    const campos = [
        ...(fixo ? [] : [{
            nome: 'cliente_id', rotulo: 'Cliente', tipo: 'select', obrigatorio: true,
            opcoes: [{ valor: '', rotulo: 'Escolha o cliente…' },
                     ...clientes.filter(c => c.ativo !== false)
                         .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                         .map(c => ({ valor: c.id, rotulo: c.nome }))],
        }]),
        { nome: 'texto', rotulo: 'O que foi pedido', tipo: 'textarea', obrigatorio: true,
          placeholder: 'Ex.: reel da bioimpedância da paciente, com a reportagem ao fundo' },
        { nome: 'responsaveis', rotulo: 'Quem cuida', tipo: 'multipla',
          opcoes: pessoas.map(p => ({ valor: p.id, rotulo: p.nome.split(' ')[0], prefixo: avatarHTML(p, { tamanho: 22 }) })),
          dica: pessoas.length
              ? 'Marque quantas pessoas precisar. Cada uma recebe um aviso por email.'
              : 'Cadastre a equipe no botão "Equipe" da tela de Pedidos.' },
        { nome: 'prazo', rotulo: 'Prazo', tipo: 'data', largura: 'metade' },
        { nome: 'pedido_em', rotulo: 'Pedido em', tipo: 'data', largura: 'metade' },
        { nome: 'quem_pediu', rotulo: 'Quem pediu',
          placeholder: cliente?.nome || 'Nome de quem pediu' },
        ...(pedido ? [{
            nome: 'status', rotulo: 'Em que pé está', tipo: 'select',
            opcoes: COLUNAS.map(c => ({ valor: c.id, rotulo: `${c.nome} — ${c.dica}` })),
        }] : []),
        ...(demandas.length ? [{
            nome: 'conteudo_id', rotulo: 'Demanda ligada', tipo: 'select',
            opcoes: [{ valor: '', rotulo: '— nenhuma —' },
                     ...demandas.map(c => ({ valor: c.id, rotulo: `${dataBR(c.data).slice(0, 5)} · ${c.titulo}` }))],
            dica: 'Quando o pedido virou (ou vai virar) uma peça do cronograma.',
        }] : []),
        { nome: 'detalhe', rotulo: 'Mensagem original', tipo: 'textarea',
          placeholder: 'Cole aqui o trecho do grupo ou a transcrição do áudio.',
          dica: 'Fica guardada junto do pedido: é o que encerra o "mas ela tinha dito…".' },
    ];

    abrirFormulario({
        titulo: pedido ? 'Editar pedido' : 'Novo pedido',
        subtitulo: cliente?.nome || '',
        campos,
        valores: pedido ? { ...pedido, responsaveis: responsaveisDe(pedido) } : {
            cliente_id: fixo, pedido_em: hoje(), status: 'novo',
            responsaveis: eu ? [eu.id] : [],
        },
        rotuloSalvar: pedido ? 'Salvar' : 'Anotar pedido',
        aoSalvar: async (dados) => {
            const linha = await store.pedidos.salvar({
                ...dados,
                responsaveis: dados.responsaveis || [],
                responsavel_id: null,
                cliente_id: dados.cliente_id || fixo,
                pedido_em: dados.pedido_em || hoje(),
                status: dados.status || 'novo',
                criado_por: pedido?.criado_por || eu?.nome || store.usuario()?.nome || null,
            });
            /* Email só para quem ENTROU agora, e nunca para si mesmo: anotar um
               pedido próprio não precisa de aviso, e editar o prazo não deve
               reavisar ninguém. */
            const antes = new Set(pedido ? responsaveisDe(pedido) : []);
            const novos = pessoas.filter(p => linha.responsaveis?.includes(p.id)
                && !antes.has(p.id) && p.id !== eu?.id);
            toast(pedido ? 'Pedido atualizado.' : 'Pedido anotado.');
            aoSalvar?.(linha);
            if (novos.length) avisarResponsaveis(linha, novos, eu);
        },
        aoExcluir: pedido ? async () => {
            await store.pedidos.excluir(pedido.id);
            toast('Pedido excluído.', {
                label: 'Desfazer',
                onClick: async () => { await store.pedidos.salvar(pedido); aoSalvar?.(pedido); },
            });
            aoSalvar?.(null);
        } : null,
    });
};

/** Nova decisão permanente de um cliente. */
export const abrirDecisao = ({ decisao = null, cliente, equipe, aoSalvar }) => {
    const { pessoa: eu } = euSou(equipe);
    abrirFormulario({
        titulo: decisao ? 'Editar decisão' : 'Nova decisão',
        subtitulo: cliente.nome,
        campos: [{
            nome: 'texto', rotulo: 'A regra', tipo: 'textarea', obrigatorio: true,
            placeholder: 'Ex.: nunca repetir foto de capa em menos de 30 dias',
            dica: 'Aparece no topo de toda demanda deste cliente, para quem for escrever ou montar a arte.',
        }],
        valores: decisao,
        rotuloSalvar: decisao ? 'Salvar' : 'Registrar decisão',
        aoSalvar: async (dados) => {
            const linha = await store.decisoes.salvar({
                ...dados, cliente_id: cliente.id, ativa: decisao?.ativa ?? true,
                criado_por: decisao?.criado_por || eu?.nome || store.usuario()?.nome || null,
            });
            toast(decisao ? 'Decisão atualizada.' : 'Decisão registrada.');
            aoSalvar?.(linha);
        },
        aoExcluir: decisao ? async () => {
            await store.decisoes.excluir(decisao.id);
            toast('Decisão excluída.');
            aoSalvar?.(null);
        } : null,
    });
};

/* ── EQUIPE ───────────────────────────────────────────────────────────────
   Nome e email de quem pode ser marcado. Tirar alguém NÃO apaga: a pessoa sai
   da lista de responsáveis, e os pedidos antigos continuam dizendo quem fez —
   o histórico deve dizer quem fez, não quem ainda está. */
export const abrirEquipe = ({ equipe, aoSalvar }) => {
    let linhas = ativos(equipe).map(p => ({ ...p }));
    if (!linhas.length) linhas = [{ nome: '', email: '' }];

    const linhaHTML = (p, i) => `
        <div class="pd-eq__linha" data-i="${i}">
            <input class="ds-input" data-campo="nome" placeholder="Nome" value="${esc(p.nome || '')}" autocomplete="off">
            <input class="ds-input" data-campo="email" type="email" inputmode="email" placeholder="email@exemplo.com"
                   value="${esc(p.email || '')}" autocomplete="off">
            <select class="ds-input pd-eq__papel" data-campo="papel" aria-label="Papel de ${esc(p.nome || 'quem está nesta linha')}"
                    title="Admin organiza o mês e manda o aviso de mês organizado">
                <option value="equipe" ${p.papel !== 'admin' ? 'selected' : ''}>Equipe</option>
                <option value="admin" ${p.papel === 'admin' ? 'selected' : ''}>Admin</option>
            </select>
            <button type="button" class="ds-icon-btn ds-icon-btn--sm" data-tirar="${i}" title="Tirar da equipe" aria-label="Tirar da equipe">
                <i data-lucide="x"></i>
            </button>
        </div>`;

    openDrawer({
        title: 'Equipe',
        subtitle: 'Quem entra no Chronos e pode ser marcado num pedido',
        body: `
            <div class="pd-eq">
                <div id="pd-eq-linhas"></div>
                <button type="button" class="ds-btn ds-btn--ghost ds-btn--sm" id="pd-eq-mais">
                    <i data-lucide="plus"></i> Adicionar pessoa
                </button>
                <p class="ds-hint"><i data-lucide="mail"></i>
                    Use o email da conta Google da pessoa: é com ele que ela entra no Chronos, e é
                    para ele que vão os avisos. Quem sai da lista perde o acesso.
                </p>
                <p class="pd-eq__erro" id="pd-eq-erro" hidden></p>
            </div>`,
        footer: `
            <span style="flex:1"></span>
            <button type="button" class="ds-btn ds-btn--ghost" data-dw-close>Cancelar</button>
            <button type="button" class="ds-btn ds-btn--primary" id="pd-eq-salvar">Salvar equipe</button>`,
        onMount: (painel) => {
            injectEstilosPedidos();
            const caixa = painel.querySelector('#pd-eq-linhas');
            const ler = () => caixa.querySelectorAll('.pd-eq__linha').forEach(el => {
                const p = linhas[Number(el.dataset.i)];
                p.nome = el.querySelector('[data-campo="nome"]').value.trim();
                p.email = el.querySelector('[data-campo="email"]').value.trim();
                p.papel = el.querySelector('[data-campo="papel"]').value;
            });
            const desenhar = () => {
                caixa.innerHTML = linhas.map((p, i) => p.tirar ? '' : linhaHTML(p, i)).join('');
                if (window.lucide) lucide.createIcons();
            };
            desenhar();

            painel.querySelector('#pd-eq-mais').addEventListener('click', () => {
                ler();
                linhas.push({ nome: '', email: '' });
                desenhar();
                caixa.querySelector('.pd-eq__linha:last-child [data-campo="nome"]')?.focus();
            });
            caixa.addEventListener('click', (e) => {
                const b = e.target.closest('[data-tirar]');
                if (!b) return;
                ler();
                linhas[Number(b.dataset.tirar)].tirar = true;
                desenhar();
            });

            const erro = painel.querySelector('#pd-eq-erro');
            const botao = painel.querySelector('#pd-eq-salvar');
            botao.addEventListener('click', async () => {
                ler();
                const validas = linhas.filter(p => !p.tirar && (p.nome || p.email));
                const semNome = validas.find(p => !p.nome);
                const emailRuim = validas.find(p => p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
                if (semNome || emailRuim) {
                    erro.textContent = semNome ? 'Toda pessoa precisa de um nome.' : `O email "${emailRuim.email}" não parece certo.`;
                    erro.hidden = false;
                    return;
                }
                botao.disabled = true;
                botao.textContent = 'Salvando…';
                try {
                    for (const p of linhas) {
                        if (p.tirar && p.id) await store.equipe.salvar({ ...p, tirar: undefined, ativo: false });
                    }
                    for (const p of validas) {
                        const { tirar, ...limpo } = p;
                        await store.equipe.salvar({ ...limpo, email: limpo.email?.toLowerCase() || null,
                                                    papel: limpo.papel || 'equipe', ativo: true });
                    }
                    closeDrawer();
                    toast('Equipe salva.');
                    aoSalvar?.();
                } catch (e) {
                    console.error('[pedidos] equipe:', e);
                    erro.textContent = e.message || 'Não foi possível salvar.';
                    erro.hidden = false;
                    botao.disabled = false;
                    botao.textContent = 'Salvar equipe';
                }
            });
        },
    });
};

/* ── AS DECISÕES NO TOPO DA DEMANDA ───────────────────────────────────────
   O lugar onde a regra precisa estar é onde o trabalho acontece: quem abre a
   demanda para escrever o roteiro ou montar a capa lê as regras do cliente
   antes de começar, sem ter de lembrar que elas existem. */
export const decisoesHTML = (decisoes, cliente) => {
    const ativas = decisoes.filter(d => d.ativa !== false);
    if (!ativas.length) return '';
    return `
        <details class="pd-regras" open>
            <summary>
                <i data-lucide="pin"></i>
                <span>Decisões de ${esc(cliente?.nome || 'cliente')}</span>
                <span class="pd-regras__conta">${ativas.length}</span>
                <a class="pd-regras__ver" href="/pedidos/${esc(cliente?.id || '')}">ver pedidos</a>
            </summary>
            <ul>${ativas.map(d => `<li>${esc(d.texto)}</li>`).join('')}</ul>
        </details>`;
};

/* Os pedidos que esta demanda atende, abertos: quem trabalha na peça vê o
   que o cliente pediu dela, nas palavras do pedido. */
export const pedidosDaDemandaHTML = (pedidos) => {
    const abertos = pedidos.filter(p => p.status !== 'confirmado');
    if (!abertos.length) return '';
    return `
        <div class="pd-ligados">
            <i data-lucide="list-checks"></i>
            <div>
                <b>Pedido${abertos.length > 1 ? 's' : ''} do cliente ligado${abertos.length > 1 ? 's' : ''} a esta demanda</b>
                <ul>${abertos.map(p => `<li>${esc(p.texto)} <span>· ${esc(colunaDe(p.status).nome.toLowerCase())}</span></li>`).join('')}</ul>
            </div>
        </div>`;
};

export function injectEstilosPedidos() {
    injectEstilosAvatar();
    if (document.getElementById('pedidos-estilos')) return;
    const style = document.createElement('style');
    style.id = 'pedidos-estilos';
    style.textContent = `
        .pd-avatar--vazio {
            background: transparent; color: var(--text-disabled);
            border: 1px dashed var(--border-default);
        }
        .pd-avatar--vazio svg { width: 60%; height: 60%; }

        .pd-eq { display: flex; flex-direction: column; gap: var(--space-3); }
        /* Nome e papel em cima, email inteiro embaixo: o email é o que mais
           precisa ser lido por completo — é ele que abre a porta do login. */
        .pd-eq__linha { display: grid; grid-template-columns: 1fr 110px auto; grid-template-areas: "nome papel tirar" "email email ."; gap: var(--space-2); align-items: center;
            padding-bottom: var(--space-2); border-bottom: 1px solid var(--border-subtle); }
        .pd-eq__linha [data-campo="nome"] { grid-area: nome; }
        .pd-eq__linha [data-campo="email"] { grid-area: email; }
        .pd-eq__linha [data-campo="papel"] { grid-area: papel; }
        .pd-eq__linha [data-tirar] { grid-area: tirar; }
        #pd-eq-linhas { display: flex; flex-direction: column; gap: var(--space-2); }
        #pd-eq-mais { align-self: flex-start; }
        .pd-eq__erro { margin: 0; font-size: var(--text-sm); color: var(--danger); }

        .pd-regras {
            border: 1px solid var(--accent-border); border-radius: var(--radius-md);
            background: var(--accent-muted); padding: var(--space-3) var(--space-4);
        }
        .pd-regras summary {
            display: flex; align-items: center; gap: var(--space-2); cursor: pointer; list-style: none;
            font-size: var(--text-sm); font-weight: 700; color: var(--text-primary);
        }
        .pd-regras summary::-webkit-details-marker { display: none; }
        .pd-regras summary svg { width: 15px; height: 15px; color: var(--accent); }
        .pd-regras__conta {
            min-width: 20px; padding: 0 6px; border-radius: var(--radius-pill);
            background: var(--accent); color: var(--surface-0); font-size: 11px; line-height: 18px; text-align: center;
        }
        .pd-regras__ver { margin-left: auto; font-size: var(--text-xs); font-weight: 600; color: var(--accent); }
        .pd-regras ul { margin: var(--space-2) 0 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: 4px; }
        .pd-ligados {
            display: flex; gap: var(--space-3); align-items: flex-start;
            padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
            border: 1px solid var(--border-subtle); background: var(--surface-1); font-size: var(--text-sm);
        }
        .pd-ligados > svg { width: 16px; height: 16px; color: var(--warning); flex-shrink: 0; margin-top: 2px; }
        .pd-ligados ul { margin: 4px 0 0; padding-left: var(--space-4); color: var(--text-secondary); }
        .pd-ligados li span { color: var(--text-tertiary); }
        .pd-regras li { font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
    `;
    document.head.appendChild(style);
}
