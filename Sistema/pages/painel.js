import { store, gerarToken } from '../store.js';
import { renderShell } from '../components/pageshell.js';
import { abrirFormulario } from '../components/campos.js';
import { abrirMenu } from '../components/menu.js';
import { toast } from '../components/toast.js';
import { navegar } from '../lib/rotas.js';
import { openDrawer, closeDrawer } from '../components/drawer.js';
import { lerCartela, PONTE_LIGADA } from '../lib/gestor.js';
import { linkDoCliente } from '../lib/apelido.js';
import { esc, semAcento, mesAtual, chaveMes, dataBR, quandoRelativo, diaCurto } from '../lib/formato.js';
import { proximo, contarPorStatus, retornosDe, porData } from '../lib/cronograma.js';
import { vazioHTML } from '../lib/pecas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL — a lista de clientes e o que precisa de resposta.

   A primeira coisa da tela não são os clientes: é o que o CLIENTE devolveu.
   Um pedido de ajuste que fica dias sem resposta é a falha mais cara desta
   ferramenta, porque ela existe justamente para tirar essa conversa do
   WhatsApp — e uma conversa que ninguém responde volta para o WhatsApp.

   Por isso "Precisa de você" fica acima da lista, e some quando está vazio.
   ═══════════════════════════════════════════════════════════════════════════ */

export const renderPainel = async (container) => {
    const { clientes, conteudos, retornos } = await store.tudo();

    const { content } = renderShell(container, {
        path: '/',
        title: 'Clientes',
        subtitle: 'Cada cliente tem um link próprio com o cronograma e os roteiros dele.',
        actions: `
            ${PONTE_LIGADA ? `
                <button class="ds-btn ds-btn--ghost" id="pn-gestor">
                    <i data-lucide="arrow-down-up"></i> Trazer do Gestor
                </button>` : ''}
            <button class="ds-btn ds-btn--primary" id="pn-novo">
                <i data-lucide="plus"></i> Novo cliente
            </button>`,
    });

    container.insertAdjacentHTML('beforeend', ESTILOS);

    const ativos = clientes.filter(c => c.ativo !== false);
    const aguardando = conteudos.filter(c => c.status === 'em_revisao');
    const ajustes = conteudos.filter(c => c.status === 'ajuste');
    const doMes = conteudos.filter(c => chaveMes(c.data) === mesAtual());

    content.innerHTML = `
        <div class="vz-kpis">
            ${kpi('users', 'Clientes ativos', ativos.length, 'clientes')}
            ${kpi('eye', 'Aguardando aprovação', aguardando.length, 'espera')}
            ${kpi('message-circle-warning', 'Ajustes pedidos', ajustes.length, 'ajuste')}
            ${kpi('calendar', 'Conteúdos neste mês', doMes.length, 'programado')}
        </div>

        ${ajustes.length ? `
            <article class="ds-card vz-secao">
                <div class="vz-secao__cabeca">
                    <div>
                        <h2 class="ds-card-title">Precisa de você</h2>
                        <span class="ds-card-sub">${ajustes.length} pedido${ajustes.length > 1 ? 's' : ''} de ajuste sem resposta</span>
                    </div>
                </div>
                <div class="pn-pedidos">
                    ${porData(ajustes).map(c => pedidoHTML(c, clientes, retornos)).join('')}
                </div>
            </article>` : ''}

        <article class="ds-card vz-secao">
            <div class="vz-secao__cabeca">
                <div>
                    <h2 class="ds-card-title">Todos os clientes</h2>
                    <span class="ds-card-sub">${clientes.length} cadastrado${clientes.length === 1 ? '' : 's'}</span>
                </div>
            </div>
            ${clientes.length ? `
                <div class="pn-lista">
                    ${clientes.map(cl => clienteHTML(cl, conteudos)).join('')}
                </div>`
            : vazioHTML('user-plus', 'Nenhum cliente ainda',
                'Cadastre o primeiro para começar a montar o cronograma dele.',
                `<button class="ds-btn ds-btn--primary" id="pn-novo-vazio">Cadastrar cliente</button>`)}
        </article>
    `;

    // ── Eventos ─────────────────────────────────────────────────────────
    const novo = () => formularioCliente(null, () => renderPainel(container));
    document.getElementById('pn-novo').addEventListener('click', novo);
    document.getElementById('pn-novo-vazio')?.addEventListener('click', novo);
    document.getElementById('pn-gestor')?.addEventListener('click',
        () => abrirCartela(clientes, () => renderPainel(container)));

    content.querySelectorAll('[data-abrir]').forEach(el =>
        el.addEventListener('click', () => navegar(`/cliente/${el.dataset.abrir}`)));

    content.querySelectorAll('[data-conteudo]').forEach(el =>
        el.addEventListener('click', () => navegar(`/conteudo/${el.dataset.conteudo}`)));

    content.querySelectorAll('[data-copiar]').forEach(botao =>
        botao.addEventListener('click', (e) => {
            e.stopPropagation();
            copiarLink(botao.dataset.copiar, clientes);
        }));

    content.querySelectorAll('[data-menu]').forEach(botao =>
        botao.addEventListener('click', (e) => {
            e.stopPropagation();
            const cl = clientes.find(c => c.id === botao.dataset.menu);
            abrirMenu(botao, [
                { id: 'ver', label: 'Abrir cronograma', icon: 'calendar-days',
                  onClick: () => navegar(`/cliente/${cl.id}`) },
                { id: 'link', label: 'Copiar link do cliente', icon: 'link',
                  onClick: () => copiarLink(cl.id, clientes) },
                { id: 'previa', label: 'Ver como o cliente vê', icon: 'external-link',
                  href: `/c/${cl.apelido || cl.token}`, externo: true },
                { id: 'editar', label: 'Editar cadastro', icon: 'pencil', separadorAntes: true,
                  onClick: () => formularioCliente(cl, () => renderPainel(container)) },
                { id: 'novoToken', label: 'Gerar link novo', icon: 'refresh-cw',
                  onClick: () => trocarToken(cl, () => renderPainel(container)) },
            ]);
        }));

    if (window.lucide) lucide.createIcons();
};

// ─────────────────────────────────────────────────────────────────────────

const kpi = (icone, rotulo, valor, papel) => `
    <article class="ds-card vz-kpi vz-kpi--${papel}">
        <div class="vz-kpi__topo">
            <span class="vz-kpi__rotulo">${esc(rotulo)}</span>
            <span class="vz-kpi__icone"><i data-lucide="${icone}"></i></span>
        </div>
        <span class="vz-kpi__valor">${valor}</span>
    </article>`;

const pedidoHTML = (c, clientes, retornos) => {
    const cl = clientes.find(x => x.id === c.cliente_id);
    const r = retornosDe(retornos, c.id).find(r => r.tipo === 'ajuste');
    return `
        <button class="pn-pedido" data-conteudo="${esc(c.id)}">
            <div class="pn-pedido__topo">
                <span class="pn-pedido__cliente">${esc(cl?.nome || 'Cliente removido')}</span>
                <span class="pn-pedido__data">${esc(r ? quandoRelativo(String(r.criado_em).slice(0, 10)) : '')}</span>
            </div>
            <span class="pn-pedido__titulo">${esc(c.titulo)}</span>
            ${r?.texto ? `<p class="pn-pedido__texto">“${esc(r.texto)}”</p>` : ''}
            <span class="pn-pedido__pe">
                ${r?.autor ? `${esc(r.autor)} · ` : ''}publicação em ${esc(dataBR(c.data))}
            </span>
        </button>`;
};

const clienteHTML = (cl, conteudos) => {
    const meus = conteudos.filter(c => c.cliente_id === cl.id);
    const contagem = contarPorStatus(meus);
    const prox = proximo(meus.filter(c => c.status !== 'rascunho'));
    const inativo = cl.ativo === false;

    return `
        <div class="pn-cliente ${inativo ? 'pn-cliente--inativo' : ''}">
            <button class="pn-cliente__corpo" data-abrir="${esc(cl.id)}">
                <span class="pn-cliente__marca" ${cl.cor ? `style="background:${esc(cl.cor)}"` : ''}>
                    ${esc((cl.nome || '?').slice(0, 2).toUpperCase())}
                </span>
                <span class="pn-cliente__info">
                    <span class="pn-cliente__nome">
                        ${esc(cl.nome)}
                        ${inativo ? '<span class="vz-status">link desligado</span>' : ''}
                    </span>
                    <span class="pn-cliente__meta">
                        ${cl.empresa ? `<span>${esc(cl.empresa)}</span>` : ''}
                        <span>${meus.length} conteúdo${meus.length === 1 ? '' : 's'}</span>
                        ${prox ? `<span>próximo ${esc(diaCurto(prox.data))}</span>` : '<span>nada programado</span>'}
                    </span>
                </span>
            </button>

            <div class="pn-cliente__estados">
                ${['em_revisao', 'ajuste', 'rascunho'].filter(s => contagem[s]).map(s =>
                    `<span class="vz-status vz-status--${s}">${contagem[s]} ${esc(rotuloCurto(s))}</span>`).join('')}
            </div>

            <div class="pn-cliente__acoes">
                <button class="ds-icon-btn" data-copiar="${esc(cl.id)}" title="Copiar o link do cliente">
                    <i data-lucide="link"></i>
                </button>
                <button class="ds-icon-btn" data-menu="${esc(cl.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Ações">
                    <i data-lucide="ellipsis"></i>
                </button>
            </div>
        </div>`;
};

const rotuloCurto = (status) => ({
    em_revisao: 'em revisão', ajuste: 'com ajuste', rascunho: 'em rascunho',
}[status] || status);

/**
 * Copia o link do cliente com o endereço COMPLETO.
 *
 * O caminho relativo (/c/abc) seria copiado sem servir para nada: o destino é
 * um WhatsApp, e lá "/c/abc" não é link. `location.origin` resolve isso tanto
 * em localhost quanto em produção, sem este arquivo saber qual é o domínio.
 */
async function copiarLink(clienteId, clientes) {
    const url = linkDoCliente(clientes.find(c => c.id === clienteId));
    try {
        await navigator.clipboard.writeText(url);
        toast('Link copiado.', { href: new URL(url).pathname, label: 'Abrir' });
    } catch {
        /* clipboard exige contexto seguro (https ou localhost) e permissão.
           Quando falha, mostrar o endereço é melhor que um erro: dá para
           selecionar e copiar à mão. */
        toast(url);
    }
}

async function trocarToken(cl, aoTerminar) {
    abrirFormulario({
        titulo: 'Gerar link novo',
        subtitulo: cl.nome,
        campos: [{
            nome: 'confirmar', tipo: 'checkbox',
            rotulo: 'Entendo que o link atual deixa de funcionar',
            dica: 'Quem tiver o endereço antigo passa a ver "link não disponível". '
                + 'Use quando o link vazar para fora de quem deveria ter acesso.',
        }],
        rotuloSalvar: 'Gerar link novo',
        aoSalvar: async (dados) => {
            if (!dados.confirmar) throw new Error('Marque a confirmação para continuar.');
            await store.clientes.salvar({ ...cl, token: gerarToken() });
            toast('Link novo gerado. O anterior parou de funcionar.');
            aoTerminar();
        },
    });
}

/**
 * A cartela do Gestor, para copiar quem ainda não está aqui.
 *
 * Compara por NOME normalizado, não por id: os dois sistemas moram em bancos
 * diferentes e o id de lá não significa nada aqui. Quem já existe aparece
 * marcado como tal e sem caixa de seleção — copiar de novo criaria um cliente
 * duplicado com um link novo, e o link antigo, que o cliente já tem salvo,
 * continuaria apontando para o cronograma abandonado.
 */
async function abrirCartela(jaTenho, aoTerminar) {
    const painel = openDrawer({
        title: 'Trazer do Gestor',
        subtitle: 'A cartela de clientes do estúdio',
        body: `<p class="ds-hint"><i data-lucide="loader"></i> Lendo a cartela…</p>`,
        footer: `<span style="flex:1"></span>
                 <button class="ds-btn ds-btn--ghost" id="ct-fechar">Fechar</button>`,
    });
    painel.querySelector('#ct-fechar').addEventListener('click', closeDrawer);

    let cartela;
    try {
        cartela = await lerCartela();
    } catch (e) {
        painel.querySelector('.dw__body').innerHTML =
            `<p class="ds-hint ds-hint--aviso"><i data-lucide="triangle-alert"></i> ${esc(e.message)}</p>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const conhecido = new Set(jaTenho.map(c => chaveNome(c.nome)));
    const novos = cartela.clientes.filter(c => !conhecido.has(chaveNome(c.nome)));

    painel.querySelector('.dw__body').innerHTML = `
        <p class="ct-resumo">
            <strong>${cartela.clientes.length}</strong> clientes no Gestor ·
            <strong>${cartela.integrantes.length}</strong> integrantes ativos.
            ${novos.length
                ? `<strong>${novos.length}</strong> ainda não estão aqui.`
                : 'Todos já estão aqui.'}
        </p>

        ${novos.length ? `
            <div class="ct-lista">
                ${novos.map((c, i) => `
                    <label class="ct-item">
                        <input type="checkbox" data-cliente="${i}" checked>
                        <span class="ct-item__info">
                            <span class="ct-item__nome">${esc(c.nome)}</span>
                            ${c.empresa ? `<span class="ct-item__meta">${esc(c.empresa)}</span>` : ''}
                        </span>
                    </label>`).join('')}
            </div>
            <button class="ds-btn ds-btn--primary" id="ct-copiar">
                <i data-lucide="download"></i> Copiar selecionados
            </button>
            <p class="ds-hint">
                <i data-lucide="info"></i>
                Cada um entra com um link próprio, já ativo, e sem nenhum conteúdo.
                O que vem do Gestor é só o nome, a empresa e a cor.
            </p>` : ''}

        ${cartela.integrantes.length ? `
            <div>
                <span class="vz-rotulo">Time guardado para o campo "responsável"</span>
                <p class="ct-time">${cartela.integrantes.map(i =>
                    `<span class="ct-pessoa">${esc(i.nome)}${i.papel ? ` · ${esc(i.papel)}` : ''}</span>`).join('')}</p>
            </div>` : ''}
    `;

    painel.querySelector('#ct-copiar')?.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        const marcados = [...painel.querySelectorAll('[data-cliente]:checked')]
            .map(cx => novos[Number(cx.dataset.cliente)]);
        if (!marcados.length) { closeDrawer(); return; }

        b.disabled = true;
        b.textContent = 'Copiando…';
        for (const c of marcados) {
            await store.clientes.salvar({
                nome: c.nome,
                empresa: c.empresa || null,
                cor: c.cor || '#A855FF',
                ativo: true,
                token: gerarToken(),
            });
        }
        closeDrawer();
        toast(`${marcados.length} cliente(s) copiado(s) do Gestor.`);
        aoTerminar();
    });

    if (window.lucide) lucide.createIcons();
}

/* Nome como chave de comparação entre dois bancos diferentes. Sem acento, sem
   pontuação, sem espaço: "Instituto Dr. Tigre" e "Instituto Dr Tigre" são o
   mesmo cliente, e é justamente essa divergência que a ponte existe para
   evitar. */
const chaveNome = (nome) => semAcento(nome).replace(/[^a-z0-9]/g, '');

export function formularioCliente(cl, aoTerminar) {
    abrirFormulario({
        titulo: cl ? 'Editar cliente' : 'Novo cliente',
        subtitulo: cl ? cl.nome : 'Ele recebe um link próprio ao ser criado',
        campos: [
            { nome: 'nome', rotulo: 'Nome', obrigatorio: true, placeholder: 'Instituto Dr. Tigre' },
            { nome: 'empresa', rotulo: 'Empresa ou marca', largura: 'metade' },
            { nome: 'contato', rotulo: 'Quem aprova', largura: 'metade',
              dica: 'Só para a equipe saber com quem falar.' },
            /* Dois campos e não um: "Dra. Helena (marketing)" diz com quem
               falar e não é um endereço. Tirar e-mail de texto livre com regex
               funciona até o dia em que alguém escreve dois, ou nenhum. */
            { nome: 'email', rotulo: 'E-mail de quem aprova', tipo: 'email', largura: 'metade',
              placeholder: 'helena@clinica.com.br',
              dica: 'Usado para avisar que o ajuste pedido ficou pronto.' },
            { nome: 'proposito', rotulo: 'A estratégia em uma frase', tipo: 'textarea',
              placeholder: 'Posicionar a equipe como referência em medicina esportiva na região.',
              dica: 'Aparece no topo do cronograma do cliente. Dá contexto ao que ele está vendo.' },
            { nome: 'cor', rotulo: 'Cor', tipo: 'cor', largura: 'metade' },
            { nome: 'ativo', tipo: 'checkbox', rotulo: 'Link ativo',
              dica: 'Desligado, o endereço do cliente para de abrir — sem apagar nada.' },
            { nome: 'nota', rotulo: 'Anotação interna', tipo: 'textarea',
              dica: 'Só a equipe vê. Este campo nunca sai na resposta do link público.' },
        ],
        // Cliente novo já nasce com link ativo: criar um cliente para em
        // seguida lembrar de ligá-lo é um passo que só existe para ser
        // esquecido.
        valores: cl || { ativo: true, cor: '#A855FF' },
        aoSalvar: async (dados) => {
            await store.clientes.salvar({
                ...dados,
                // O token é gerado uma vez e nunca muda sozinho: é ele que
                // está no link que o cliente já salvou.
                token: cl?.token || gerarToken(),
            });
            toast(cl ? 'Cliente atualizado.' : 'Cliente criado. O link já funciona.');
            aoTerminar();
        },
    });
}

const ESTILOS = `
<style>
.pn-lista { display: flex; flex-direction: column; gap: var(--space-2); }

.pn-cliente {
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md);
    background: var(--surface-3);
    transition: border-color var(--dur-fast), background-color var(--dur-fast);
}
.pn-cliente:hover { border-color: var(--border-default); background: var(--surface-4); }
.pn-cliente--inativo { opacity: 0.6; }

.pn-cliente__corpo {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: var(--space-4);
    border: none; background: none; padding: 0;
    font-family: var(--font-sans); text-align: left; cursor: pointer;
}
.pn-cliente__marca {
    width: 38px; height: 38px; flex-shrink: 0; border-radius: var(--radius-sm);
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--surface-1); color: var(--text-inverse);
    font-size: var(--text-xs); font-weight: 700;
}
.pn-cliente__info { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.pn-cliente__nome {
    display: flex; align-items: center; gap: var(--space-2);
    font-size: var(--text-body); font-weight: 600; color: var(--text-primary);
}
.pn-cliente__meta {
    display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;
    font-size: var(--text-xs); color: var(--text-tertiary);
}
.pn-cliente__meta > *:not(:last-child)::after { content: '·'; margin-left: var(--space-2); color: var(--text-disabled); }

.pn-cliente__estados { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.pn-cliente__acoes { display: flex; align-items: center; gap: var(--space-1); flex-shrink: 0; }

/* ── Pedidos de ajuste ────────────────────────────────────────────────── */
.pn-pedidos { display: flex; flex-direction: column; gap: var(--space-2); }
.pn-pedido {
    display: flex; flex-direction: column; gap: var(--space-2);
    width: 100%; padding: var(--space-4);
    border: 1px solid color-mix(in oklch, var(--warning) 30%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in oklch, var(--warning) 8%, transparent);
    font-family: var(--font-sans); text-align: left; cursor: pointer;
    transition: border-color var(--dur-fast);
}
.pn-pedido:hover { border-color: var(--warning); }
.pn-pedido__topo { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.pn-pedido__cliente { font-size: var(--text-xs); font-weight: 700; color: var(--warning); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.pn-pedido__data { font-size: var(--text-xs); color: var(--text-tertiary); }
.pn-pedido__titulo { font-size: var(--text-body); font-weight: 600; color: var(--text-primary); }
.pn-pedido__texto { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.pn-pedido__pe { font-size: var(--text-xs); color: var(--text-tertiary); }

/* ── Cartela do Gestor ───────────────────────────────────────────────── */
.ct-resumo { margin: 0; font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-body); }
.ct-resumo strong { color: var(--text-primary); }
.ct-lista { display: flex; flex-direction: column; gap: 2px; max-height: 42vh; overflow-y: auto; }
.ct-item {
    display: flex; align-items: center; gap: var(--space-3);
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    cursor: pointer; transition: background-color var(--dur-fast);
}
.ct-item:hover { background: rgba(255, 255, 255, 0.06); }
.ct-item input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
.ct-item__info { display: flex; flex-direction: column; min-width: 0; }
.ct-item__nome { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.ct-item__meta { font-size: var(--text-xs); color: var(--text-tertiary); }
.ct-time { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: var(--space-2) 0 0; }
.ct-pessoa {
    font-size: var(--text-xs); color: var(--text-secondary);
    padding: 3px var(--space-3); border-radius: var(--radius-pill);
    background: var(--surface-3);
}

@media (max-width: 720px) {
    .pn-cliente { flex-wrap: wrap; }
    .pn-cliente__corpo { flex: 1 1 100%; }
    .pn-cliente__estados { order: 3; }
    .pn-cliente__acoes { margin-left: auto; }
}
</style>
`;
