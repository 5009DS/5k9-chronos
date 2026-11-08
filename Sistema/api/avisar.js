/* ═══════════════════════════════════════════════════════════════════════════
   AVISO NA HORA — "fulano te marcou num pedido".

   O navegador chama esta função logo depois de salvar um pedido com gente
   nova marcada (components/pedidos.js). Ela recebe o id do pedido e os ids de
   QUEM avisar — e só avisa quem de fato está na lista do pedido no banco.

   ── POR QUE SÓ IDS ───────────────────────────────────────────────────────
   Endereço, assunto e texto saem do BANCO, nunca do pedido HTTP. Se a
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
    const pedidosPara = Array.isArray(corpo.para) ? corpo.para.map(String).slice(0, 20) : null;
    // Quem marcou é só para o texto do email ("Andrew te marcou"); não decide nada.
    const de = String(corpo.de || '').slice(0, 60).trim();
    if (!token || !id) return res.status(400).json({ erro: 'Falta o pedido ou a sessão.' });

    try {
        const [pedido] = await ler(`vz_pedidos?id=eq.${encodeURIComponent(id)}&select=*`, token);
        if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });

        // A lista do BANCO manda: um id pedido que não está no pedido é ignorado.
        const doPedido = pedido.responsaveis?.length ? pedido.responsaveis
            : (pedido.responsavel_id ? [pedido.responsavel_id] : []);
        const alvos = pedidosPara ? doPedido.filter(x => pedidosPara.includes(x)) : doPedido;
        if (!alvos.length) return res.status(200).json({ enviados: [], motivo: 'ninguém a avisar' });

        // A equipe inteira do pedido, para o "junto com"; avisados, só os alvos.
        const lista = doPedido.map(encodeURIComponent).join(',');
        const [equipe, [cliente]] = await Promise.all([
            ler(`vz_equipe?id=in.(${lista})&select=id,nome,email,ativo`, token),
            ler(`vz_clientes?id=eq.${encodeURIComponent(pedido.cliente_id)}&select=id,nome`, token),
        ]);
        const pessoas = equipe.filter(p => alvos.includes(p.id) && p.email && p.ativo !== false);
        if (!pessoas.length) return res.status(200).json({ enviados: [], motivo: 'sem email' });

        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        const nomeCliente = cliente?.nome || 'cliente';
        const hoje = hojeBR();
        const prazo = !pedido.prazo ? 'sem prazo'
            : pedido.prazo < hoje ? `atrasado — era ${diaMes(pedido.prazo)}`
            : pedido.prazo === hoje ? 'vence hoje'
            : `até ${diaMes(pedido.prazo)}`;

        const linhas = [
            ['Cliente', nomeCliente],
            ['Prazo', prazo],
            ...(pedido.quem_pediu ? [['Quem pediu', pedido.quem_pediu]] : []),
        ];

        /* Um email por pessoa, e não um só com todos em cópia: cada um recebe
           o próprio, com o nome dele, e responder não vira conversa em grupo. */
        const enviados = [];
        for (const pessoa of pessoas) {
            const outros = equipe.filter(o => o.id !== pessoa.id).map(o => o.nome.split(' ')[0]);
            const comQuem = outros.length ? [['Junto com', outros.join(', ')]] : [];
            try {
            await enviar({
                para: pessoa.email,
                assunto: `${nomeCliente}: ${pedido.texto}`.slice(0, 140),
                html: moldura({
                    titulo: `${esc(pessoa.nome.split(' ')[0])}, ${de ? `${esc(de)} te marcou` : 'você foi marcado'} num pedido`,
                    corpo: `
                        <p style="margin:0 0 14px;font-size:17px;font-weight:700;">${esc(pedido.texto)}</p>
                        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:0 0 14px;">
                            ${[...linhas, ...comQuem].map(([k, v]) => `<tr><td style="color:#5d5d6b;padding:2px 14px 2px 0;">${k}</td><td style="font-weight:600;">${esc(v)}</td></tr>`).join('')}
                        </table>
                        ${pedido.detalhe ? `
                            <div style="border-left:3px solid #d9c4ff;padding:4px 0 4px 12px;color:#3d3d48;font-size:14px;white-space:pre-wrap;">${esc(pedido.detalhe.slice(0, 1500))}</div>` : ''}`,
                    botao: { href: `${host}/pedidos/${encodeURIComponent(pedido.cliente_id)}`, rotulo: 'Abrir os pedidos' },
                }),
                texto: `${de ? `${de} te marcou` : 'Você foi marcado'} num pedido de ${nomeCliente}:\n\n`
                     + `${pedido.texto}\nPrazo: ${prazo}\n\n${host}/pedidos/${pedido.cliente_id}`,
            });
            } catch (e) {
                // Um endereço recusado não impede os outros de receber.
                console.error('[avisar]', pessoa.nome, e);
                continue;
            }
            enviados.push(pessoa.id);
        }
        if (!enviados.length) return res.status(500).json({ erro: 'Nenhum email saiu. Veja os logs.' });
        return res.status(200).json({ enviados });
    } catch (e) {
        console.error('[avisar]', e);
        // 401/403 do banco: a sessão não vale. O resto é falha nossa ou do Resend.
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};
