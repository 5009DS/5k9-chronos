import { store } from '../store.js';
import { toast } from './toast.js';
import { abrirMenu } from './menu.js';
import { esc, hoje, dataBR } from '../lib/formato.js';
import { caminhoDoConteudo } from '../lib/rotas.js';
import {
    COLUNAS, colunaDe, ativos, euSou, responsaveisDe, avatarHTML, avataresHTML,
    prazoTexto, idadeTexto, comStatus, avisarResponsaveis, injectEstilosAvatar,
} from '../lib/pedidos.js';

/* ═══════════════════════════════════════════════════════════════════════════
   A JANELA DO PEDIDO — o pedido inteiro numa tela, como a tarefa do ClickUp.

   À esquerda, o pedido: tudo se edita onde está, sem botão de salvar — muda
   e grava. À direita, a conversa da equipe: comentários, respostas e o
   histórico do que mudou, numa linha do tempo só (vz_comentarios).

   O que ficou de fora de propósito: estimativa de tempo, subtarefa com dono,
   dependência, anexo. "Tópicos" é uma lista simples — quando um tópico
   precisa de dono e prazo, ele é outro pedido.

   ── QUEM ESTÁ FALANDO ─────────────────────────────────────────────────────
   O nome que assina comentário e histórico é o da pessoa da Equipe com o
   email da sessão (login Google). No login master, sem pessoa, assina
   "Estúdio". O email vai junto: é por ele que se sabe de quem é o
   comentário que se pode editar e apagar.
   ═══════════════════════════════════════════════════════════════════════════ */

const CORES_STATUS = { novo: '#8E8EA0', fazendo: '#3B82F6', entregue: '#F59E0B', confirmado: '#10B981' };

/** "agora", "há 5 min", "hoje 14:20", "ontem 09:10", "08/11 14:20". */
const quando = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const seg = (Date.now() - d.getTime()) / 1000;
    if (seg < 60) return 'agora';
    if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const dia = (x) => x.toLocaleDateString('en-CA');
    const ontem = new Date(Date.now() - 86_400_000);
    if (dia(d) === dia(new Date())) return `hoje ${hora}`;
    if (dia(d) === dia(ontem)) return `ontem ${hora}`;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
};

/* Texto de comentário: quebras de linha viram <br>, @Nome da equipe ganha
   destaque. Escapado ANTES de qualquer marcação. */
const textoComentario = (texto, equipe) => {
    let html = esc(texto).replace(/\n/g, '<br>');
    for (const p of ativos(equipe)) {
        const nome = esc(p.nome.split(' ')[0]);
        html = html.replace(new RegExp(`@${nome}\\b`, 'gi'), `<span class="tj-mencao">@${nome}</span>`);
    }
    return html;
};

/** Link direto para a janela aberta: vai no email e no "copiar link". */
export const linkDoPedido = (p) => `${location.origin}/pedidos/${encodeURIComponent(p.cliente_id)}?abrir=${encodeURIComponent(p.id)}`;

/**
 * Abre o pedido em tela cheia.
 *
 * @param {object}   opts
 * @param {object}   opts.pedido
 * @param {object[]} opts.clientes
 * @param {object[]} opts.conteudos
 * @param {object[]} opts.equipe
 * @param {function} [opts.aoMudar]  chamado ao fechar, se algo mudou
 */
export const abrirTarefa = async ({ pedido, clientes, conteudos, equipe, aoMudar }) => {
    injectEstilosAvatar();
    injectEstilos();
    fecharTarefa();

    let p = { ...pedido };
    let mudou = false;
    const pessoas = ativos(equipe);
    const pessoaPorId = new Map(equipe.map(x => [x.id, x]));
    const { pessoa: eu } = euSou(equipe);
    const usuario = store.usuario();
    const meuEmail = (usuario?.email || '').toLowerCase();
    const meuNome = eu?.nome || (usuario ? 'Estúdio' : 'Você');

    /* A conversa: sem a tabela (migração não rodada), a janela abre do mesmo
       jeito e avisa no lugar dos comentários. */
    let conversa = null;
    try {
        conversa = (await store.comentarios.listar())
            .filter(c => c.alvo === 'pedido' && c.alvo_id === p.id);
    } catch { conversa = null; }

    let respondendo = null;    // id do comentário sendo respondido
    let editando = null;       // id do comentário sendo editado

    const raiz = document.createElement('div');
    raiz.className = 'tj';
    raiz.innerHTML = `
        <div class="tj__scrim" data-tj-fechar></div>
        <section class="tj__janela" role="dialog" aria-modal="true" aria-label="Pedido">
            <header class="tj__topo"></header>
            <div class="tj__corpo">
                <div class="tj__principal"></div>
                <aside class="tj__conversa"></aside>
            </div>
        </section>`;
    document.body.appendChild(raiz);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => raiz.classList.add('is-aberta'));
    const anterior = document.activeElement;

    const $ = (sel) => raiz.querySelector(sel);

    // ── Gravar ──────────────────────────────────────────────────────────
    /* Toda mudança passa por aqui: grava, registra no histórico (quando é
       algo que a equipe precisa saber) e redesenha a parte de cima. */
    const registrar = async (texto) => {
        if (conversa === null) return;
        try {
            const linha = await store.comentarios.salvar({
                alvo: 'pedido', alvo_id: p.id, tipo: 'atividade', texto,
                autor_email: meuEmail || null, autor_nome: meuNome,
            });
            conversa.push(linha);
        } catch (e) { console.warn('[tarefa] histórico:', e); }
    };

    /* Campo de texto que perde o foco grava SEM redesenhar: o clique que tirou
       o foco foi para outro campo, e redesenhar agora o destruiria. */
    const salvar = async (mudanca, historico = null, { redesenhar = true } = {}) => {
        const antes = p;
        try {
            p = await store.pedidos.salvar({ ...p, ...mudanca, responsavel_id: null });
        } catch (e) {
            console.error('[tarefa] salvar:', e);
            toast('Não foi possível salvar. Tente de novo.');
            return false;
        }
        mudou = true;
        if (historico) await registrar(historico);
        if (redesenhar) { desenharTopo(); desenharPrincipal(); }
        if (historico) desenharConversa();
        return antes;
    };

    // ── Topo ────────────────────────────────────────────────────────────
    const desenharTopo = () => {
        const cliente = clientes.find(c => c.id === p.cliente_id);
        $('.tj__topo').innerHTML = `
            <nav class="tj__rastro">
                <i data-lucide="list-checks"></i>
                <a href="/pedidos">Pedidos</a>
                <span>/</span>
                <a href="/pedidos/${esc(p.cliente_id)}">${esc(cliente?.nome || 'Cliente')}</a>
            </nav>
            <span class="tj__criado">${esc(idadeTexto(p))}${p.criado_por ? ` · anotado por ${esc(p.criado_por.split(' ')[0])}` : ''}</span>
            <span class="tj__espaco"></span>
            <button class="ds-icon-btn ds-icon-btn--sm" id="tj-link" title="Copiar o link deste pedido" aria-label="Copiar link">
                <i data-lucide="link"></i>
            </button>
            <button class="ds-icon-btn ds-icon-btn--sm" id="tj-mais" title="Mais ações" aria-label="Mais ações" aria-haspopup="menu">
                <i data-lucide="ellipsis"></i>
            </button>
            <button class="ds-icon-btn ds-icon-btn--sm" data-tj-fechar title="Fechar (Esc)" aria-label="Fechar">
                <i data-lucide="x"></i>
            </button>`;
        icones();
    };

    // ── O pedido ────────────────────────────────────────────────────────
    const desenharPrincipal = () => {
        const col = colunaDe(p.status || 'novo');
        const idx = COLUNAS.findIndex(c => c.id === col.id);
        const proxima = COLUNAS[idx + 1];
        const resp = responsaveisDe(p).map(id => pessoaPorId.get(id)).filter(Boolean);
        const prazo = prazoTexto(p);
        const demandas = conteudos.filter(c => c.cliente_id === p.cliente_id)
            .sort((a, b) => String(b.data).localeCompare(String(a.data)));
        const demanda = conteudos.find(c => c.id === p.conteudo_id);
        const topicos = Array.isArray(p.checklist) ? p.checklist : [];
        const feitos = topicos.filter(t => t.feito).length;

        $('.tj__principal').innerHTML = `
            <div class="tj__status-linha">
                <button class="tj-status" id="tj-status" style="--cor:${CORES_STATUS[col.id]}" aria-haspopup="menu">
                    <i data-lucide="${col.icone}"></i>${esc(col.nome)}<i data-lucide="chevron-down" class="tj-status__seta"></i>
                </button>
                ${proxima ? `
                    <button class="tj-avancar" id="tj-avancar" title="Mover para ${esc(proxima.nome)}">
                        <i data-lucide="arrow-right"></i> ${esc(proxima.nome)}
                    </button>` : ''}
                <span class="tj__dica">${esc(col.dica)}</span>
            </div>

            <textarea class="tj__titulo" id="tj-titulo" rows="1" maxlength="400" aria-label="O que foi pedido">${esc(p.texto || '')}</textarea>

            <dl class="tj__campos">
                <div class="tj-campo">
                    <dt><i data-lucide="users-round"></i>Quem cuida</dt>
                    <dd><button class="tj-valor" id="tj-quem" aria-haspopup="menu">
                        ${resp.length ? `${avataresHTML(resp, { tamanho: 22 })}<span>${esc(resp.map(x => x.nome.split(' ')[0]).join(', '))}</span>`
                                      : '<span class="tj-vazio">ninguém ainda</span>'}
                    </button></dd>
                </div>
                <div class="tj-campo">
                    <dt><i data-lucide="calendar-clock"></i>Prazo</dt>
                    <dd class="tj-data">
                        <input type="date" class="tj-input" id="tj-prazo" value="${esc(p.prazo || '')}" aria-label="Prazo">
                        ${prazo ? `<span class="pd-prazo pd-prazo--${prazo.tom}">${esc(prazo.texto)}</span>` : ''}
                    </dd>
                </div>
                <div class="tj-campo">
                    <dt><i data-lucide="building-2"></i>Cliente</dt>
                    <dd><select class="tj-input" id="tj-cliente" aria-label="Cliente">
                        ${clientes.filter(c => c.ativo !== false || c.id === p.cliente_id)
                            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                            .map(c => `<option value="${esc(c.id)}" ${c.id === p.cliente_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
                    </select></dd>
                </div>
                <div class="tj-campo">
                    <dt><i data-lucide="message-circle"></i>Quem pediu</dt>
                    <dd><input class="tj-input" id="tj-quem-pediu" value="${esc(p.quem_pediu || '')}" placeholder="—" maxlength="80"></dd>
                </div>
                <div class="tj-campo">
                    <dt><i data-lucide="calendar"></i>Pedido em</dt>
                    <dd><input type="date" class="tj-input" id="tj-pedido-em" value="${esc(p.pedido_em || '')}" aria-label="Pedido em"></dd>
                </div>
                <div class="tj-campo">
                    <dt><i data-lucide="file-text"></i>Demanda</dt>
                    <dd class="tj-data">
                        <select class="tj-input" id="tj-demanda" aria-label="Demanda ligada">
                            <option value="">— nenhuma —</option>
                            ${demandas.map(c => `<option value="${esc(c.id)}" ${c.id === p.conteudo_id ? 'selected' : ''}>${esc(dataBR(c.data).slice(0, 5))} · ${esc(c.titulo)}</option>`).join('')}
                        </select>
                        ${demanda ? `<a class="tj-abrir" href="${esc(caminhoDoConteudo(demanda))}" title="Abrir a demanda"><i data-lucide="arrow-up-right"></i></a>` : ''}
                    </dd>
                </div>
            </dl>

            <section class="tj-bloco">
                <h3><i data-lucide="align-left"></i>Descrição</h3>
                <textarea class="tj__texto" id="tj-detalhe" rows="3"
                          placeholder="Contexto, a mensagem original do grupo, a transcrição do áudio…">${esc(p.detalhe || '')}</textarea>
            </section>

            <section class="tj-bloco">
                <h3><i data-lucide="list-checks"></i>Tópicos${topicos.length ? ` <span class="tj-conta">${feitos}/${topicos.length}</span>` : ''}</h3>
                ${topicos.length ? `<span class="tj-barra"><span style="width:${Math.round(feitos / topicos.length * 100)}%"></span></span>` : ''}
                <div class="tj-topicos">
                    ${topicos.map(t => `
                        <div class="tj-topico ${t.feito ? 'is-feito' : ''}">
                            <input type="checkbox" data-topico="${esc(t.id)}" ${t.feito ? 'checked' : ''} aria-label="Feito">
                            <input class="tj-topico__texto" data-topico-texto="${esc(t.id)}" value="${esc(t.texto)}" maxlength="200">
                            <button class="ds-icon-btn ds-icon-btn--sm" data-topico-tirar="${esc(t.id)}" title="Tirar" aria-label="Tirar tópico"><i data-lucide="x"></i></button>
                        </div>`).join('')}
                    <div class="tj-topico tj-topico--novo">
                        <i data-lucide="plus"></i>
                        <input class="tj-topico__texto" id="tj-topico-novo" maxlength="200" placeholder="Adicionar tópico e apertar Enter">
                    </div>
                </div>
            </section>`;

        autoAltura($('#tj-titulo'));
        autoAltura($('#tj-detalhe'));
        ligarPrincipal();
        icones();
    };

    const ligarPrincipal = () => {
        $('#tj-status').addEventListener('click', (e) => {
            e.stopPropagation();
            abrirMenu(e.currentTarget, COLUNAS.map(c => ({
                id: `st-${c.id}`, icon: c.icone,
                label: `${c.nome}${c.id === (p.status || 'novo') ? ' ✓' : ''}`,
                onClick: () => mudarStatus(c.id),
            })), { alinhar: 'esquerda' });
        });
        $('#tj-avancar')?.addEventListener('click', () => {
            const idx = COLUNAS.findIndex(c => c.id === (p.status || 'novo'));
            if (COLUNAS[idx + 1]) mudarStatus(COLUNAS[idx + 1].id);
        });

        const titulo = $('#tj-titulo');
        titulo.addEventListener('input', () => autoAltura(titulo));
        titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titulo.blur(); } });
        titulo.addEventListener('blur', () => {
            const v = titulo.value.trim();
            if (!v) { titulo.value = p.texto; autoAltura(titulo); return; }
            if (v !== p.texto) salvar({ texto: v }, null, { redesenhar: false });
        });

        const detalhe = $('#tj-detalhe');
        detalhe.addEventListener('input', () => autoAltura(detalhe));
        detalhe.addEventListener('blur', () => {
            const v = detalhe.value.trim();
            if (v !== (p.detalhe || '')) salvar({ detalhe: v || null }, null, { redesenhar: false });
        });

        $('#tj-quem').addEventListener('click', (e) => { e.stopPropagation(); menuQuem(e.currentTarget); });
        $('#tj-prazo').addEventListener('change', (e) => {
            const v = e.target.value || null;
            salvar({ prazo: v }, v ? `definiu o prazo para ${dataBR(v).slice(0, 5)}` : 'tirou o prazo');
        });
        $('#tj-pedido-em').addEventListener('change', (e) => salvar({ pedido_em: e.target.value || hoje() }));
        $('#tj-quem-pediu').addEventListener('change', (e) => salvar({ quem_pediu: e.target.value.trim() || null }, null, { redesenhar: false }));
        $('#tj-cliente').addEventListener('change', (e) => {
            const novo = clientes.find(c => c.id === e.target.value);
            salvar({ cliente_id: e.target.value, conteudo_id: null }, `mudou o cliente para ${novo?.nome || '—'}`);
        });
        $('#tj-demanda').addEventListener('change', (e) => {
            const d = conteudos.find(c => c.id === e.target.value);
            salvar({ conteudo_id: e.target.value || null }, d ? `ligou à demanda "${d.titulo}"` : 'desligou da demanda');
        });

        // Tópicos
        const topicos = () => (Array.isArray(p.checklist) ? p.checklist : []);
        raiz.querySelectorAll('[data-topico]').forEach(el => el.addEventListener('change', () =>
            salvar({ checklist: topicos().map(t => t.id === el.dataset.topico ? { ...t, feito: el.checked } : t) })));
        raiz.querySelectorAll('[data-topico-texto]').forEach(el => {
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
            el.addEventListener('blur', () => {
                const v = el.value.trim();
                const t = topicos().find(x => x.id === el.dataset.topicoTexto);
                if (!t || v === t.texto) return;
                if (!v) { el.value = t.texto; return; }
                salvar({ checklist: topicos().map(x => x.id === t.id ? { ...x, texto: v } : x) }, null, { redesenhar: false });
            });
        });
        raiz.querySelectorAll('[data-topico-tirar]').forEach(b => b.addEventListener('click', () =>
            salvar({ checklist: topicos().filter(t => t.id !== b.dataset.topicoTirar) })));
        const novo = $('#tj-topico-novo');
        novo.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter' || !novo.value.trim()) return;
            e.preventDefault();
            const texto = novo.value.trim();
            await salvar({ checklist: [...topicos(), { id: crypto.randomUUID().slice(0, 8), texto, feito: false }] });
            $('#tj-topico-novo')?.focus();   // a lista costuma ser feita de uma vez
        });
    };

    const mudarStatus = async (status) => {
        if ((p.status || 'novo') === status) return;
        await salvar(comStatus(p, status), `mudou para ${colunaDe(status).nome}`);
    };

    /* Quem cuida: o menu marca e desmarca, um clique por pessoa, e reabre
       para a próxima — marcar duas pessoas não exige reabrir o campo. */
    const menuQuem = (ancora) => {
        const lista = responsaveisDe(p);
        abrirMenu(ancora, [
            ...pessoas.map(x => ({
                id: `q-${x.id}`, icon: lista.includes(x.id) ? 'square-check' : 'square',
                label: esc(x.nome.split(' ')[0]),
                onClick: async () => {
                    const entra = !lista.includes(x.id);
                    const nova = entra ? [...lista, x.id] : lista.filter(id => id !== x.id);
                    const antes = await salvar({ responsaveis: nova },
                        `${entra ? 'marcou' : 'desmarcou'} ${x.nome.split(' ')[0]}`);
                    if (antes && entra && x.id !== eu?.id) avisarResponsaveis(p, [x], eu);
                    setTimeout(() => { const b = $('#tj-quem'); if (b) menuQuem(b); }, 0);
                },
            })),
            ...(!pessoas.length ? [{ id: 'q-vazio', icon: 'users-round', label: 'Cadastre a equipe em Pedidos → Equipe', onClick: () => {} }] : []),
        ], { alinhar: 'esquerda' });
    };

    // ── A conversa ──────────────────────────────────────────────────────
    const meu = (c) => (meuEmail && (c.autor_email || '').toLowerCase() === meuEmail)
        || (!meuEmail && c.autor_nome === meuNome);

    const pessoaDoAutor = (c) => equipe.find(x => (x.email || '').toLowerCase() === (c.autor_email || '').toLowerCase())
        || { nome: c.autor_nome || 'Estúdio' };

    const comentarioHTML = (c, resposta = false) => {
        const autor = pessoaDoAutor(c);
        const respostas = resposta ? [] : conversa.filter(r => r.resposta_a === c.id)
            .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
        return `
            <article class="tj-coment ${resposta ? 'tj-coment--resposta' : ''}" data-coment="${esc(c.id)}">
                ${avatarHTML(autor, { tamanho: resposta ? 22 : 28 })}
                <div class="tj-coment__corpo">
                    <header>
                        <b>${esc(autor.nome.split(' ')[0])}</b>
                        <time title="${esc(new Date(c.criado_em).toLocaleString('pt-BR'))}">${esc(quando(c.criado_em))}${c.editado_em ? ' · editado' : ''}</time>
                    </header>
                    ${editando === c.id ? `
                        <textarea class="tj-coment__editar" id="tj-editar-texto" rows="2">${esc(c.texto)}</textarea>
                        <div class="tj-coment__acoes">
                            <button class="tj-link" data-salvar-edicao="${esc(c.id)}">Salvar</button>
                            <button class="tj-link" data-cancelar-edicao>Cancelar</button>
                        </div>` : `
                        <div class="tj-coment__texto">${textoComentario(c.texto, equipe)}</div>
                        <div class="tj-coment__acoes">
                            <button class="tj-link" data-responder="${esc(resposta ? c.resposta_a : c.id)}">Responder</button>
                            ${meu(c) ? `
                                <button class="tj-link" data-editar-coment="${esc(c.id)}">Editar</button>
                                <button class="tj-link tj-link--perigo" data-apagar-coment="${esc(c.id)}">Apagar</button>` : ''}
                        </div>`}
                    ${respostas.length ? `<div class="tj-respostas">${respostas.map(r => comentarioHTML(r, true)).join('')}</div>` : ''}
                </div>
            </article>`;
    };

    const atividadeHTML = (a) => `
        <p class="tj-ativ"><i data-lucide="dot"></i>
            <span><b>${esc(pessoaDoAutor(a).nome.split(' ')[0])}</b> ${esc(a.texto)} · <time>${esc(quando(a.criado_em))}</time></span></p>`;

    const desenharConversa = () => {
        const caixa = $('.tj__conversa');
        if (conversa === null) {
            caixa.innerHTML = `
                <header class="tj-conversa__topo"><h3>Conversa da equipe</h3></header>
                <p class="tj-aviso">Falta preparar o banco: rode <code>db/migracao-comentarios.sql</code> no Supabase para comentar aqui.</p>`;
            return;
        }
        const topo = conversa.filter(c => !c.resposta_a)
            .sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
        const nComent = conversa.filter(c => c.tipo !== 'atividade').length;
        const alvoResposta = respondendo ? conversa.find(c => c.id === respondendo) : null;

        // Preserva o rascunho do comentário entre um redesenho e outro.
        const rascunho = $('#tj-novo')?.value || '';

        caixa.innerHTML = `
            <header class="tj-conversa__topo">
                <h3>Conversa da equipe ${nComent ? `<span class="tj-conta">${nComent}</span>` : ''}</h3>
            </header>
            <div class="tj-fio" id="tj-fio">
                ${topo.length ? topo.map(c => c.tipo === 'atividade' ? atividadeHTML(c) : comentarioHTML(c)).join('')
                    : '<p class="tj-fio__vazio"><i data-lucide="messages-square"></i>Ninguém comentou ainda. Dê sua ideia, pergunte, marque alguém com @.</p>'}
            </div>
            <form class="tj-escrever" id="tj-escrever">
                ${alvoResposta ? `
                    <div class="tj-escrever__resp">
                        <i data-lucide="corner-down-right"></i>
                        Respondendo a <b>${esc(pessoaDoAutor(alvoResposta).nome.split(' ')[0])}</b>
                        <button type="button" class="ds-icon-btn ds-icon-btn--sm" id="tj-cancelar-resp" aria-label="Cancelar resposta"><i data-lucide="x"></i></button>
                    </div>` : ''}
                <div class="tj-mencoes" id="tj-mencoes" hidden></div>
                <textarea id="tj-novo" rows="2" maxlength="4000"
                          placeholder="${alvoResposta ? 'Escreva a resposta…' : 'Escreva um comentário… use @ para marcar alguém'}"></textarea>
                <div class="tj-escrever__pe">
                    <span>⌘ + Enter envia</span>
                    <button type="submit" class="ds-btn ds-btn--primary ds-btn--sm" id="tj-enviar">
                        <i data-lucide="send"></i> ${alvoResposta ? 'Responder' : 'Comentar'}
                    </button>
                </div>
            </form>`;

        const campo = $('#tj-novo');
        campo.value = rascunho;
        autoAltura(campo);
        const fio = $('#tj-fio');
        fio.scrollTop = fio.scrollHeight;
        ligarConversa();
        icones();
    };

    const enviar = async () => {
        const campo = $('#tj-novo');
        const texto = campo.value.trim();
        if (!texto) return;
        const botao = $('#tj-enviar');
        botao.disabled = true;
        try {
            const linha = await store.comentarios.salvar({
                alvo: 'pedido', alvo_id: p.id, tipo: 'comentario', texto,
                resposta_a: respondendo || null,
                autor_email: meuEmail || null, autor_nome: meuNome,
            });
            conversa.push(linha);
            campo.value = '';
            respondendo = null;
            mudou = true;
            desenharConversa();
            avisarComentario(linha);
        } catch (e) {
            console.error('[tarefa] comentar:', e);
            toast('O comentário não foi salvo. Tente de novo.');
            botao.disabled = false;
        }
    };

    const ligarConversa = () => {
        const campo = $('#tj-novo');
        $('#tj-escrever').addEventListener('submit', (e) => { e.preventDefault(); enviar(); });
        campo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar(); }
        });
        campo.addEventListener('input', () => { autoAltura(campo); sugerirMencao(campo); });
        $('#tj-cancelar-resp')?.addEventListener('click', () => { respondendo = null; desenharConversa(); });

        raiz.querySelectorAll('[data-responder]').forEach(b => b.addEventListener('click', () => {
            respondendo = b.dataset.responder;
            editando = null;
            desenharConversa();
            $('#tj-novo').focus();
        }));
        raiz.querySelectorAll('[data-editar-coment]').forEach(b => b.addEventListener('click', () => {
            editando = b.dataset.editarComent;
            desenharConversa();
            const ed = $('#tj-editar-texto');
            ed?.focus();
            ed?.setSelectionRange(ed.value.length, ed.value.length);
        }));
        $('[data-cancelar-edicao]')?.addEventListener('click', () => { editando = null; desenharConversa(); });
        $('[data-salvar-edicao]')?.addEventListener('click', async (e) => {
            const c = conversa.find(x => x.id === e.currentTarget.dataset.salvarEdicao);
            const texto = $('#tj-editar-texto').value.trim();
            if (!c || !texto) return;
            try {
                Object.assign(c, await store.comentarios.salvar({ ...c, texto, editado_em: new Date().toISOString() }));
            } catch { toast('Não foi possível editar.'); return; }
            editando = null;
            desenharConversa();
        });
        raiz.querySelectorAll('[data-apagar-coment]').forEach(b => b.addEventListener('click', async () => {
            // Dois toques, como o excluir do formulário: sem diálogo por cima.
            if (b.dataset.confirmando !== 'sim') {
                b.dataset.confirmando = 'sim';
                b.textContent = 'Apagar mesmo?';
                setTimeout(() => { if (b.isConnected) { b.dataset.confirmando = ''; b.textContent = 'Apagar'; } }, 3000);
                return;
            }
            const id = b.dataset.apagarComent;
            try { await store.comentarios.excluir(id); } catch { toast('Não foi possível apagar.'); return; }
            conversa = conversa.filter(c => c.id !== id && c.resposta_a !== id);
            desenharConversa();
        }));
    };

    /* @menção: ao digitar "@" seguido do começo de um nome, aparece a lista
       da equipe; escolher completa o nome. Quem é mencionado recebe email. */
    const sugerirMencao = (campo) => {
        const caixa = $('#tj-mencoes');
        const antes = campo.value.slice(0, campo.selectionStart);
        const m = antes.match(/@([\p{L}]*)$/u);
        if (!m || !pessoas.length) { caixa.hidden = true; return; }
        const busca = m[1].toLowerCase();
        const achados = pessoas.filter(x => x.nome.toLowerCase().startsWith(busca)).slice(0, 5);
        if (!achados.length) { caixa.hidden = true; return; }
        caixa.innerHTML = achados.map(x => `
            <button type="button" data-mencionar="${esc(x.nome.split(' ')[0])}">${avatarHTML(x, { tamanho: 18 })}${esc(x.nome)}</button>`).join('');
        caixa.hidden = false;
        caixa.querySelectorAll('[data-mencionar]').forEach(b => b.addEventListener('mousedown', (e) => {
            e.preventDefault();   // o campo não perde o foco
            const inicio = antes.length - m[0].length;
            const depois = campo.value.slice(campo.selectionStart);
            campo.value = `${campo.value.slice(0, inicio)}@${b.dataset.mencionar} ${depois}`;
            const pos = inicio + b.dataset.mencionar.length + 2;
            campo.setSelectionRange(pos, pos);
            caixa.hidden = true;
        }));
    };

    /* O aviso por email: quem cuida do pedido, quem foi mencionado e, numa
       resposta, quem escreveu o comentário respondido — menos quem comentou.
       Quem decide é o servidor (api/avisar-comentario.js), pelo banco. */
    const avisarComentario = async (comentario) => {
        const token = await store.token().catch(() => null);
        if (!token) return;
        try {
            const r = await fetch('/api/avisar-comentario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ comentario_id: comentario.id }),
            });
            const corpo = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(corpo.erro || r.status);
            if (corpo.enviados?.length) toast(`${corpo.enviados.join(' e ')} ${corpo.enviados.length > 1 ? 'foram avisados' : 'foi avisado'} por email.`);
        } catch (e) {
            console.warn('[tarefa] aviso do comentário:', e);
        }
    };

    // ── Ações do topo e fechar ──────────────────────────────────────────
    raiz.addEventListener('click', async (e) => {
        if (e.target.closest('[data-tj-fechar]')) { fechar(); return; }
        if (e.target.closest('#tj-link')) {
            try { await navigator.clipboard.writeText(linkDoPedido(p)); toast('Link do pedido copiado.'); }
            catch { toast('Não foi possível copiar.'); }
            return;
        }
        const mais = e.target.closest('#tj-mais');
        if (mais) {
            e.stopPropagation();
            abrirMenu(mais, [
                { id: 'excluir', label: 'Excluir pedido', icon: 'trash-2', variante: 'danger', onClick: excluir },
            ]);
        }
    });

    const excluir = async () => {
        if (!confirm('Excluir este pedido? A conversa dele some junto da tela.')) return;
        try { await store.pedidos.excluir(p.id); } catch { toast('Não foi possível excluir.'); return; }
        const copia = { ...p };
        mudou = true;
        fechar();
        toast('Pedido excluído.', {
            label: 'Desfazer',
            onClick: async () => { await store.pedidos.salvar(copia); aoMudar?.(); },
        });
    };

    const aoTeclar = (e) => {
        if (e.key !== 'Escape') return;
        if (document.querySelector('.ds-menu')) return;   // o menu fecha primeiro
        if (editando) { editando = null; desenharConversa(); return; }
        fechar();
    };
    document.addEventListener('keydown', aoTeclar);

    /* Fechar grava o que estava em edição: o blur do campo dispara antes de
       a janela sumir, e só depois a tela de trás é redesenhada. */
    const fechar = () => {
        document.activeElement?.blur?.();
        document.removeEventListener('keydown', aoTeclar);
        raiz.classList.remove('is-aberta');
        document.body.style.overflow = '';
        setTimeout(() => raiz.remove(), 200);
        aberta = null;
        // Tira o ?abrir= do endereço, para recarregar não reabrir a janela.
        if (new URLSearchParams(location.search).has('abrir')) history.replaceState(null, '', location.pathname);
        anterior?.focus?.();
        setTimeout(() => { if (mudou) aoMudar?.(); }, 50);
    };
    aberta = fechar;

    desenharTopo();
    desenharPrincipal();
    desenharConversa();
    $('#tj-titulo')?.focus();
    $('#tj-titulo')?.setSelectionRange(9999, 9999);
};

let aberta = null;
export const fecharTarefa = () => aberta?.();

const autoAltura = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
};

const icones = () => { if (window.lucide) lucide.createIcons(); };

function injectEstilos() {
    if (document.getElementById('tj-estilos')) return;
    const style = document.createElement('style');
    style.id = 'tj-estilos';
    style.textContent = `
.tj { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: var(--space-6); font-family: var(--font-sans); color: var(--text-primary); }
.tj__scrim { position: absolute; inset: 0; background: rgba(5, 5, 10, 0.62); backdrop-filter: blur(4px); opacity: 0; transition: opacity .2s; }
.tj__janela {
    position: relative; width: min(1180px, 100%); height: min(860px, 100%);
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--surface-1); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg, 16px);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
    opacity: 0; transform: translateY(10px) scale(0.985); transition: opacity .2s, transform .2s var(--ease-out, ease);
}
.tj.is-aberta .tj__scrim { opacity: 1; }
.tj.is-aberta .tj__janela { opacity: 1; transform: none; }

.tj__topo {
    display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap;
    padding: var(--space-3) var(--space-4) var(--space-3) var(--space-6);
    border-bottom: 1px solid var(--border-subtle);
}
.tj__rastro { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); color: var(--text-secondary); }
.tj__rastro svg { width: 15px; height: 15px; color: var(--accent); }
.tj__rastro a { color: inherit; text-decoration: none; }
.tj__rastro a:hover { color: var(--text-primary); }
.tj__criado { font-size: 12px; color: var(--text-tertiary); }
.tj__espaco { flex: 1; }

.tj__corpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; }
.tj__principal { overflow-y: auto; padding: var(--space-6) var(--space-8, 40px) var(--space-8, 40px); display: flex; flex-direction: column; gap: var(--space-5); }
.tj__conversa { display: flex; flex-direction: column; min-height: 0; border-left: 1px solid var(--border-subtle); background: var(--surface-0, rgba(0,0,0,0.12)); }

.tj__status-linha { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.tj-status {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px 0 12px;
    border-radius: 8px; border: none; cursor: pointer; font: inherit; font-size: 12px; font-weight: 800;
    letter-spacing: 0.05em; text-transform: uppercase; color: #fff; background: var(--cor);
}
.tj-status svg { width: 14px; height: 14px; }
.tj-status__seta { opacity: 0.8; }
.tj-avancar {
    display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; border-radius: 8px;
    border: 1px solid var(--border-subtle); background: none; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer;
}
.tj-avancar:hover { color: var(--text-primary); border-color: var(--border-default); }
.tj-avancar svg { width: 13px; height: 13px; }
.tj__dica { font-size: 12px; color: var(--text-tertiary); }

.tj__titulo {
    width: 100%; resize: none; overflow: hidden; border: 1px solid transparent; border-radius: var(--radius-md);
    background: none; padding: 4px 8px; margin: 0 -8px; color: var(--text-primary);
    font-family: var(--font-display, var(--font-sans)); font-size: clamp(22px, 2.4vw, 30px); font-weight: 700; line-height: 1.2;
}
.tj__titulo:hover { border-color: var(--border-subtle); }
.tj__titulo:focus { outline: none; border-color: var(--accent); background: var(--surface-2); }

/* Duas colunas quando cabem, uma quando não: o campo precisa de uns 300px
   para a data e o "até 12/11" não quebrarem. */
.tj__campos { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 2px var(--space-6); margin: 0; }
.tj-campo { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; min-height: 40px; }
.tj-data .pd-prazo { white-space: nowrap; }
.tj-campo dt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); }
.tj-campo dt svg { width: 15px; height: 15px; color: var(--text-tertiary); }
.tj-campo dd { margin: 0; min-width: 0; }
.tj-data { display: flex; align-items: center; gap: var(--space-2); }
.tj-valor, .tj-input {
    display: inline-flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 4px 8px;
    border: 1px solid transparent; border-radius: 8px; background: none; color: var(--text-primary);
    font: inherit; font-size: 14px; text-align: left; cursor: pointer; color-scheme: dark;
}
html[data-theme="light"] .tj-input { color-scheme: light; }
.tj-valor:hover, .tj-input:hover { background: var(--surface-2); }
.tj-input:focus { outline: none; border-color: var(--accent); background: var(--surface-2); cursor: text; }
select.tj-input { appearance: none; -webkit-appearance: none; text-overflow: ellipsis; }
select.tj-input option { background: var(--surface-2); color: var(--text-primary); }
.tj-data .tj-input { width: auto; flex: 0 1 auto; min-width: 0; }
.tj-data select.tj-input { flex: 1; }
.tj-vazio { color: var(--text-tertiary); }
.tj-abrir { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: var(--text-secondary); }
.tj-abrir:hover { background: var(--surface-2); color: var(--accent); }
.tj-abrir svg { width: 16px; height: 16px; }

.tj-bloco { display: flex; flex-direction: column; gap: var(--space-2); }
.tj-bloco h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); }
.tj-bloco h3 svg { width: 15px; height: 15px; }
.tj-conta { padding: 1px 7px; border-radius: 999px; background: var(--surface-3); font-size: 11px; letter-spacing: 0; color: var(--text-secondary); }
.tj__texto {
    width: 100%; min-height: 90px; resize: none; overflow: hidden; padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-2);
    color: var(--text-primary); font: inherit; font-size: 15px; line-height: 1.6;
}
.tj__texto:focus { outline: none; border-color: var(--accent); }

.tj-barra { display: block; height: 4px; border-radius: 2px; background: var(--surface-3); overflow: hidden; max-width: 240px; }
.tj-barra span { display: block; height: 100%; background: var(--success, #10B981); transition: width .2s; }
.tj-topicos { display: flex; flex-direction: column; gap: 2px; }
.tj-topico { display: flex; align-items: center; gap: var(--space-2); padding: 2px 6px; border-radius: 8px; }
.tj-topico:hover { background: var(--surface-2); }
.tj-topico input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--accent); flex: none; }
.tj-topico__texto { flex: 1; min-width: 0; height: 32px; border: none; background: none; color: var(--text-primary); font: inherit; font-size: 14px; }
.tj-topico__texto:focus { outline: none; }
.tj-topico.is-feito .tj-topico__texto { text-decoration: line-through; color: var(--text-tertiary); }
.tj-topico [data-topico-tirar] { opacity: 0; }
.tj-topico:hover [data-topico-tirar], .tj-topico [data-topico-tirar]:focus-visible { opacity: 0.7; }
.tj-topico--novo { color: var(--text-tertiary); }
.tj-topico--novo svg { width: 16px; height: 16px; flex: none; }

.tj-conversa__topo { padding: var(--space-4) var(--space-5) var(--space-3); border-bottom: 1px solid var(--border-subtle); }
.tj-conversa__topo h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 700; }
.tj-fio { flex: 1; min-height: 0; overflow-y: auto; padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
.tj-fio__vazio { margin: auto 0; display: flex; flex-direction: column; align-items: center; gap: var(--space-2); text-align: center; font-size: 13px; color: var(--text-tertiary); }
.tj-fio__vazio svg { width: 28px; height: 28px; opacity: 0.6; }
.tj-ativ { display: flex; align-items: flex-start; gap: 2px; margin: -6px 0; font-size: 12px; color: var(--text-tertiary); }
.tj-ativ svg { width: 16px; height: 16px; flex: none; }
.tj-ativ b { color: var(--text-secondary); font-weight: 600; }

.tj-coment { display: flex; gap: var(--space-3); }
.tj-coment__corpo { flex: 1; min-width: 0; }
.tj-coment header { display: flex; align-items: baseline; gap: 8px; }
.tj-coment header b { font-size: 13px; }
.tj-coment time { font-size: 11px; color: var(--text-tertiary); }
.tj-coment__texto {
    margin-top: 4px; padding: 10px 12px; border-radius: 4px 12px 12px 12px;
    background: var(--surface-2); border: 1px solid var(--border-subtle);
    font-size: 14px; line-height: 1.55; overflow-wrap: anywhere;
}
.tj-mencao { color: var(--accent); font-weight: 600; }
.tj-coment__acoes { display: flex; gap: var(--space-3); margin-top: 4px; padding-left: 4px; }
.tj-link { border: none; background: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: var(--text-tertiary); cursor: pointer; }
.tj-link:hover { color: var(--text-primary); }
.tj-link--perigo:hover, .tj-link--perigo[data-confirmando="sim"] { color: var(--danger); }
.tj-respostas { display: flex; flex-direction: column; gap: var(--space-3); margin-top: var(--space-3); padding-left: var(--space-3); border-left: 2px solid var(--border-subtle); }
.tj-coment--resposta .tj-coment__texto { background: var(--surface-1); }
.tj-coment__editar { width: 100%; margin-top: 4px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--accent); background: var(--surface-2); color: var(--text-primary); font: inherit; font-size: 14px; resize: vertical; }

.tj-escrever { position: relative; padding: var(--space-3) var(--space-4) var(--space-4); border-top: 1px solid var(--border-subtle); }
.tj-escrever textarea {
    width: 100%; max-height: 220px; resize: none; padding: 10px 12px; border-radius: 12px;
    border: 1px solid var(--border-default); background: var(--surface-2); color: var(--text-primary); font: inherit; font-size: 14px; line-height: 1.5;
}
.tj-escrever textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-muted); }
.tj-escrever__pe { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-2); font-size: 11px; color: var(--text-tertiary); }
.tj-escrever__resp { display: flex; align-items: center; gap: 6px; margin-bottom: var(--space-2); font-size: 12px; color: var(--text-secondary); }
.tj-escrever__resp svg { width: 14px; height: 14px; }
.tj-escrever__resp button { margin-left: auto; }
.tj-mencoes {
    position: absolute; left: var(--space-4); bottom: calc(100% - 8px); z-index: 2; min-width: 200px;
    display: flex; flex-direction: column; padding: 4px; border-radius: 10px;
    background: var(--surface-3); border: 1px solid var(--border-default); box-shadow: 0 12px 30px rgba(0,0,0,.35);
}
.tj-mencoes[hidden] { display: none; }
.tj-mencoes button { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: none; border-radius: 6px; background: none; color: var(--text-primary); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.tj-mencoes button:hover { background: var(--surface-2); }
.tj-aviso { margin: var(--space-4) var(--space-5); font-size: 13px; color: var(--text-secondary); }

@media (max-width: 900px) {
    .tj { padding: 0; }
    .tj__janela { height: 100%; border-radius: 0; }
    .tj__corpo { grid-template-columns: 1fr; overflow-y: auto; }
    .tj__principal { overflow: visible; padding: var(--space-5) var(--space-4); }
    .tj__conversa { border-left: none; border-top: 1px solid var(--border-subtle); min-height: 480px; }
    .tj__campos { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .tj__scrim, .tj__janela { transition: none; } }
`;
    document.head.appendChild(style);
}
