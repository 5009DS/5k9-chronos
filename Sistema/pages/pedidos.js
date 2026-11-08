import { store } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { toast } from '../components/toast.js';
import { abrirMenu } from '../components/menu.js';
import { caminhoDoConteudo } from '../lib/rotas.js';
import { esc, escLinhas } from '../lib/formato.js';
import { vazioHTML } from '../lib/pecas.js';
import { ativarArraste } from '../lib/arrastar.js';
import {
    COLUNAS, colunaDe, aberto, atrasado, ativos, euSou, lembrarEu,
    avatarHTML, avataresHTML, responsaveisDe, prazoTexto, idadeTexto, comStatus,
} from '../lib/pedidos.js';
import { abrirPedido, abrirDecisao, abrirEquipe, injectEstilosPedidos } from '../components/pedidos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PEDIDOS — o que os clientes pediram, de quem é e em que pé está.

   Duas portas para a mesma tela:
     /pedidos       todos os clientes — a pergunta "o que está comigo?"
     /pedidos/:id   um cliente — a pergunta "o que a Dra. pediu e ainda não
                    viu pronto?", com as decisões dela no topo

   ── QUATRO COLUNAS, E A ÚLTIMA É DO CLIENTE ───────────────────────────────
   Novo → Fazendo → Entregue → Confirmado. Arrastar muda a coluna. "Entregue"
   é a equipe dizendo que fez; só "Confirmado" fecha o assunto — é o cliente
   dizendo que viu. Sem essa separação, o pedido fecha no "pode deixar".

   A coluna Confirmado mostra só os últimos 30 dias: o que fechou há meses é
   história, e uma coluna que só cresce empurra o que importa para fora da tela.
   ═══════════════════════════════════════════════════════════════════════════ */

const JANELA_CONFIRMADOS = 30;   // dias

/* O filtro de pessoa e de cliente sobrevive ao redesenho que cada arraste
   provoca. Em memória: é estado de navegação, não preferência. */
const FILTRO = new Map();

export const renderPedidos = async (container, clienteId = null) => {
    const { clientes, conteudos } = await store.tudo();
    let pedidosTodos, decisoesTodas, equipe, erro = null;
    try {
        [pedidosTodos, decisoesTodas, equipe] = await Promise.all(
            [store.pedidos.listar(), store.decisoes.listar(), store.equipe.listar()]);
    } catch (e) { erro = e; }

    // As tabelas ainda não existem: a migração não foi rodada.
    if (erro) {
        const { content } = renderShell(container, { path: '/pedidos', title: 'Pedidos' });
        content.innerHTML = `
            <article class="ds-card vz-secao">
                ${vazioHTML('database', 'Falta preparar o banco',
                    'Rode Sistema/db/migracao-pedidos.sql no SQL Editor do Supabase e recarregue a página.')}
            </article>`;
        console.error('[pedidos]', erro);
        return;
    }

    const cliente = clienteId ? clientes.find(c => c.id === clienteId) : null;
    if (clienteId && !cliente) {
        const { content } = renderShell(container, {
            path: '/pedidos', title: 'Cliente não encontrado',
            actions: `<a href="/pedidos" class="ds-btn ds-btn--primary">Ver todos os pedidos</a>`,
        });
        content.innerHTML = '';
        return;
    }

    const pessoas = ativos(equipe);
    const pessoaPorId = new Map(equipe.map(p => [p.id, p]));
    const nomeCliente = new Map(clientes.map(c => [c.id, c.nome]));
    const conteudoPorId = new Map(conteudos.map(c => [c.id, c]));
    const { pessoa: eu, pelaSessao } = euSou(equipe);

    const pedidos = pedidosTodos.filter(p => !clienteId || p.cliente_id === clienteId);
    const decisoes = clienteId ? decisoesTodas.filter(d => d.cliente_id === clienteId && d.ativa !== false) : [];

    const chave = clienteId || '*';
    let { quem = 'todos', doCliente = '' } = FILTRO.get(chave) || {};
    const lembrar = () => FILTRO.set(chave, { quem, doCliente });

    const abertos = pedidos.filter(aberto);
    const atrasados = abertos.filter(atrasado);

    const { content } = renderShell(container, {
        path: '/pedidos',
        crumbs: cliente ? [{ href: '/pedidos', label: 'Pedidos' }] : null,
        title: cliente ? esc(cliente.nome) : 'Pedidos',
        subtitle: `${abertos.length} em aberto`
            + (atrasados.length ? ` · ${atrasados.length} atrasado${atrasados.length > 1 ? 's' : ''}` : '')
            + (cliente ? '' : ' · tudo o que os clientes pediram, de quem é e em que pé está'),
        actions: `
            ${cliente ? `
                <a class="ds-btn ds-btn--ghost" href="/quadro/${esc(cliente.id)}">
                    <i data-lucide="layout-grid"></i> Quadro do mês
                </a>` : ''}
            <button class="ds-btn ds-btn--ghost" id="pd-equipe">
                <i data-lucide="users-round"></i> Equipe
            </button>
            <button class="ds-btn ds-btn--primary" id="pd-novo">
                <i data-lucide="plus"></i> Novo pedido
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);
    injectEstilosPedidos();

    const recarregar = () => renderPedidos(container, clienteId);

    document.getElementById('pd-equipe')?.addEventListener('click', () =>
        abrirEquipe({ equipe, aoSalvar: recarregar }));
    document.getElementById('pd-novo')?.addEventListener('click', () =>
        abrirPedido({ clienteId: clienteId || doCliente || null, clientes, conteudos, equipe, aoSalvar: recarregar }));

    let soltarArraste = null;

    const filtrados = () => pedidos.filter(p => {
        if (!clienteId && doCliente && p.cliente_id !== doCliente) return false;
        if (quem === 'todos') return true;
        if (quem === 'ninguem') return !responsaveisDe(p).length;
        return responsaveisDe(p).includes(quem);
    });

    const daColuna = (col, lista) => {
        const itens = lista.filter(p => (p.status || 'novo') === col);
        if (col === 'confirmado') {
            return itens
                .sort((a, b) => String(b.concluido_em || '').localeCompare(String(a.concluido_em || '')));
        }
        /* Atrasado primeiro, depois quem tem prazo mais perto, depois o mais
           antigo: é a ordem em que alguém deveria pegar. */
        return itens.sort((a, b) =>
            (atrasado(b) - atrasado(a))
            || String(a.prazo || '9999').localeCompare(String(b.prazo || '9999'))
            || String(a.pedido_em || '').localeCompare(String(b.pedido_em || '')));
    };

    const cartao = (p) => {
        const resp = responsaveisDe(p).map(id => pessoaPorId.get(id)).filter(Boolean);
        const prazo = prazoTexto(p);
        const demanda = conteudoPorId.get(p.conteudo_id);
        const idx = COLUNAS.findIndex(c => c.id === (p.status || 'novo'));
        const proxima = COLUNAS[idx + 1];
        return `
        <article class="pd-cartao ${atrasado(p) ? 'pd-cartao--atrasado' : ''}" data-arrastavel="${esc(p.id)}">
            <div class="pd-cartao__topo">
                ${clienteId ? '' : `<span class="pd-cartao__cliente">${esc(nomeCliente.get(p.cliente_id) || 'Cliente removido')}</span>`}
                <span class="pd-cartao__idade">${esc(idadeTexto(p))}${p.quem_pediu ? ` · ${esc(p.quem_pediu)}` : ''}</span>
            </div>
            <button type="button" class="pd-cartao__texto" data-editar="${esc(p.id)}">${esc(p.texto)}</button>
            ${p.detalhe ? `<span class="pd-cartao__marca" title="${esc(p.detalhe.slice(0, 300))}"><i data-lucide="quote"></i> mensagem original</span>` : ''}
            <div class="pd-cartao__pe">
                ${avataresHTML(resp)}
                ${prazo ? `<span class="pd-prazo pd-prazo--${prazo.tom}"><i data-lucide="calendar-clock"></i>${esc(prazo.texto)}</span>` : ''}
                ${demanda ? `<a class="pd-demanda" href="${esc(caminhoDoConteudo(demanda))}" title="${esc(demanda.titulo)}"><i data-lucide="file-text"></i></a>` : ''}
                <span class="pd-cartao__espaco"></span>
                ${proxima ? `
                    <button type="button" class="ds-icon-btn ds-icon-btn--sm pd-avancar" data-avancar="${esc(p.id)}"
                            title="Mover para ${esc(proxima.nome)}" aria-label="Mover para ${esc(proxima.nome)}">
                        <i data-lucide="arrow-right"></i>
                    </button>` : ''}
                <button type="button" class="ds-icon-btn ds-icon-btn--sm" data-menu="${esc(p.id)}" aria-label="Mais ações" aria-haspopup="menu">
                    <i data-lucide="ellipsis"></i>
                </button>
            </div>
        </article>`;
    };

    const mover = async (id, status) => {
        const p = pedidos.find(x => x.id === id);
        if (!p || (p.status || 'novo') === status) return;
        const antes = { ...p };
        Object.assign(p, await store.pedidos.salvar(comStatus(p, status)));
        toast(status === 'confirmado'
            ? 'Fechado: o cliente confirmou.'
            : `Movido para ${colunaDe(status).nome}.`, {
            label: 'Desfazer',
            onClick: async () => { await store.pedidos.salvar(antes); recarregar(); },
        });
        // Recarrega e não só redesenha: a contagem do topo (em aberto,
        // atrasados) também muda. A leitura vem do cache, sem ir ao banco.
        recarregar();
    };

    const editar = (p) => abrirPedido({ pedido: p, clientes, conteudos, equipe, aoSalvar: recarregar });

    const desenhar = () => {
        soltarArraste?.();
        const lista = filtrados();
        const limite = new Date(Date.now() - JANELA_CONFIRMADOS * 86_400_000).toISOString();

        const chipQuem = (id, rotulo, extra = '') => `
            <button type="button" class="pd-filtro ${quem === id ? 'is-active' : ''}" data-quem="${esc(id)}">${extra}${esc(rotulo)}</button>`;

        content.innerHTML = `
            ${!pessoas.length ? `
                <div class="pd-aviso">
                    <i data-lucide="users-round"></i>
                    <span>Cadastre a equipe (nome e email) para marcar quem cuida de cada pedido.</span>
                    <button class="ds-btn ds-btn--primary ds-btn--sm" id="pd-equipe-2">Cadastrar equipe</button>
                </div>` : ''}

            ${cliente ? `
                <section class="pd-decisoes">
                    <header>
                        <div>
                            <h2 class="pd-decisoes__titulo"><i data-lucide="pin"></i> Decisões de ${esc(cliente.nome)}</h2>
                            <span class="ds-card-sub">Regras que valem sempre. Aparecem no topo de toda demanda deste cliente.</span>
                        </div>
                        <button class="ds-btn ds-btn--ghost ds-btn--sm" id="pd-decisao"><i data-lucide="plus"></i> Decisão</button>
                    </header>
                    ${decisoes.length ? `
                        <ul>${decisoes.map(d => `
                            <li>
                                <button type="button" class="pd-decisao__texto" data-decisao="${esc(d.id)}">${escLinhas(d.texto)}</button>
                                <button type="button" class="ds-icon-btn ds-icon-btn--sm" data-arquivar="${esc(d.id)}"
                                        title="Não vale mais" aria-label="Arquivar decisão"><i data-lucide="archive"></i></button>
                            </li>`).join('')}
                        </ul>` : `
                        <p class="pd-decisoes__vazio">Nenhuma ainda. Ex.: "nunca repetir foto de capa em menos de 30 dias", "reels de até 30 s".</p>`}
                </section>` : ''}

            <div class="pd-barra">
                ${pessoas.length ? `
                    <div class="pd-filtros" role="group" aria-label="Filtrar por pessoa">
                        ${chipQuem('todos', 'Todos')}
                        ${eu ? chipQuem(eu.id, 'Comigo', avatarHTML(eu, { tamanho: 18 })) : ''}
                        ${pessoas.filter(p => p.id !== eu?.id).map(p => chipQuem(p.id, p.nome.split(' ')[0], avatarHTML(p, { tamanho: 18 }))).join('')}
                        ${chipQuem('ninguem', 'Sem responsável')}
                    </div>` : ''}
                ${!clienteId ? `
                    <select class="ds-input pd-cliente" id="pd-cliente" aria-label="Filtrar por cliente">
                        <option value="">Todos os clientes</option>
                        ${clientes.filter(c => c.ativo !== false || pedidos.some(p => p.cliente_id === c.id))
                            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                            .map(c => `<option value="${esc(c.id)}" ${doCliente === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
                    </select>` : ''}
                ${pessoas.length && !pelaSessao ? `
                    <label class="pd-eu">
                        <span>Você é</span>
                        <select class="ds-input" id="pd-eu">
                            <option value="">—</option>
                            ${pessoas.map(p => `<option value="${esc(p.id)}" ${eu?.id === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
                        </select>
                    </label>` : ''}
            </div>

            <div class="pd-quadro" id="pd-quadro">
                ${COLUNAS.map(col => {
                    let itens = daColuna(col.id, lista);
                    let antigos = 0;
                    if (col.id === 'confirmado') {
                        const recentes = itens.filter(p => !p.concluido_em || p.concluido_em >= limite);
                        antigos = itens.length - recentes.length;
                        itens = recentes;
                    }
                    return `
                    <section class="pd-coluna pd-coluna--${col.id}" data-solta="${col.id}">
                        <header class="pd-coluna__cabeca">
                            <i data-lucide="${col.icone}"></i>
                            <span class="pd-coluna__nome">${esc(col.nome)}</span>
                            <span class="pd-coluna__conta">${itens.length}</span>
                        </header>
                        <p class="pd-coluna__dica">${esc(col.dica)}</p>
                        <div class="pd-coluna__itens">
                            ${itens.length ? itens.map(cartao).join('') : '<p class="pd-vazio">—</p>'}
                            ${antigos ? `<p class="pd-antigos">+ ${antigos} confirmado${antigos > 1 ? 's' : ''} há mais de ${JANELA_CONFIRMADOS} dias</p>` : ''}
                        </div>
                    </section>`;
                }).join('')}
            </div>

            ${!pedidos.length ? `
                <p class="pd-primeiro">
                    <i data-lucide="lightbulb"></i>
                    Todo pedido que chegar no grupo — inclusive em áudio — vira um cartão aqui. Cole o trecho
                    da mensagem em "Mensagem original": fica como registro do que foi pedido.
                </p>` : ''}
        `;

        content.querySelector('#pd-equipe-2')?.addEventListener('click', () =>
            abrirEquipe({ equipe, aoSalvar: recarregar }));

        content.querySelector('.pd-filtros')?.addEventListener('click', (e) => {
            const b = e.target.closest('[data-quem]');
            if (!b) return;
            quem = b.dataset.quem;
            lembrar();
            desenhar();
        });
        content.querySelector('#pd-cliente')?.addEventListener('change', (e) => {
            doCliente = e.target.value;
            lembrar();
            desenhar();
        });
        content.querySelector('#pd-eu')?.addEventListener('change', (e) => {
            lembrarEu(e.target.value || null);
            recarregar();
        });

        content.querySelector('#pd-decisao')?.addEventListener('click', () =>
            abrirDecisao({ cliente, equipe, aoSalvar: recarregar }));
        content.querySelectorAll('[data-decisao]').forEach(b => b.addEventListener('click', () => {
            const d = decisoes.find(x => x.id === b.dataset.decisao);
            if (d) abrirDecisao({ decisao: d, cliente, equipe, aoSalvar: recarregar });
        }));
        content.querySelectorAll('[data-arquivar]').forEach(b => b.addEventListener('click', async () => {
            const d = decisoes.find(x => x.id === b.dataset.arquivar);
            if (!d) return;
            await store.decisoes.salvar({ ...d, ativa: false });
            toast('Decisão arquivada.', {
                label: 'Desfazer',
                onClick: async () => { await store.decisoes.salvar({ ...d, ativa: true }); recarregar(); },
            });
            recarregar();
        }));

        const quadro = content.querySelector('#pd-quadro');
        quadro.addEventListener('click', (e) => {
            const ed = e.target.closest('[data-editar]');
            if (ed) { const p = pedidos.find(x => x.id === ed.dataset.editar); if (p) editar(p); return; }

            const av = e.target.closest('[data-avancar]');
            if (av) {
                const p = pedidos.find(x => x.id === av.dataset.avancar);
                const idx = COLUNAS.findIndex(c => c.id === (p?.status || 'novo'));
                if (p && COLUNAS[idx + 1]) mover(p.id, COLUNAS[idx + 1].id);
                return;
            }

            const mn = e.target.closest('[data-menu]');
            if (mn) {
                e.stopPropagation();
                const p = pedidos.find(x => x.id === mn.dataset.menu);
                if (!p) return;
                const demanda = conteudoPorId.get(p.conteudo_id);
                abrirMenu(mn, [
                    { id: 'editar', label: 'Editar', icon: 'pencil', onClick: () => editar(p) },
                    ...COLUNAS.filter(c => c.id !== (p.status || 'novo')).map((c, i) => ({
                        id: `mover-${c.id}`, label: `Mover para ${c.nome}`, icon: c.icone,
                        separadorAntes: i === 0, onClick: () => mover(p.id, c.id),
                    })),
                    ...(pessoas.length ? [eu ? (() => {
                        /* Entrar e sair do pedido, sem tirar os outros: com
                           várias pessoas, "pegar para mim" substituiria quem já
                           estava cuidando. */
                        const lista = responsaveisDe(p);
                        const estou = lista.includes(eu.id);
                        return {
                            id: 'eu', label: estou ? 'Sair deste pedido' : 'Entrar neste pedido',
                            icon: estou ? 'user-round-minus' : 'user-round-plus', separadorAntes: true,
                            onClick: async () => {
                                await store.pedidos.salvar({
                                    ...p, responsavel_id: null,
                                    responsaveis: estou ? lista.filter(id => id !== eu.id) : [...lista, eu.id],
                                });
                                toast(estou ? 'Você saiu do pedido.' : 'Você entrou no pedido.');
                                recarregar();
                            },
                        };
                    })() : null, {
                        id: 'quem', label: 'Mudar quem cuida…', icon: 'users-round',
                        separadorAntes: !eu, onClick: () => editar(p),
                    }].filter(Boolean) : []),
                    ...(demanda ? [{ id: 'demanda', label: 'Abrir a demanda', icon: 'file-text', href: caminhoDoConteudo(demanda) }] : []),
                    ...(clienteId ? [] : [{ id: 'cliente', label: 'Pedidos deste cliente', icon: 'filter', href: `/pedidos/${p.cliente_id}` }]),
                ]);
            }
        });

        soltarArraste = ativarArraste(quadro, {
            item: '[data-arrastavel]',
            alvo: '[data-solta]',
            aoSoltar: (id, coluna) => mover(id, coluna),
        });

        if (window.lucide) lucide.createIcons();
    };

    desenhar();
};

const ESTILOS = `
<style>
.pd-aviso {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4);
    border: 1px solid var(--accent-border); border-radius: var(--radius-md);
    background: var(--accent-muted); font-size: var(--text-sm);
}
.pd-aviso > svg { width: 18px; height: 18px; color: var(--accent); }
.pd-aviso span { flex: 1; min-width: 200px; }

.pd-decisoes {
    margin-bottom: var(--space-5); padding: var(--space-4) var(--space-5);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-1);
}
.pd-decisoes header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); }
.pd-decisoes__titulo {
    display: flex; align-items: center; gap: var(--space-2); margin: 0 0 2px;
    font-size: var(--text-body); font-weight: 700; color: var(--text-primary);
}
.pd-decisoes__titulo svg { width: 16px; height: 16px; color: var(--accent); }
.pd-decisoes ul { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.pd-decisoes li { display: flex; align-items: center; gap: var(--space-2); border-radius: var(--radius-sm); }
.pd-decisoes li:hover { background: var(--surface-2); }
.pd-decisao__texto {
    flex: 1; text-align: left; padding: 6px var(--space-2); border: 0; background: none; cursor: pointer;
    font: inherit; font-size: var(--text-sm); color: var(--text-primary); line-height: var(--leading-body);
}
.pd-decisao__texto::before { content: "•"; color: var(--accent); margin-right: 8px; font-weight: 700; }
.pd-decisoes__vazio { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-tertiary); }

.pd-barra { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); }
.pd-filtros { display: flex; flex-wrap: wrap; gap: 6px; }
.pd-filtro {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 32px; padding: 0 12px 0 8px; border-radius: var(--radius-pill);
    border: 1px solid var(--border-subtle); background: var(--surface-1);
    font: inherit; font-size: var(--text-sm); font-weight: 600; color: var(--text-secondary); cursor: pointer;
}
.pd-filtro:not(:has(.pd-avatar)) { padding-left: 12px; }
.pd-filtro:hover { color: var(--text-primary); border-color: var(--border-default); }
.pd-filtro.is-active { background: var(--accent-muted); border-color: var(--accent); color: var(--accent); }
.pd-cliente { width: auto; min-width: 200px; }
.pd-eu { display: inline-flex; align-items: center; gap: var(--space-2); margin-left: auto; font-size: var(--text-sm); color: var(--text-tertiary); }
.pd-eu select { width: auto; }

.pd-quadro { display: grid; grid-template-columns: repeat(4, minmax(240px, 1fr)); gap: var(--space-3); align-items: start; overflow-x: auto; padding-bottom: var(--space-2); }
.pd-coluna {
    display: flex; flex-direction: column; gap: var(--space-2); min-height: 200px;
    padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-2);
}
.pd-coluna.ar-sobre { border-color: var(--accent); background: var(--accent-muted); }
.pd-coluna__cabeca {
    display: flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: var(--tracking-wide);
    color: var(--text-tertiary);
}
.pd-coluna__cabeca svg { width: 14px; height: 14px; }
.pd-coluna--fazendo .pd-coluna__cabeca { color: var(--info); }
.pd-coluna--entregue .pd-coluna__cabeca { color: var(--warning); }
.pd-coluna--confirmado .pd-coluna__cabeca { color: var(--success); }
.pd-coluna__nome { flex: 1; }
.pd-coluna__conta {
    min-width: 22px; padding: 0 6px; border-radius: var(--radius-pill);
    background: var(--surface-3); color: var(--text-secondary); font-size: 11px; line-height: 18px; text-align: center;
}
.pd-coluna__dica { margin: 0; font-size: 11px; color: var(--text-disabled); }
.pd-coluna__itens { display: flex; flex-direction: column; gap: var(--space-2); }
.pd-vazio { margin: 0; padding: var(--space-4) 0; text-align: center; color: var(--text-disabled); }
.pd-antigos { margin: 0; font-size: 11px; color: var(--text-tertiary); text-align: center; }

.pd-cartao {
    display: flex; flex-direction: column; gap: 6px;
    padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm);
    background: var(--surface-1); cursor: grab;
}
.pd-cartao--atrasado { border-left: 3px solid var(--danger); }
.pd-coluna--confirmado .pd-cartao { opacity: 0.7; }
.pd-cartao__topo { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
.pd-cartao__cliente { font-size: 11px; font-weight: 700; color: var(--accent); }
.pd-cartao__idade { font-size: 11px; color: var(--text-tertiary); }
.pd-cartao__texto {
    padding: 0; border: 0; background: none; text-align: left; cursor: pointer;
    font: inherit; font-size: var(--text-sm); font-weight: 600; line-height: var(--leading-snug); color: var(--text-primary);
    display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.pd-cartao__texto:hover { color: var(--accent); }
.pd-coluna--confirmado .pd-cartao__texto { text-decoration: line-through; text-decoration-color: var(--text-disabled); }
.pd-cartao__marca { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-tertiary); }
.pd-cartao__marca svg { width: 11px; height: 11px; }
.pd-cartao__pe { display: flex; align-items: center; gap: 6px; }
.pd-cartao__espaco { flex: 1; }
.pd-prazo { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--text-tertiary); }
.pd-prazo svg { width: 12px; height: 12px; }
.pd-prazo--atencao { color: var(--warning); }
.pd-prazo--risco { color: var(--danger); }
.pd-demanda { display: inline-grid; place-items: center; color: var(--text-tertiary); }
.pd-demanda:hover { color: var(--accent); }
.pd-demanda svg { width: 14px; height: 14px; }
.pd-avancar { opacity: 0; transition: opacity var(--dur-fast); }
.pd-cartao:hover .pd-avancar, .pd-avancar:focus-visible { opacity: 1; }
@media (hover: none) { .pd-avancar { opacity: 1; } }

.pd-primeiro {
    display: flex; gap: var(--space-2); align-items: flex-start; margin: var(--space-5) 0 0;
    font-size: var(--text-sm); color: var(--text-tertiary); max-width: 70ch;
}
.pd-primeiro svg { width: 16px; height: 16px; flex-shrink: 0; margin-top: 2px; color: var(--accent); }

@media (max-width: 720px) {
    .pd-quadro { grid-template-columns: repeat(4, 82vw); }
    .pd-eu { margin-left: 0; }
}
</style>
`;
