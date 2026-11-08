import { store } from '../store.js';
import { hoje, diasAte, dataBR, esc } from './formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PEDIDOS — as regras, sem tela.

   Um pedido anda por quatro colunas, e a última é o ponto da coisa toda:
   "entregue" é a equipe dizendo que fez; "confirmado" é o CLIENTE dizendo que
   viu. Era exatamente essa diferença que sumia no WhatsApp — o "pode deixar"
   fechava o assunto do lado de cá, e o pedido voltava na peça seguinte.

   As telas (pages/pedidos.js, o botão do quadro, o aviso na demanda) leem
   tudo daqui, para nenhuma delas inventar o próprio jeito de dizer o que está
   atrasado ou o que está aberto.
   ═══════════════════════════════════════════════════════════════════════════ */

export const COLUNAS = [
    { id: 'novo',       nome: 'Novo',       icone: 'inbox',         dica: 'Anotado, ninguém começou.' },
    { id: 'fazendo',    nome: 'Fazendo',    icone: 'loader',        dica: 'Alguém está cuidando.' },
    { id: 'entregue',   nome: 'Entregue',   icone: 'send',          dica: 'Feito. Falta o cliente ver.' },
    { id: 'confirmado', nome: 'Confirmado', icone: 'circle-check',  dica: 'O cliente viu e aprovou. Fechado.' },
];

export const colunaDe = (id) => COLUNAS.find(c => c.id === id) || COLUNAS[0];

/** Aberto = ainda pede atenção de alguém da equipe. */
export const aberto = (p) => p.status !== 'confirmado';

/** Atrasado: passou do prazo e a equipe ainda não entregou. */
export const atrasado = (p) => !!p.prazo && p.prazo < hoje()
    && (p.status === 'novo' || p.status === 'fazendo');

/* As tabelas podem não existir ainda (migração não rodada). Toda tela que só
   MOSTRA pedidos de passagem — quadro, demanda — usa estas leituras, que
   respondem lista vazia em vez de derrubar a tela. */
export const lerPedidos  = () => store.pedidos.listar().catch(() => []);
export const lerDecisoes = () => store.decisoes.listar().catch(() => []);
export const lerEquipe   = () => store.equipe.listar().catch(() => []);

/** Equipe ativa, em ordem alfabética. */
export const ativos = (equipe) => equipe.filter(p => p.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

/* ── QUEM ESTÁ USANDO ─────────────────────────────────────────────────────
   Com login próprio, o email da sessão diz quem é. Com o login geral do
   estúdio, não diz — então a pessoa escolhe uma vez "eu sou a Marianna" e o
   navegador lembra. É conveniência deste aparelho, não dado do sistema: serve
   para o filtro "Comigo" e para assinar quem anotou o pedido. */
const CHAVE_EU = '5k9_chronos_eu';

export const euSou = (equipe) => {
    const email = store.usuario()?.email?.toLowerCase();
    const pelaSessao = email && equipe.find(p => p.email?.toLowerCase() === email);
    if (pelaSessao) return { pessoa: pelaSessao, pelaSessao: true };
    let id = null;
    try { id = localStorage.getItem(CHAVE_EU); } catch { /* sem armazenamento */ }
    return { pessoa: equipe.find(p => p.id === id) || null, pelaSessao: false };
};

export const lembrarEu = (id) => {
    try { id ? localStorage.setItem(CHAVE_EU, id) : localStorage.removeItem(CHAVE_EU); }
    catch { /* sem armazenamento: escolhe de novo na próxima */ }
};

/* ── A PESSOA EM UM CÍRCULO ───────────────────────────────────────────────
   Iniciais com uma cor que sai do nome: a mesma pessoa tem sempre a mesma cor,
   em qualquer tela, sem ninguém precisar escolher. */
const CORES = ['#A855FF', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#8B5CF6'];

export const corDe = (nome = '') => {
    let h = 0;
    for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CORES[h % CORES.length];
};

export const iniciais = (nome = '') =>
    nome.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?';

export const avatarHTML = (pessoa, { tamanho = 22 } = {}) => pessoa
    ? `<span class="pd-avatar" style="--cor:${corDe(pessoa.nome)};--tam:${tamanho}px" title="${esc(pessoa.nome)}">${esc(iniciais(pessoa.nome))}</span>`
    : `<span class="pd-avatar pd-avatar--vazio" style="--tam:${tamanho}px" title="Sem responsável"><i data-lucide="user-round"></i></span>`;

/** "vence hoje", "atrasado 3 dias", "até 12/11" — o prazo em uma expressão. */
export const prazoTexto = (p) => {
    if (!p.prazo) return null;
    const d = diasAte(p.prazo);
    if (p.status === 'entregue' || p.status === 'confirmado') return { texto: `prazo ${dataBR(p.prazo).slice(0, 5)}`, tom: 'neutro' };
    if (d < 0)  return { texto: `atrasado ${-d} dia${d === -1 ? '' : 's'}`, tom: 'risco' };
    if (d === 0) return { texto: 'vence hoje', tom: 'atencao' };
    if (d === 1) return { texto: 'vence amanhã', tom: 'atencao' };
    return { texto: `até ${dataBR(p.prazo).slice(0, 5)}`, tom: 'neutro' };
};

/** Há quanto tempo o cliente pediu: o número que mais pesa numa cobrança. */
export const idadeTexto = (p) => {
    const d = -diasAte(p.pedido_em || String(p.criado_em || '').slice(0, 10) || hoje());
    if (d <= 0) return 'pedido hoje';
    if (d === 1) return 'pedido ontem';
    return `pedido há ${d} dias`;
};

/* Ao mudar de coluna, `concluido_em` acompanha: é a data em que o assunto
   fechou de verdade, e é por ela que a coluna Confirmado esconde o que já é
   história. */
export const comStatus = (p, status) => ({
    ...p, status,
    concluido_em: status === 'confirmado' ? (p.concluido_em || new Date().toISOString()) : null,
});
