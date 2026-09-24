/* ═══════════════════════════════════════════════════════════════════════════
   PRÉVIA DO LINK — o card do WhatsApp com o título da demanda.

   O sistema é uma página só, montada no navegador: quem visita
   /conteudo/set/alguma-coisa recebe o mesmo index.html de sempre, e o robô do
   WhatsApp — que não roda JavaScript — só enxerga "5K9 Chronos".

   Esta função responde SÓ a esses robôs (o vercel.json desvia para cá pelo
   user-agent; gente continua indo direto para o sistema). Ela pergunta ao
   banco o título da demanda e devolve uma página mínima com as etiquetas que
   o card lê.

   ── O QUE ENTRA NO CARD ──────────────────────────────────────────────────
   Só o que a função vz_previa entrega: título, cliente, data, formato. O card
   é público para quem tem o link — Drive, roteiro e etapa ficam de fora (ver
   db/migracao-previa.sql).

   ── QUANDO O BANCO NÃO RESPONDE ───────────────────────────────────────────
   Card genérico, nunca erro: um link de demanda sem prévia bonita ainda é um
   link que funciona.

   A chave abaixo é a `anon`, a mesma que vai no código do navegador
   (lib/supabase-config.js) — pública por natureza. Repetida aqui porque a
   função roda no servidor e não importa os módulos do navegador.
   ═══════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://dppgtlclpgdvxhnnulgf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcGd0bGNscGdkdnhobm51bGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzcyNjUsImV4cCI6MjEwMTgxMzI2NX0.31Z-UOk4RUYBz4WtqNYmktiocgBIryTe6bChj9DHZiA';

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const FORMATO_ARTE = /carro?ss?el|carousel|est[áa]tico|imagem|foto|arte|infogr[áa]fico/i;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** "2026-09-23" → "qua, 23/09" */
const dataCurta = (iso) => {
    const [a, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    if (!a) return '';
    const dia = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
    return `${dia}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
};

const buscarPrevia = async (ref) => {
    try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vz_previa`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON,
                Authorization: `Bearer ${SUPABASE_ANON}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ p_ref: ref }),
            signal: AbortSignal.timeout(3000),
        });
        if (!r.ok) return null;
        const texto = await r.text();
        return texto ? JSON.parse(texto) : null;
    } catch {
        return null;
    }
};

/** A página que o robô lê. Exportada para poder ser testada sem rede. */
const montarPagina = (previa, url) => {
    const titulo = previa?.titulo || '5K9 Chronos';
    const descricao = previa
        ? [previa.cliente, dataCurta(previa.data), FORMATO_ARTE.test(previa.formato || '') ? 'Carrossel' : 'Reels']
            .filter(Boolean).join(' · ') + ' — abra para ver o roteiro e os detalhes.'
        : 'Cronograma e roteiros de conteúdo do 5K9 Studio.';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(titulo)}</title>
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="5K9 Chronos">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descricao)}">
</head>
<body><p><a href="${esc(url)}">${esc(titulo)}</a></p></body>
</html>`;
};

module.exports = async (req, res) => {
    // /conteudo/set/apelido chega aqui como ?ref=set/apelido (ver vercel.json)
    const ref = String(req.query?.ref || '').replace(/^\/+|\/+$/g, '').slice(0, 200);
    let limpo = ref;
    try { limpo = decodeURIComponent(ref); } catch { /* endereço torto: usa como veio */ }
    const previa = limpo ? await buscarPrevia(limpo) : null;
    const url = `https://${req.headers.host || 'chronos.5k9.studio'}/conteudo/${ref}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // O robô guarda o card por conta própria; um minuto aqui só evita
    // perguntar ao banco a cada colagem do mesmo link.
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).send(montarPagina(previa, url));
};

module.exports.montarPagina = montarPagina;
