import { store } from '../store.js';
import { toast } from '../components/toast.js';
import { esc } from './formato.js';
import { avataresHTML, ativos } from './pedidos.js';
import { etapaAtual, ETIQUETA_SUGESTAO } from './etiquetas.js';

/* ═══════════════════════════════════════════════════════════════════════════
   A DEMANDA COMO TAREFA — prioridade, quem cuida e checklist.

   O que veio do ClickUp, e só isso. Estimativa e rastreio de tempo,
   subtarefa, dependência e anexo ficaram de fora de propósito: a demanda já
   tem esteira (a etapa), roteiro (os blocos) e Drive (o material), e cada
   campo a mais é um campo que alguém precisa lembrar de preencher.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── PRIORIDADE ───────────────────────────────────────────────────────────
   Quatro níveis, como no ClickUp. Vazio é "ninguém disse" — e não aparece
   no cartão: só o que foge do normal merece tinta. */
export const PRIORIDADES = [
    { id: 'urgente', nome: 'Urgente', cor: '#EF4444', peso: 4 },
    { id: 'alta',    nome: 'Alta',    cor: '#F59E0B', peso: 3 },
    { id: 'normal',  nome: 'Normal',  cor: '#3B82F6', peso: 2 },
    { id: 'baixa',   nome: 'Baixa',   cor: '#9CA3AF', peso: 1 },
];

export const prioridadeDe = (c) => PRIORIDADES.find(p => p.id === c?.prioridade) || null;

/** A bandeira. Urgente e alta com nome; normal e baixa só a bandeira, para não pesar. */
export const chipPrioridade = (c, { sempreComNome = false } = {}) => {
    const p = prioridadeDe(c);
    if (!p) return '';
    const comNome = sempreComNome || p.peso >= 3;
    return `<span class="tf-prio tf-prio--${p.id}" style="--cor:${p.cor}" title="Prioridade ${esc(p.nome.toLowerCase())}">
        <i data-lucide="flag"></i>${comNome ? esc(p.nome) : ''}</span>`;
};

/* ── O CARTÃO COLORIDO ────────────────────────────────────────────────────
   O destaque era uma borda de 3px à esquerda — some no meio de trinta
   cartões. Agora o cartão INTEIRO ganha a cor da marca: a prioridade se lê
   do outro lado da sala.

   Só o que pede atenção pinta: urgente, alta e normal. Baixa e "sem
   prioridade" ficam no cartão escuro — se tudo for colorido, nada é. A
   sugestão ainda sem prioridade ganha o ciano: é pauta esperando decisão.

   Quem usa: pages/pedidos.js e pages/quadro.js (cartões e banco de temas). */
export const classeDestaque = (item) => {
    const p = item?.prioridade;
    if (p === 'urgente' || p === 'alta' || p === 'normal') return `tf-cheio tf-cheio--${p}`;
    if (!p && ehSugestao(item)) return 'tf-cheio tf-cheio--sugestao';
    return '';
};

/** Os itens de menu para escolher a prioridade (quadro, seleção em lote). */
export const itensDePrioridade = (atual, aoEscolher) => [
    ...PRIORIDADES.map(p => ({
        id: `prio-${p.id}`, icon: 'flag',
        label: `<span style="color:${p.cor}">${p.nome}</span>${atual === p.id ? ' ✓' : ''}`,
        onClick: () => aoEscolher(p.id),
    })),
    { id: 'prio-nenhuma', icon: 'flag-off', label: `Sem prioridade${!atual ? ' ✓' : ''}`, separadorAntes: true,
      onClick: () => aoEscolher(null) },
];

/** Ordem do mais urgente para o menos; sem prioridade conta como normal. */
export const pesoPrioridade = (c) => prioridadeDe(c)?.peso ?? 2;

/* ── QUEM CUIDA ───────────────────────────────────────────────────────────
   `responsaveis` são ids da Equipe do Chronos, vários por demanda — o reel é
   da Marianna (roteiro) e do Andrew (edição). O campo antigo `responsavel`
   (um nome trazido do Gestor) continua sendo lido onde já aparecia. */
export const responsaveisDoConteudo = (c, equipe) =>
    (c?.responsaveis || []).map(id => equipe.find(p => p.id === id)).filter(Boolean);

export const quemCuidaHTML = (c, equipe, { tamanho = 22 } = {}) => {
    const pessoas = responsaveisDoConteudo(c, equipe);
    return pessoas.length
        ? `<span class="tf-quem" title="${esc(pessoas.map(p => p.nome).join(', '))}">${avataresHTML(pessoas, { tamanho })}</span>`
        : '';
};

/* Avisa por email quem acabou de ser marcado — nunca quem marcou. Mesmo
   desenho do aviso de pedido: o servidor recebe ids e lê o resto do banco. */
export const avisarMarcados = async (conteudo, antes, equipe) => {
    const eu = (store.usuario()?.email || '').toLowerCase();
    const novos = (conteudo.responsaveis || []).filter(id => !(antes || []).includes(id))
        .map(id => equipe.find(p => p.id === id))
        .filter(p => p && p.email && p.email.toLowerCase() !== eu);
    if (!novos.length) return;
    const token = await store.token().catch(() => null);
    if (!token) return;   // modo local
    const quem = equipe.find(p => (p.email || '').toLowerCase() === eu);
    try {
        const r = await fetch('/api/avisar-conteudo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ conteudo_id: conteudo.id, para: novos.map(p => p.id), de: quem?.nome || '' }),
        });
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corpo.erro || r.status);
        const foram = novos.filter(p => corpo.enviados?.includes(p.id)).map(p => p.nome.split(' ')[0]);
        if (foram.length) toast(`${foram.join(' e ')} ${foram.length > 1 ? 'foram avisados' : 'foi avisado'} por email.`);
    } catch (e) {
        console.error('[tarefas] aviso por email:', e);
        toast('Salvo, mas o email de aviso não saiu.');
    }
};

/** O campo "Quem cuida" para abrirFormulario. null quando a equipe está vazia. */
export const campoQuemCuida = (equipe) => {
    const lista = ativos(equipe);
    return lista.length ? {
        nome: 'responsaveis', rotulo: 'Quem cuida', tipo: 'multipla',
        opcoes: lista.map(p => ({ valor: p.id, rotulo: p.nome.split(' ')[0],
                                  prefixo: avataresHTML([p], { tamanho: 18 }) })),
        dica: 'Quem você marcar recebe um email.',
    } : null;
};

/* ── SUGESTÃO ────────────────────────────────────────────────────────────
   A pauta sugerida deixa de ser sugestão quando alguém decide o que fazer
   com ela: marca quem cuida, ou põe num dia do calendário. */
export const ehSugestao = (c) => (c?.etiquetas || []).some(e => String(e).trim().toLowerCase() === ETIQUETA_SUGESTAO);
export const semSugestao = (etiquetas) => (etiquetas || []).filter(e => String(e).trim().toLowerCase() !== ETIQUETA_SUGESTAO);

/* ── A DEMANDA NO QUADRO DE PEDIDOS ──────────────────────────────────────
   Toda demanda com alguém em "Quem cuida" aparece também em Pedidos, para a
   pergunta "o que falta cada um fazer" ter uma tela só. A coluna sai da
   etapa — não existe um segundo status para manter em dia:
     sem etapa (rascunho, banco)            → Novo
     produzindo (roteiro, gravação, arte)   → Fazendo
     esperando a aprovação do cliente       → Entregue
     pronto para publicar ou publicado      → Confirmado */
export const colunaDaDemanda = (c) => {
    const etapa = etapaAtual(c?.etiquetas)?.nome || null;
    if (!etapa) return 'novo';
    if (etapa === 'pronto para publicar' || etapa === 'publicado') return 'confirmado';
    if (/aprovação/.test(etapa) && c.status !== 'ajuste') return 'entregue';
    return 'fazendo';
};

/* ── CHECKLIST ────────────────────────────────────────────────────────────
   Os passos miúdos de uma demanda ("legenda", "capa", "trilha"). Mora na
   própria demanda, como lista: não tem dono, prazo nem status próprio —
   para isso existe pedido. */
export const checklistDe = (c) => Array.isArray(c?.checklist) ? c.checklist : [];

export const progressoHTML = (c) => {
    const lista = checklistDe(c);
    if (!lista.length) return '';
    const feitos = lista.filter(i => i.feito).length;
    const tudo = feitos === lista.length;
    return `<span class="tf-check ${tudo ? 'tf-check--ok' : ''}" title="Checklist: ${feitos} de ${lista.length}">
        <i data-lucide="${tudo ? 'square-check' : 'list-checks'}"></i>${feitos}/${lista.length}</span>`;
};

export function injectEstilosTarefas() {
    if (document.getElementById('tf-estilos')) return;
    const style = document.createElement('style');
    style.id = 'tf-estilos';
    style.textContent = `
        .tf-prio {
            display: inline-flex; align-items: center; gap: 3px;
            font-size: 11px; font-weight: 700; color: var(--cor); white-space: nowrap;
        }
        .tf-prio i, .tf-prio svg { width: 13px; height: 13px; fill: var(--cor); }
        .tf-quem { display: inline-flex; }
        .tf-check {
            display: inline-flex; align-items: center; gap: 3px;
            font-size: 11px; font-weight: 600; color: var(--text-secondary); white-space: nowrap;
        }
        .tf-check i, .tf-check svg { width: 13px; height: 13px; }
        .tf-check--ok { color: var(--success, #10B981); }

        /* ── Cartão colorido (classeDestaque) ──
           As cores da marca (tokens.css), não pastel: o vermelho-laranja do
           urgente, o dourado (--accent-gold), o violeta (--accent) e o ciano
           (--accent-cyan). Escritas aqui, e não pelos tokens de gradiente: a
           camada ds-tokens redefine --gradient-gold como laranja. Cada uma traz a tinta que lê bem sobre
           ela — branca no vermelho e no violeta, escura no dourado e no ciano.
           Os chips viram véus translúcidos da mesma tinta; os círculos das
           pessoas mantêm a cor própria. */
        .tf-cheio {
            background: var(--cheio) !important;
            border-color: transparent !important;
            color: var(--cheio-tinta) !important;
            box-shadow: 0 1px 0 rgba(255,255,255,0.18) inset, 0 10px 24px -14px var(--cheio-sombra);
        }
        .tf-cheio:hover { filter: brightness(1.06); }
        .tf-cheio--urgente {
            --cheio: linear-gradient(135deg in oklab, #E8335A 0%, #FF5C7A 45%, #FF7A45 100%);
            --cheio-sombra: #FF5C7A; --cheio-tinta: #FFFFFF; --cheio-veu: rgba(255,255,255,0.18);
        }
        .tf-cheio--alta {
            --cheio: linear-gradient(135deg in oklab, #FFD27F 0%, #FFC96B 50%, #FFB055 100%);
            --cheio-sombra: #FFB055; --cheio-tinta: #1A1206; --cheio-veu: rgba(26,18,6,0.10);
        }
        .tf-cheio--normal {
            --cheio: linear-gradient(135deg in oklab, #7A10D8 0%, #8E28F0 50%, #A855FF 100%);
            --cheio-sombra: #8E28F0; --cheio-tinta: #FFFFFF; --cheio-veu: rgba(255,255,255,0.16);
        }
        .tf-cheio--sugestao {
            --cheio: linear-gradient(135deg in oklab, #4FD1FF 0%, #7FE0FF 100%);
            --cheio-sombra: #4FD1FF; --cheio-tinta: #06202B; --cheio-veu: rgba(6,32,43,0.10);
        }
        .tf-cheio *:not(.pd-avatar):not(.pd-avatar *) { color: var(--cheio-tinta) !important; }
        .tf-cheio a:hover, .tf-cheio button:hover { opacity: 0.8; }
        .tf-cheio :is(.vz-etiqueta, .vz-status, .vz-fase, .qd-formato, .qd-marca, .qd-drive) {
            background: var(--cheio-veu) !important;
            border-color: var(--cheio-veu) !important;
        }
        .tf-cheio .tf-prio { --cor: var(--cheio-tinta); }
        .tf-cheio .tf-prio svg { fill: var(--cheio-tinta); }
        .tf-cheio .vz-ponto { box-shadow: 0 0 0 1.5px var(--cheio-tinta); }
        .tf-cheio .ds-icon-btn { background: transparent; }
        .tf-cheio .ds-icon-btn:hover { background: var(--cheio-veu); }
        .tf-cheio .pd-avatares .pd-avatar { box-shadow: 0 0 0 2px var(--cheio-sombra); }
        .tf-cheio .pd-autor { opacity: 0.85; }
    `;
    document.head.appendChild(style);
}
