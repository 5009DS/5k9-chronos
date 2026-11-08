/* ═══════════════════════════════════════════════════════════════════════════
   "FULANO TE MARCOU NUMA DEMANDA" — o aviso do "Quem cuida".

   Mesmo desenho de api/avisar.js (pedidos): o navegador manda o id da
   demanda e os ids de QUEM avisar, e só é avisado quem de fato está em
   `responsaveis` no banco. Endereço, título e prazo saem do banco — a
   função não vira disparador de email com o domínio do estúdio.
   ═══════════════════════════════════════════════════════════════════════════ */

const { esc, diaMes, ler, enviar, moldura, formatoTexto } = require('./_avisos.js');

const PRIORIDADE = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(corpo.conteudo_id || '').slice(0, 100);
    const pedidosPara = Array.isArray(corpo.para) ? corpo.para.map(String).slice(0, 20) : [];
    const de = String(corpo.de || '').slice(0, 60).trim();
    if (!token || !id) return res.status(400).json({ erro: 'Falta a demanda ou a sessão.' });

    try {
        const [c] = await ler(`vz_conteudos?id=eq.${encodeURIComponent(id)}`
            + '&select=id,cliente_id,titulo,data,formato,prioridade,responsaveis,etiquetas,banco_em', token);
        if (!c) return res.status(404).json({ erro: 'Demanda não encontrada.' });

        const daDemanda = c.responsaveis || [];
        const alvos = daDemanda.filter(x => pedidosPara.includes(x));
        if (!alvos.length) return res.status(200).json({ enviados: [], motivo: 'ninguém a avisar' });

        const lista = daDemanda.map(encodeURIComponent).join(',');
        const [equipe, [cliente]] = await Promise.all([
            ler(`vz_equipe?id=in.(${lista})&select=id,nome,email,ativo`, token),
            ler(`vz_clientes?id=eq.${encodeURIComponent(c.cliente_id)}&select=id,nome`, token),
        ]);
        const pessoas = equipe.filter(p => alvos.includes(p.id) && p.email && p.ativo !== false);
        if (!pessoas.length) return res.status(200).json({ enviados: [], motivo: 'sem email' });

        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const href = `${host}/conteudo/${encodeURIComponent(c.id)}`;
        const nomeCliente = cliente?.nome || 'cliente';
        const semData = (c.etiquetas || []).some(e => String(e).trim().toLowerCase() === 'aguardando data');
        const linhas = [
            ['Cliente', nomeCliente],
            ['Publicação', c.banco_em ? 'no banco de temas' : semData || !c.data ? 'sem data' : diaMes(c.data)],
            ...(c.formato ? [['Formato', formatoTexto(c.formato)]] : []),
            ...(PRIORIDADE[c.prioridade] ? [['Prioridade', PRIORIDADE[c.prioridade]]] : []),
        ];

        const enviados = [];
        for (const pessoa of pessoas) {
            const outros = equipe.filter(o => o.id !== pessoa.id).map(o => o.nome.split(' ')[0]);
            const todas = [...linhas, ...(outros.length ? [['Junto com', outros.join(', ')]] : [])];
            try {
                await enviar({
                    para: pessoa.email,
                    assunto: `${c.prioridade === 'urgente' ? '[Urgente] ' : ''}${nomeCliente}: ${c.titulo}`.slice(0, 140),
                    html: moldura({
                        secao: 'Demandas',
                        titulo: `${esc(pessoa.nome.split(' ')[0])}, ${de ? `${esc(de)} te marcou` : 'você foi marcado'} numa demanda`,
                        corpo: `
                            <p style="margin:0 0 14px;font-size:17px;font-weight:700;">${esc(c.titulo)}</p>
                            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 6px;">
                                ${todas.map(([k, v]) => `<tr><td style="color:#5d5d6b;padding:2px 14px 2px 0;">${k}</td><td style="font-weight:600;">${esc(v)}</td></tr>`).join('')}
                            </table>`,
                        botao: { href, rotulo: 'Abrir a demanda' },
                    }),
                    texto: `${de ? `${de} te marcou` : 'Você foi marcado'} numa demanda de ${nomeCliente}:\n\n${c.titulo}\n\n${href}`,
                });
                enviados.push(pessoa.id);
            } catch (e) {
                console.error('[avisar-conteudo]', pessoa.nome, e);
            }
        }
        if (!enviados.length) return res.status(500).json({ erro: 'Nenhum email saiu. Veja os logs.' });
        return res.status(200).json({ enviados });
    } catch (e) {
        console.error('[avisar-conteudo]', e);
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};
