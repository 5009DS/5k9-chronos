/* ═══════════════════════════════════════════════════════════════════════════
   NAVEGAÇÃO — History API.

   Antes o app roteava por hash (#/forms). Funcionava sem servidor, mas o
   link que vai para o cliente ficava feio (forms.5k9.studio/#/f/abc) e —
   mais grave — o servidor NÃO enxerga nada depois do "#". Ou seja, era
   impossível proteger o painel no servidor: para ele, toda requisição era
   apenas "/". Com caminho de verdade, o middleware consegue distinguir o
   formulário público do painel administrativo.

   Exige dois apoios fora daqui:
     · vercel.json — reescreve rota desconhecida para index.html;
     · .claude/static-server.js — o mesmo, no desenvolvimento local.
   Sem eles, abrir /forms direto devolve 404.
   ═══════════════════════════════════════════════════════════════════════════ */

import { apelidoDeConteudo, apelidoDeTexto, abrevMes } from './formato.js';

/* ── ACHAR O CONTEÚDO DE UM ENDEREÇO ──────────────────────────────────────
   Três formas de chegar no mesmo lugar, em ordem de confiança:

     1. o id cru      — todo link salvo antes desta mudança;
     2. mês + apelido — o endereço de hoje;
     3. só o apelido  — o endereço de ontem, de uma peça que mudou de mês.

   O terceiro é o que evita links mortos: arrastar uma peça de agosto para
   novembro é operação de rotina neste sistema, e ela não pode apagar o link
   que alguém colou no WhatsApp semana passada. Quando a busca cai no terceiro
   caso, quem chamou corrige a barra de endereço.

   Homônimos no mesmo mês continuam sendo ambiguidade real: o desempate é a
   data, e depois a criação — critério fixo, para o mesmo link abrir sempre o
   mesmo conteúdo. */
export const acharPorEndereco = (conteudos, referencia) => {
    const ref = String(referencia || '');
    const porId = (conteudos || []).find(c => c.id === ref);
    if (porId) return { conteudo: porId, exato: false };

    const partes = ref.split('/').filter(Boolean);
    const apelido = partes[partes.length - 1];
    const mes = partes.length > 1 ? partes[0] : null;
    if (!apelido) return { conteudo: null, exato: false };

    const iguais = (conteudos || [])
        .filter(c => apelidoDeTexto(c.titulo) === apelido)
        .sort((a, b) => String(a.data).localeCompare(String(b.data))
                     || String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
    if (!iguais.length) return { conteudo: null, exato: false };

    const doMes = mes ? iguais.filter(c => abrevMes(c.data) === mes) : [];
    const achado = doMes[0] || iguais[0];
    return { conteudo: achado, exato: !!doMes.length };
};

/* ── QUANDO O ENDEREÇO NÃO ACHA NADA ──────────────────────────────────────
   Título muda, e o endereço velho para de casar. Antes isso terminava numa
   tela morta: "Conteúdo não encontrado. Ele pode ter sido excluído." — a
   frase mais assustadora possível para quem acabou de ver o link funcionar.

   Agora a tela oferece os parecidos. A conta é boba de propósito: quantas
   palavras o apelido do endereço tem em comum com o apelido do título. Duas
   já bastam para trazer o conteúdo renomeado para a frente, e palavra de até
   três letras fica de fora porque "de", "que" e "por" ligam tudo com tudo. */
export const parecidosComEndereco = (conteudos, referencia) => {
    const palavras = new Set(String(referencia || '').split('/').pop()
        .split('-').filter(p => p.length > 3));
    if (!palavras.size) return [];

    return (conteudos || [])
        .map(c => ({
            c,
            comuns: apelidoDeTexto(c.titulo).split('-').filter(p => palavras.has(p)).length,
        }))
        .filter(x => x.comuns >= 2)
        .sort((a, b) => b.comuns - a.comuns)
        .slice(0, 6)
        .map(x => x.c);
};

/** O endereço canônico de um conteúdo, o que a barra deve mostrar. */
export const caminhoDoConteudo = (c) => `/conteudo/${apelidoDeConteudo(c)}`;

/** Navega sem recarregar a página. */
export const navegar = (caminho, { substituir = false } = {}) => {
    if (caminho === window.location.pathname) return;
    if (substituir) history.replaceState({}, '', caminho);
    else            history.pushState({}, '', caminho);
    // O popstate não dispara em push/replace feitos por código — o router
    // escuta esse evento, então avisamos na mão.
    window.dispatchEvent(new PopStateEvent('popstate'));
};

/** Caminho atual, sempre começando com "/". */
export const caminhoAtual = () => window.location.pathname || '/';

/**
 * Faz links comuns (<a href="/forms">) navegarem sem recarregar.
 *
 * Um listener só, no documento: as páginas reescrevem o próprio HTML o
 * tempo todo, e ligar handler em cada link recriado seria trabalho perdido
 * a cada render.
 */
export const interceptarLinks = () => {
    document.addEventListener('click', (e) => {
        // Ctrl/Cmd/Shift-clique e botão do meio: a pessoa quer outra aba.
        if (e.defaultPrevented || e.button !== 0
            || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const a = e.target.closest('a');
        if (!a || a.target === '_blank' || a.hasAttribute('download')) return;

        const href = a.getAttribute('href');
        // Só caminhos internos. Externos, mailto:, tel: e âncoras seguem
        // o comportamento nativo.
        if (!href || !href.startsWith('/') || href.startsWith('//')) return;

        e.preventDefault();
        navegar(href);
    });
};
