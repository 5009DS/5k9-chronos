/* ═══════════════════════════════════════════════════════════════════════════
   AVISOS POR EMAIL — o que as duas funções (avisar.js e resumo-diario.js)
   têm em comum: falar com o banco, falar com o Resend e montar o email.

   O sublinhado no nome é o que a Vercel entende como "não é endpoint": este
   arquivo é importado pelas funções, mas ninguém o chama pela internet.

   ── AS VARIÁVEIS DE AMBIENTE (Vercel → Settings → Environment Variables) ──
     RESEND_API_KEY             a chave do Resend. Sem ela, nada é enviado.
     EMAIL_REMETENTE            opcional. "Nome <endereco@dominio>", num domínio
                                verificado no Resend. Padrão abaixo.
     SUPABASE_SERVICE_ROLE_KEY  só o resumo diário usa: ele roda sozinho, sem
                                ninguém logado, e precisa ler os pedidos.
     CRON_SECRET                só o resumo diário usa: a Vercel manda essa
                                senha ao chamar o agendamento, e é ela que
                                impede um estranho de disparar os emails.

   Nenhuma delas vai para o navegador nem para o repositório.
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://dppgtlclpgdvxhnnulgf.supabase.co';
// A chave anon pública, a mesma de lib/supabase-config.js (ver api/previa.js).
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcGd0bGNscGdkdnhobm51bGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzcyNjUsImV4cCI6MjEwMTgxMzI2NX0.31Z-UOk4RUYBz4WtqNYmktiocgBIryTe6bChj9DHZiA';

const REMETENTE_PADRAO = 'Chronos 5K9 <avisos@avisos.5k9.studio>';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "2026-11-12" → "12/11" */
const diaMes = (iso) => {
    const [, m, d] = String(iso || '').slice(0, 10).split('-');
    return d && m ? `${d}/${m}` : '';
};

/** Hoje no horário de Brasília — o servidor roda em UTC. */
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/**
 * Lê do banco pela API REST.
 * @param {string} caminho  ex.: "vz_pedidos?id=eq.abc&select=*"
 * @param {string} chave    o token de quem está logado, ou a service role
 */
const ler = async (caminho, chave) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${chave}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
        const erro = new Error(`banco respondeu ${r.status}`);
        erro.status = r.status;
        throw erro;
    }
    return r.json();
};

/**
 * Grava pela API REST (PATCH) e devolve as linhas que mudaram. É o jeito de
 * "reservar" um aviso: só volta a linha que ainda estava sem marca, então
 * duas chamadas ao mesmo tempo não anunciam o mesmo tema duas vezes.
 */
const atualizar = async (caminho, chave, corpo) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${chave}`,
                   'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
        const erro = new Error(`banco respondeu ${r.status}`);
        erro.status = r.status;
        throw erro;
    }
    return r.json();
};

/** Quem é o dono deste token: email e provedor ("email" ou "google"). */
const quemE = async (token) => {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
        const erro = new Error('sessão inválida');
        erro.status = 401;
        throw erro;
    }
    const u = await r.json();
    return { email: String(u.email || '').toLowerCase(), provedor: u.app_metadata?.provider || 'email' };
};

/** O primeiro nome de quem tem este email na equipe, ou "O estúdio" (login master). */
const nomeDe = (email, equipe) => {
    const p = equipe.find(x => String(x.email || '').toLowerCase() === String(email || '').toLowerCase());
    return p ? p.nome.split(' ')[0] : 'O estúdio';
};

/** Envia pelo Resend. Devolve o id do email. */
const enviar = async ({ para, assunto, html, texto }) => {
    const chave = process.env.RESEND_API_KEY;
    if (!chave) throw new Error('RESEND_API_KEY não configurada na Vercel.');
    const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: process.env.EMAIL_REMETENTE || REMETENTE_PADRAO,
            to: [para], subject: assunto, html, text: texto,
        }),
        signal: AbortSignal.timeout(10000),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Resend: ${corpo.message || r.status}`);
    return corpo.id;
};

/* ── O EMAIL ──────────────────────────────────────────────────────────────
   Tabela e estilo em linha: é o que todo leitor de email entende, do Gmail
   ao Outlook. Fundo claro de propósito — modo escuro em email é sorteio. */
const moldura = ({ titulo, corpo, botao, secao = 'Pedidos' }) => `<!DOCTYPE html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#17171c;">
<tr><td style="padding:28px 28px 8px;">
<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b3dff;">5K9 Chronos · ${esc(secao)}</div>
<h1 style="margin:10px 0 0;font-size:20px;line-height:1.3;">${titulo}</h1>
</td></tr>
<tr><td style="padding:8px 28px 8px;font-size:15px;line-height:1.55;">${corpo}</td></tr>
${botao ? `<tr><td style="padding:12px 28px 28px;">
<a href="${esc(botao.href)}" style="display:inline-block;background:#8b3dff;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:8px;">${esc(botao.rotulo)}</a>
</td></tr>` : ''}
</table>
<p style="font-family:Arial,sans-serif;font-size:11px;color:#9a9aa5;margin:14px 0 0;">Aviso automático do Chronos para a equipe 5K9.</p>
</td></tr></table>
</body></html>`;

/** Uma linha de pedido, com o que importa: o texto, o cliente, o prazo. */
const linhaPedido = (p, cliente, hoje) => {
    let prazo = '';
    if (p.prazo) {
        if (p.prazo < hoje) prazo = `<span style="color:#d92d20;font-weight:700;">atrasado · era ${diaMes(p.prazo)}</span>`;
        else if (p.prazo === hoje) prazo = '<span style="color:#b54708;font-weight:700;">vence hoje</span>';
        else prazo = `até ${diaMes(p.prazo)}`;
    }
    const meta = [esc(cliente), prazo, p.status === 'fazendo' ? 'fazendo' : ''].filter(Boolean).join(' · ');
    return `<li style="margin:0 0 10px;"><b>${esc(p.texto)}</b><br><span style="font-size:13px;color:#5d5d6b;">${meta}</span></li>`;
};

/* ── TEMAS NOVOS ──────────────────────────────────────────────────────────
   Montado aqui porque sai de dois lugares: na hora (api/avisar-temas.js) e,
   para o que ficou para trás, no resumo da manhã (api/resumo-diario.js).

   Um email por pessoa e por autor, nunca para o próprio autor. */
const NOMES_FORMATO = { reel: 'Reel', reels: 'Reel', video: 'Vídeo', carrossel: 'Carrossel', story: 'Story', stories: 'Stories' };
const formatoTexto = (f) => f ? (NOMES_FORMATO[String(f).toLowerCase()] || String(f)) : '';

const quandoTema = (t) => {
    if (t.banco_em) return 'no banco de temas';
    if ((t.etiquetas || []).some(e => String(e).trim().toLowerCase() === 'aguardando data')) return 'sem data';
    return t.data ? `para ${diaMes(t.data)}` : 'sem data';
};

const emailsDeTemas = ({ temas, equipe, clientes, host }) => {
    const nomeCliente = new Map(clientes.map(c => [c.id, c.nome]));
    const porAutor = new Map();
    for (const t of temas) {
        const autor = String(t.criado_por || '').toLowerCase();
        if (!porAutor.has(autor)) porAutor.set(autor, []);
        porAutor.get(autor).push(t);
    }

    const emails = [];
    for (const [autor, lista] of porAutor) {
        const quem = nomeDe(autor, equipe);
        const porCliente = new Map();
        for (const t of lista) {
            if (!porCliente.has(t.cliente_id)) porCliente.set(t.cliente_id, []);
            porCliente.get(t.cliente_id).push(t);
        }
        const clientesDaLeva = [...porCliente.keys()];
        const umCliente = clientesDaLeva.length === 1 ? (nomeCliente.get(clientesDaLeva[0]) || 'cliente') : null;
        const n = lista.length;
        const resumo = `${quem} subiu ${n} tema${n > 1 ? 's' : ''} novo${n > 1 ? 's' : ''}${umCliente ? ` para ${umCliente}` : ''}`;
        const corpo = [...porCliente].map(([id, ts]) => `
            <h2 style="margin:18px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#5d5d6b;">${esc(nomeCliente.get(id) || 'Cliente')} (${ts.length})</h2>
            <ul style="margin:0;padding-left:18px;">${ts.map(t => `
                <li style="margin:0 0 8px;"><b>${esc(t.titulo)}</b><br><span style="font-size:13px;color:#5d5d6b;">${
                    [formatoTexto(t.formato), quandoTema(t)].filter(Boolean).map(esc).join(' · ')}</span></li>`).join('')}
            </ul>`).join('');
        const href = clientesDaLeva.length === 1 ? `${host}/quadro/${encodeURIComponent(clientesDaLeva[0])}` : host;

        for (const pessoa of equipe) {
            if (pessoa.ativo === false || !pessoa.email) continue;
            if (String(pessoa.email).toLowerCase() === autor) continue;
            emails.push({
                para: pessoa.email,
                assunto: resumo.slice(0, 140),
                html: moldura({ secao: 'Temas novos', titulo: `${esc(resumo)}.`, corpo,
                                botao: { href, rotulo: umCliente ? 'Abrir o quadro' : 'Abrir o Chronos' } }),
                texto: [`${resumo}:`, '', ...lista.map(t => `- ${t.titulo} (${nomeCliente.get(t.cliente_id) || ''}, ${quandoTema(t)})`), '', href].join('\n'),
            });
        }
    }
    return emails;
};

module.exports = { SUPABASE_URL, SUPABASE_ANON, esc, diaMes, hojeBR, ler, atualizar, quemE, nomeDe, enviar,
                   moldura, linhaPedido, formatoTexto, emailsDeTemas };
