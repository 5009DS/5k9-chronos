/* ═══════════════════════════════════════════════════════════════════════════
   AVISO NA HORA — "fulano te marcou num pedido".

   O navegador chama esta função logo depois de salvar um pedido com um
   responsável novo (components/pedidos.js). Ela recebe SÓ o id do pedido.

   ── POR QUE SÓ O ID ──────────────────────────────────────────────────────
   Destinatário, assunto e texto saem do BANCO, nunca do pedido HTTP. Se a
   função aceitasse "mande isto para tal email", qualquer pessoa com uma conta
   viraria um disparador de spam com o domínio do estúdio. Assim, o pior que
   alguém consegue é avisar de novo um integrante da equipe sobre um pedido
   que já existe.

   ── QUEM PODE CHAMAR ──────────────────────────────────────────────────────
   Quem tem sessão. A leitura usa o token da própria pessoa, e o RLS de
   vz_pedidos só responde a quem está logado: sem sessão, o banco não devolve
   o pedido e nada é enviado.
   ═══════════════════════════════════════════════════════════════════════════ */

const { esc, diaMes, hojeBR, ler, enviar, moldura } = require('./_avisos.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(corpo.pedido_id || '').slice(0, 100);
    // Quem marcou é só para o texto do email ("Andrew te marcou"); não decide nada.
    const de = String(corpo.de || '').slice(0, 60).trim();
    if (!token || !id) return res.status(400).json({ erro: 'Falta o pedido ou a sessão.' });

    try {
        const [pedido] = await ler(`vz_pedidos?id=eq.${encodeURIComponent(id)}&select=*`, token);
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
        if (!pedido.responsavel_id) return res.status(200).json({ enviado: false, motivo: 'sem responsável' });

        const [[pessoa], [cliente]] = await Promise.all([
            ler(`vz_equipe?id=eq.${encodeURIComponent(pedido.responsavel_id)}&select=nome,email,ativo`, token),
            ler(`vz_clientes?id=eq.${encodeURIComponent(pedido.cliente_id)}&select=id,nome`, token),
        ]);
        if (!pessoa?.email || pessoa.ativo === false) {
            return res.status(200).json({ enviado: false, motivo: 'responsável sem email' });
        }

        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const nomeCliente = cliente?.nome || 'cliente';
        const hoje = hojeBR();
        const prazo = !pedido.prazo ? 'sem prazo'
            : pedido.prazo < hoje ? `atrasado — era ${diaMes(pedido.prazo)}`
            : pedido.prazo === hoje ? 'vence hoje'
            : `até ${diaMes(pedido.prazo)}`;
        const primeiro = pessoa.nome.split(' ')[0];

        const linhas = [
            ['Cliente', nomeCliente],
            ['Prazo', prazo],
            ...(pedido.quem_pediu ? [['Quem pediu', pedido.quem_pediu]] : []),
        ];

        await enviar({
            para: pessoa.email,
            assunto: `${nomeCliente}: ${pedido.texto}`.slice(0, 140),
            html: moldura({
                titulo: `${esc(primeiro)}, ${de ? `${esc(de)} te marcou` : 'você foi marcado'} num pedido`,
                corpo: `
                    <p style="margin:0 0 14px;font-size:17px;font-weight:700;">${esc(pedido.texto)}</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 14px;">
                        ${linhas.map(([k, v]) => `<tr><td style="color:#5d5d6b;padding:2px 14px 2px 0;">${k}</td><td style="font-weight:600;">${esc(v)}</td></tr>`).join('')}
                    </table>
                    ${pedido.detalhe ? `
                        <div style="border-left:3px solid #d9c4ff;padding:4px 0 4px 12px;color:#3d3d48;font-size:14px;white-space:pre-wrap;">${esc(pedido.detalhe.slice(0, 1500))}</div>` : ''}`,
                botao: { href: `${host}/pedidos/${encodeURIComponent(pedido.cliente_id)}`, rotulo: 'Abrir os pedidos' },
            }),
            texto: `${de ? `${de} te marcou` : 'Você foi marcado'} num pedido de ${nomeCliente}:\n\n`
                 + `${pedido.texto}\nPrazo: ${prazo}\n\n${host}/pedidos/${pedido.cliente_id}`,
        });

        return res.status(200).json({ enviado: true });
    } catch (e) {
        console.error('[avisar]', e);
        // 401/403 do banco: a sessão não vale. O resto é falha nossa ou do Resend.
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};
