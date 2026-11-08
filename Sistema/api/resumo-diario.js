/* ═══════════════════════════════════════════════════════════════════════════
   RESUMO DA MANHÃ — cada pessoa recebe o que é dela, uma vez por dia útil.

   Chamado pelo agendamento da Vercel (vercel.json → crons), às 11h UTC = 8h
   de Brasília, de segunda a sexta. No plano gratuito da Vercel o horário é
   aproximado: pode chegar a qualquer momento dentro daquela hora.

   ── SÓ MANDA QUANDO HÁ MOTIVO ─────────────────────────────────────────────
   Uma pessoa recebe o email se tem pedido ATRASADO, que VENCE HOJE ou NOVO
   (marcado e ainda não começado). Quem não tem nada disso não recebe nada: um
   resumo que chega todo dia dizendo "tudo certo" ensina a ignorar o resumo.

   ── POR QUE A SERVICE ROLE ───────────────────────────────────────────────
   Às 8h ninguém está logado para emprestar a sessão, como acontece em
   avisar.js. A função lê o banco com a chave de serviço, que fica só na
   Vercel, e lê apenas três tabelas: equipe, pedidos e clientes.

   ── QUEM PODE DISPARAR ────────────────────────────────────────────────────
   Só a própria Vercel: ela manda CRON_SECRET no cabeçalho, e sem ele a
   função recusa. Sem isso, qualquer pessoa que achasse o endereço poderia
   encher a caixa da equipe.
   ═══════════════════════════════════════════════════════════════════════════ */

const { hojeBR, ler, enviar, moldura, linhaPedido, esc } = require('./_avisos.js');

/** Agrupa os pedidos abertos de cada pessoa. Exportado para teste. */
const montarResumos = ({ equipe, pedidos, clientes, hoje }) => {
    const nomeCliente = new Map(clientes.map(c => [c.id, c.nome]));
    const resumos = [];
    for (const pessoa of equipe) {
        if (pessoa.ativo === false || !pessoa.email) continue;
        const meus = pedidos.filter(p => (p.responsaveis?.length ? p.responsaveis : [p.responsavel_id]).includes(pessoa.id)
            && (p.status === 'novo' || p.status === 'fazendo'));
        const atrasados = meus.filter(p => p.prazo && p.prazo < hoje);
        const deHoje    = meus.filter(p => p.prazo === hoje);
        const novos     = meus.filter(p => p.status === 'novo' && !atrasados.includes(p) && !deHoje.includes(p));
        const resto     = meus.filter(p => !atrasados.includes(p) && !deHoje.includes(p) && !novos.includes(p));
        if (!atrasados.length && !deHoje.length && !novos.length) continue;
        resumos.push({ pessoa, atrasados, deHoje, novos, resto, nomeCliente });
    }
    return resumos;
};

const secao = (titulo, cor, lista, nomeCliente, hoje) => lista.length ? `
    <h2 style="margin:18px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${cor};">${titulo} (${lista.length})</h2>
    <ul style="margin:0;padding-left:18px;">${lista.map(p => linhaPedido(p, nomeCliente.get(p.cliente_id) || '', hoje)).join('')}</ul>` : '';

const emailDe = ({ pessoa, atrasados, deHoje, novos, resto, nomeCliente }, hoje, host) => {
    const partes = [
        atrasados.length && `${atrasados.length} atrasado${atrasados.length > 1 ? 's' : ''}`,
        deHoje.length && `${deHoje.length} para hoje`,
        novos.length && `${novos.length} novo${novos.length > 1 ? 's' : ''}`,
    ].filter(Boolean);
    const primeiro = pessoa.nome.split(' ')[0];
    return {
        para: pessoa.email,
        assunto: `Seus pedidos hoje: ${partes.join(', ')}`,
        html: moldura({
            titulo: `Bom dia, ${esc(primeiro)}. ${partes.join(' · ')}.`,
            corpo: secao('Atrasados', '#d92d20', atrasados, nomeCliente, hoje)
                 + secao('Vencem hoje', '#b54708', deHoje, nomeCliente, hoje)
                 + secao('Novos para você', '#8b3dff', novos, nomeCliente, hoje)
                 + secao('Em andamento', '#5d5d6b', resto, nomeCliente, hoje),
            botao: { href: `${host}/pedidos`, rotulo: 'Abrir os pedidos' },
        }),
        texto: [...atrasados.map(p => `ATRASADO: ${p.texto}`), ...deHoje.map(p => `HOJE: ${p.texto}`),
                ...novos.map(p => `NOVO: ${p.texto}`), '', `${host}/pedidos`].join('\n'),
    };
};

module.exports = async (req, res) => {
    const segredo = process.env.CRON_SECRET;
    if (!segredo || req.headers.authorization !== `Bearer ${segredo}`) {
        return res.status(401).json({ erro: 'Não autorizado.' });
    }
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!chave) return res.status(500).json({ erro: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' });

    try {
        const [equipe, pedidos, clientes] = await Promise.all([
            ler('vz_equipe?select=id,nome,email,ativo', chave),
            ler('vz_pedidos?status=in.(novo,fazendo)&select=id,cliente_id,texto,prazo,status,responsavel_id,responsaveis', chave),
            ler('vz_clientes?select=id,nome', chave),
        ]);
        const hoje = hojeBR();
        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const resumos = montarResumos({ equipe, pedidos, clientes, hoje });

        // Um por vez: são três pessoas, e o Resend limita envios por segundo.
        const resultado = [];
        for (const r of resumos) {
            try {
                await enviar(emailDe(r, hoje, host));
                resultado.push({ para: r.pessoa.nome, enviado: true });
            } catch (e) {
                console.error('[resumo-diario]', r.pessoa.nome, e);
                resultado.push({ para: r.pessoa.nome, enviado: false, erro: e.message });
            }
        }
        return res.status(200).json({ hoje, resultado });
    } catch (e) {
        console.error('[resumo-diario]', e);
        return res.status(500).json({ erro: e.message });
    }
};

module.exports.montarResumos = montarResumos;
module.exports.emailDe = emailDe;
