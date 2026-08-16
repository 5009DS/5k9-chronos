/* ═══════════════════════════════════════════════════════════════════════════
   APELIDO DO LINK — o pedaço da URL que vai para o cliente.

   chronos.5k9.studio/c/dra-fernanda   em vez de
   chronos.5k9.studio/c/k7mqp3xz9a

   Mesma ideia do apelido de formulário do 5K9 Forms, com UMA diferença que
   muda tudo e está escrita aqui para ninguém copiar o outro sistema sem ver:

   ── O TOKEN É SEGREDO; O APELIDO NÃO É ────────────────────────────────────
   No Forms, o link público leva a um formulário em branco — descobrir o
   endereço não revela nada. Aqui ele abre o CRONOGRAMA INTEIRO do cliente:
   temas, roteiros, datas. O token de dez caracteres aleatórios existe para
   isso: não é adivinhável.

   Um apelido legível é adivinhável por construção. "dra-fernanda" é a
   primeira coisa que alguém tentaria. Então o apelido é uma escolha
   consciente de trocar sigilo por elegância, e a interface precisa dizer
   isso na hora de escolher — não num rodapé de documentação.

   O token NUNCA é desligado: ele continua funcionando em paralelo. Assim,
   quem se arrepender do apelido apaga o campo e o link secreto continua o
   mesmo, sem quebrar nada que já foi mandado.

   ── SUFIXO DE SEGURANÇA ───────────────────────────────────────────────────
   O meio-termo que resolve os dois lados: "dra-fernanda-k7mq" é legível o
   bastante para caber num e-mail e imprevisível o bastante para não ser
   adivinhado. É o que o sistema sugere por padrão.
   ═══════════════════════════════════════════════════════════════════════════ */

import { semAcento } from './formato.js';

/* Tudo que já é rota do app, mais termos que costumam virar página. Um
   apelido "configuracoes" criaria ambiguidade no roteador no dia em que
   alguém publicar outra página neste domínio. Barrar agora é barato;
   renomear link já mandado para o cliente, não. */
const RESERVADAS = new Set([
    'c', 'cliente', 'clientes', 'conteudo', 'conteudos', 'quadro', 'importar',
    'diretorio', 'configuracoes', 'login', 'logout', 'painel', 'admin', 'api',
    'assets', 'db', 'ds', 'lib', 'pages', 'seed', 'components', 'roteiro',
    'sobre', 'contato', 'ajuda', 'privacidade', 'termos', 'null', 'undefined',
]);

export const TAMANHO_MIN = 3;
export const TAMANHO_MAX = 60;

/** "Dra. Fernanda Trece" → "dra-fernanda-trece" */
export const gerarApelido = (texto) => semAcento(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, TAMANHO_MAX)
    .replace(/-+$/, '');

/**
 * O apelido sugerido para um cliente: nome mais quatro caracteres do token.
 *
 * O sufixo vem do TOKEN, e não de um sorteio novo, porque assim ele é estável
 * — reabrir a tela sugere o mesmo apelido, em vez de um diferente a cada vez.
 */
export const apelidoSugerido = (cliente) => {
    const base = gerarApelido(cliente?.nome || '');
    const sufixo = String(cliente?.token || '').slice(0, 4);
    if (!base) return sufixo;
    return `${base}-${sufixo}`.slice(0, TAMANHO_MAX).replace(/-+$/, '');
};

/**
 * Diz o que está errado com um apelido, ou null se estiver bom.
 * Devolve a frase pronta, para a mesma mensagem valer em qualquer tela.
 */
export const criticarApelido = (apelido) => {
    const a = String(apelido || '');
    if (!a)                     return null;   // vazio é válido: volta a valer só o token
    if (a.length < TAMANHO_MIN) return `Use pelo menos ${TAMANHO_MIN} caracteres.`;
    if (a.length > TAMANHO_MAX) return `Use no máximo ${TAMANHO_MAX} caracteres.`;
    if (a !== gerarApelido(a))  return 'Use apenas letras sem acento, números e hífen.';
    if (RESERVADAS.has(a))      return `"${a}" é uma palavra reservada do sistema. Escolha outra.`;
    if (/^\d+$/.test(a))        return 'O apelido não pode ser só números.';
    return null;
};

/**
 * O apelido termina com o sufixo aleatório vindo do token?
 *
 * A primeira versão tentava MEDIR se um endereço era adivinhável olhando as
 * classes de caractere. Deu errado do jeito mais revelador possível: o próprio
 * endereço sugerido pelo sistema era marcado como inseguro, porque o sufixo
 * sorteado calhou de ser só letras.
 *
 * Adivinhabilidade não é mensurável a partir do texto — "dra-fernanda" é óbvio
 * para quem conhece a cliente e opaco para quem não conhece, e o código não
 * sabe quem está do outro lado. Então a pergunta mudou para uma que TEM
 * resposta exata: este endereço carrega a parte imprevisível que a gente
 * gerou? A tela avisa com base nisso, e diz exatamente o que está checando.
 */
export const temSufixoAleatorio = (apelido, cliente) => {
    const sufixo = String(cliente?.token || '').slice(0, 4);
    return !!sufixo && String(apelido || '').endsWith(`-${sufixo}`);
};

/** O endereço completo que vai para o cliente. */
export const linkDoCliente = (cliente) => {
    const identificador = cliente?.apelido || cliente?.token || '';
    return `${window.location.origin}/c/${identificador}`;
};
