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
    `;
    document.head.appendChild(style);
}
