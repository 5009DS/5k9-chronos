import { caminhoDoConteudo } from './rotas.js';
import { esteiraDe, etapaAtual } from './etiquetas.js';
import { hoje, somarDias, nomeDiaCurto, dataBR } from './formato.js';
import { aguardaData } from './cronograma.js';

/* ═══════════════════════════════════════════════════════════════════════════
   A MENSAGEM DA DEMANDA — o que vai para o WhatsApp de quem vai produzir.

   ── POR QUE UMA MENSAGEM, E NÃO O CARD DO LINK ────────────────────────────
   O card que o WhatsApp desenha ao colar um link é montado pelo próprio
   WhatsApp, que visita o endereço SEM login. Pôr ali o título e o Drive
   exigiria o servidor entregar esses dados a qualquer visitante — e o endereço
   de uma demanda é legível e adivinhável (/conteudo/set/titulo). O Drive de
   todo cliente ficaria a uma tentativa de distância.

   A mensagem chega ao mesmo lugar sem abrir essa porta: ela é escrita aqui,
   dentro do sistema e com login, e vai só para quem a pessoa escolher.

   *negrito* é a marcação do próprio WhatsApp.
   ═══════════════════════════════════════════════════════════════════════════ */

const quando = (c) => {
    if (aguardaData(c)) return 'Demanda ainda sem data';
    if (c.data === hoje()) return 'Sua demanda de hoje';
    if (c.data === somarDias(hoje(), 1)) return 'Sua demanda de amanhã';
    return `Demanda para ${nomeDiaCurto(c.data)}, ${dataBR(c.data).slice(0, 5)}`;
};

/**
 * @param {object} c        o conteúdo
 * @param {object} cliente  para o nome no topo
 * @param {object} [opcoes]
 * @param {string} [opcoes.link]  outro endereço no lugar do da demanda
 * @returns {string} texto pronto para colar
 */
export const mensagemDaDemanda = (c, cliente, { link = null } = {}) => {
    const carrossel = esteiraDe(c.formato) === 'carrossel';
    const etapa = etapaAtual(c.etiquetas)?.nome;
    const detalhes = [quando(c), carrossel ? 'Carrossel' : 'Reels', etapa].filter(Boolean).join(' · ');
    // O link de convidado substitui o da demanda quando a mensagem vai para
    // quem não tem login (pages/convidado.js).
    link = link || `${window.location.origin}${caminhoDoConteudo(c)}`;

    return [
        `*${[cliente?.nome, c.titulo].filter(Boolean).join(' · ')}*`,
        `📅 ${detalhes}`,
        '',
        '📝 Roteiro e detalhes:',
        link,
        ...(c.drive_url ? [
            '',
            carrossel ? '🎨 Arquivos da arte já estão no Drive:' : '🎬 Arquivos da gravação já estão no Drive:',
            c.drive_url,
        ] : []),
    ].join('\n');
};

/** Abre o WhatsApp com a mensagem pronta; a pessoa escolhe o contato lá. */
export const enviarNoWhatsApp = (c, cliente) =>
    window.open(`https://wa.me/?text=${encodeURIComponent(mensagemDaDemanda(c, cliente))}`, '_blank', 'noopener');

/** Copia a mensagem. Devolve false quando o navegador recusa. */
export const copiarMensagem = async (c, cliente) => {
    try {
        await navigator.clipboard.writeText(mensagemDaDemanda(c, cliente));
        return true;
    } catch {
        return false;
    }
};

/** O endereço do link de convidado de uma demanda (/d/<token>). */
export const linkDeConvidado = (c) =>
    c?.convite_token ? `${window.location.origin}/d/${c.convite_token}` : null;
