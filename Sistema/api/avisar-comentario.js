/* ═══════════════════════════════════════════════════════════════════════════
   "MARIANNA COMENTOU NO PEDIDO" — o aviso da conversa da equipe.

   O navegador manda só o id do comentário recém-salvo. Quem recebe sai do
   banco, nunca da chamada:
     · quem cuida do pedido;
     · quem foi mencionado com @Nome no texto;
     · numa resposta, quem escreveu o comentário respondido;
   menos quem comentou (o dono do token). Um email por pessoa.

   Pela mesma razão de api/avisar.js: a função não aceita "mande isto para
   tal endereço", então não vira disparador de spam com o domínio do estúdio.
   ═══════════════════════════════════════════════════════════════════════════ */

const { esc, ler, quemE, enviar, moldura } = require('./_avisos.js');

/** Os ids da equipe mencionados com @PrimeiroNome. Exportado para teste. */
const mencionados = (texto, equipe) => {
    const t = String(texto || '').toLowerCase();
    return equipe.filter(p => {
        const nome = String(p.nome || '').split(' ')[0].toLowerCase();
        return nome && new RegExp(`@${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(t);
    }).map(p => p.id);
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(corpo.comentario_id || '').slice(0, 100);
    if (!token || !id) return res.status(400).json({ erro: 'Falta o comentário ou a sessão.' });

    try {
        const eu = await quemE(token);
        const [c] = await ler(`vz_comentarios?id=eq.${encodeURIComponent(id)}&select=*`, token);
        if (!c || c.tipo !== 'comentario' || c.alvo !== 'pedido') return res.status(404).json({ erro: 'Comentário não encontrado.' });
        // Só quem escreveu dispara o aviso do próprio comentário.
        if (String(c.autor_email || '').toLowerCase() !== eu.email) return res.status(403).json({ erro: 'O comentário não é seu.' });
        // Aviso de comentário velho não sai: é a mesma porta reaproveitada.
        if (Date.now() - new Date(c.criado_em).getTime() > 10 * 60 * 1000) return res.status(200).json({ enviados: [], motivo: 'antigo' });

        const [[pedido], equipe] = await Promise.all([
            ler(`vz_pedidos?id=eq.${encodeURIComponent(c.alvo_id)}&select=id,cliente_id,texto,responsaveis,responsavel_id`, token),
            ler('vz_equipe?select=id,nome,email,ativo', token),
        ]);
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
        const [cliente] = await ler(`vz_clientes?id=eq.${encodeURIComponent(pedido.cliente_id)}&select=id,nome`, token);

        let respondido = null;
        if (c.resposta_a) [respondido] = await ler(`vz_comentarios?id=eq.${encodeURIComponent(c.resposta_a)}&select=autor_email`, token);

        const ids = new Set([
            ...(pedido.responsaveis?.length ? pedido.responsaveis : (pedido.responsavel_id ? [pedido.responsavel_id] : [])),
            ...mencionados(c.texto, equipe),
        ]);
        const emails = new Set(equipe.filter(p => ids.has(p.id)).map(p => String(p.email || '').toLowerCase()));
        if (respondido?.autor_email) emails.add(String(respondido.autor_email).toLowerCase());
        emails.delete(eu.email);

        const pessoas = equipe.filter(p => p.ativo !== false && p.email && emails.has(String(p.email).toLowerCase()));
        if (!pessoas.length) return res.status(200).json({ enviados: [], motivo: 'ninguém a avisar' });

        const autor = c.autor_nome ? c.autor_nome.split(' ')[0] : 'O estúdio';
        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const href = `${host}/pedidos/${encodeURIComponent(pedido.cliente_id)}?abrir=${encodeURIComponent(pedido.id)}`;
        const acao = c.resposta_a ? 'respondeu' : 'comentou';
        const mencoes = new Set(mencionados(c.texto, equipe));

        const enviados = [];
        for (const p of pessoas) {
            const porque = mencoes.has(p.id) ? 'mencionou você' : acao;
            try {
                await enviar({
                    para: p.email,
                    assunto: `${autor} ${porque}: ${pedido.texto}`.slice(0, 140),
                    html: moldura({
                        secao: 'Conversa',
                        titulo: `${esc(autor)} ${esc(porque)} num pedido${cliente ? ` de ${esc(cliente.nome)}` : ''}`,
                        corpo: `
                            <p style="margin:0 0 10px;color:#5d5d6b;font-size:13px;">${esc(pedido.texto)}</p>
                            <div style="border-left:3px solid #d9c4ff;padding:6px 0 6px 12px;color:#17171c;white-space:pre-wrap;">${esc(String(c.texto).slice(0, 2000))}</div>`,
                        botao: { href, rotulo: 'Responder no Chronos' },
                    }),
                    texto: `${autor} ${porque} em "${pedido.texto}":\n\n${c.texto}\n\n${href}`,
                });
                enviados.push(p.nome.split(' ')[0]);
            } catch (e) {
                console.error('[avisar-comentario]', p.nome, e);
            }
        }
        return res.status(200).json({ enviados });
    } catch (e) {
        console.error('[avisar-comentario]', e);
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};

module.exports.mencionados = mencionados;
