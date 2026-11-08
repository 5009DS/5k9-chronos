/* ═══════════════════════════════════════════════════════════════════════════
   MÊS ORGANIZADO — "o Andrew distribuiu dezembro da Dra. Fernanda".

   O botão fica no quadro, só para admin (pages/quadro.js → lib/avisos.js).
   Quem organizou clica quando terminou de pôr cada tema no seu dia, e a
   equipe recebe a lista dia a dia: é a hora de começar a escrever e a gravar.

   ── QUEM PODE DISPARAR ────────────────────────────────────────────────────
   Admin, conferido AQUI e não só na tela: o login master (email e senha, ou
   a conta master pelo Google — CONTAS_MASTER em _avisos.js) ou
   alguém da equipe com papel "admin". O que vai no email sai do banco; da
   chamada só vêm o cliente, o mês e um recado opcional, que é escapado.
   ═══════════════════════════════════════════════════════════════════════════ */

const { esc, diaMes, ler, quemE, nomeDe, enviar, moldura, formatoTexto, ehMaster } = require('./_avisos.js');

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
               'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const diaDaSemana = (iso) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const semData = (c) => (c.etiquetas || []).some(e => String(e).trim().toLowerCase() === 'aguardando data');

/** Monta o email. Exportado para teste. */
const montar = ({ cliente, mes, conteudos, quem, recado, host }) => {
    const [ano, m] = mes.split('-').map(Number);
    const nomeMes = MESES[m - 1];
    const titulo = `${quem} organizou ${nomeMes} de ${cliente.nome}`;
    const href = `${host}/quadro/${encodeURIComponent(cliente.id)}`;

    const linhas = conteudos.map(c => `
        <tr>
            <td style="padding:7px 12px 7px 0;white-space:nowrap;vertical-align:top;color:#5d5d6b;font-size:13px;">
                ${diaDaSemana(c.data)} <b style="color:#17171c;">${diaMes(c.data)}</b></td>
            <td style="padding:7px 0;vertical-align:top;">
                <b>${esc(c.titulo)}</b>
                ${[formatoTexto(c.formato), c.responsavel].filter(Boolean).length ? `<br><span style="font-size:13px;color:#5d5d6b;">${
                    [formatoTexto(c.formato), c.responsavel].filter(Boolean).map(esc).join(' · ')}</span>` : ''}
            </td>
        </tr>`).join('');

    return {
        assunto: `${titulo[0].toUpperCase()}${titulo.slice(1)} (${conteudos.length} conteúdo${conteudos.length === 1 ? '' : 's'})`.slice(0, 140),
        html: moldura({
            secao: 'Mês organizado',
            titulo: `${esc(titulo)}.`,
            corpo: `
                <p style="margin:0 0 14px;">${conteudos.length} conteúdo${conteudos.length === 1 ? '' : 's'} com dia marcado em ${nomeMes} de ${ano}.</p>
                ${recado ? `<div style="border-left:3px solid #d9c4ff;padding:4px 0 4px 12px;margin:0 0 16px;color:#3d3d48;white-space:pre-wrap;">${esc(recado)}</div>` : ''}
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse;">${linhas}</table>`,
            botao: { href, rotulo: 'Abrir o quadro' },
        }),
        texto: [`${titulo}:`, '', ...(recado ? [recado, ''] : []),
                ...conteudos.map(c => `${diaDaSemana(c.data)} ${diaMes(c.data)} — ${c.titulo}`), '', href].join('\n'),
    };
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const clienteId = String(corpo.cliente_id || '').slice(0, 100);
    const mes = String(corpo.mes || '');
    const recado = String(corpo.recado || '').slice(0, 1000).trim();
    if (!token || !clienteId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
        return res.status(400).json({ erro: 'Falta a sessão, o cliente ou o mês.' });
    }

    try {
        const eu = await quemE(token);
        const equipe = await ler('vz_equipe?select=id,nome,email,ativo,papel', token);
        const admin = eu.provedor === 'email' || ehMaster(eu.email)
            || equipe.some(p => p.ativo !== false && p.papel === 'admin' && String(p.email || '').toLowerCase() === eu.email);
        if (!admin) return res.status(403).json({ erro: 'Só quem organiza o mês (admin) pode mandar este aviso.' });

        const [ano, m] = mes.split('-').map(Number);
        const seguinte = m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, '0')}-01`;
        const [[cliente], todos] = await Promise.all([
            ler(`vz_clientes?id=eq.${encodeURIComponent(clienteId)}&select=id,nome`, token),
            ler(`vz_conteudos?cliente_id=eq.${encodeURIComponent(clienteId)}&banco_em=is.null`
                + `&data=gte.${mes}-01&data=lt.${seguinte}`
                + '&select=id,titulo,data,formato,responsavel,etiquetas&order=data.asc', token),
        ]);
        if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado.' });
        const conteudos = todos.filter(c => !semData(c));
        if (!conteudos.length) return res.status(400).json({ erro: 'Este mês não tem conteúdo com dia marcado.' });

        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const email = montar({ cliente, mes, conteudos, quem: nomeDe(eu.email, equipe), recado, host });

        const enviados = [];
        for (const p of equipe) {
            if (p.ativo === false || !p.email || String(p.email).toLowerCase() === eu.email) continue;
            try { await enviar({ ...email, para: p.email }); enviados.push(p.id); }
            catch (e) { console.error('[mes-organizado]', p.nome, e); }
        }
        if (!enviados.length) return res.status(500).json({ erro: 'Nenhum email saiu. Veja os logs.' });
        return res.status(200).json({ enviados });
    } catch (e) {
        console.error('[mes-organizado]', e);
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};

module.exports.montar = montar;
