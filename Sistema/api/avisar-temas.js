/* ═══════════════════════════════════════════════════════════════════════════
   TEMAS NOVOS — "a Marianna subiu 12 temas para a Dra. Fernanda".

   O navegador chama esta função um pouco depois de a pessoa PARAR de criar
   conteúdo (lib/avisos.js espera um minuto e meio de calma, ou a aba fechar).
   Assim, importar oitenta temas ou criar cinco seguidos vira UM email, e não
   oitenta.

   ── A FUNÇÃO NÃO RECEBE O QUE ANUNCIAR ───────────────────────────────────
   Ela pergunta ao banco: "o que esta pessoa criou e ainda não foi
   anunciado?". O email de quem pede sai do token, não do corpo da chamada,
   então ninguém anuncia em nome de outro; e cada tema é marcado (avisado_em)
   ao ser reservado, então chamar duas vezes não manda duas vezes.

   Vai para todos da equipe, menos quem subiu.
   ═══════════════════════════════════════════════════════════════════════════ */

const { ler, atualizar, quemE, enviar, emailsDeTemas } = require('./_avisos.js');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(400).json({ erro: 'Falta a sessão.' });

    try {
        const { email } = await quemE(token);
        if (!email) return res.status(200).json({ enviados: 0, motivo: 'sessão sem email' });

        // Só o que é recente: um tema de semana passada que escapou é assunto
        // do resumo da manhã, não de um aviso "na hora".
        const desde = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
        const temas = await atualizar(
            `vz_conteudos?criado_por=eq.${encodeURIComponent(email)}&avisado_em=is.null`
            + `&criado_em=gte.${encodeURIComponent(desde)}`
            + '&select=id,cliente_id,titulo,data,formato,banco_em,etiquetas,criado_por',
            token, { avisado_em: new Date().toISOString() });
        if (!temas.length) return res.status(200).json({ enviados: 0, motivo: 'nada novo' });

        const ids = [...new Set(temas.map(t => t.cliente_id))].map(encodeURIComponent).join(',');
        const [equipe, clientes] = await Promise.all([
            ler('vz_equipe?select=id,nome,email,ativo', token),
            ler(`vz_clientes?id=in.(${ids})&select=id,nome`, token),
        ]);

        const host = `https://${req.headers.host || 'chronos.5k9.studio'}`;
        let enviados = 0;
        for (const email of emailsDeTemas({ temas, equipe, clientes, host })) {
            try { await enviar(email); enviados++; }
            catch (e) { console.error('[avisar-temas]', email.para, e); }
        }
        return res.status(200).json({ enviados, temas: temas.length });
    } catch (e) {
        console.error('[avisar-temas]', e);
        const status = e.status === 401 || e.status === 403 ? 401 : 500;
        return res.status(status).json({ erro: status === 401 ? 'Sessão inválida.' : e.message });
    }
};
