/* ═══════════════════════════════════════════════════════════════════════════
   FERRAMENTAS DO ESTÚDIO — a lista que alimenta o trocador da topnav.

   Este arquivo é IDÊNTICO nos cinco sistemas (5K9 Forms, 5K9 Gestor, 5K9
   Chronos, 5K9 Dionísio e 5K9 Partners). A única linha que muda entre eles é
   a constante ATUAL, no fim. Ao criar uma ferramenta nova, acrescente uma
   entrada aqui e copie o arquivo para os outros repositórios — é a lista que
   faz cada sistema saber que os outros existem.

   Poderia ser um endpoint compartilhado, mas não deveria: um menu de
   navegação que depende de rede fica vazio quando a rede falha, e o custo de
   manter quatro linhas em sincronia é menor que o de explicar por que o botão
   de trocar de ferramenta às vezes não lista nada.
   ═══════════════════════════════════════════════════════════════════════════ */

export const FERRAMENTAS = [
    {
        id: 'forms',
        nome: 'Forms',
        descricao: 'Briefings, perguntas e respostas',
        icone: 'clipboard-list',
        host: 'painel.5k9.studio',
        // Porta do servidor local, para o trocador continuar funcionando em
        // desenvolvimento — ver urlDe() abaixo.
        porta: 5173,
    },
    {
        id: 'gestor',
        nome: 'Gestor',
        descricao: 'Fluxo de caixa, repasses e custos',
        icone: 'wallet',
        host: 'gestor.5k9.studio',
        porta: 5174,
    },
    {
        id: 'chronos',
        nome: 'Chronos',
        descricao: 'Cronograma e roteiros do cliente',
        icone: 'calendar-range',
        host: 'chronos.5k9.studio',
        porta: 5175,
    },
    {
        id: 'dionisio',
        nome: 'Dionísio',
        descricao: 'Roteiros e scripts audiovisuais',
        icone: 'clapperboard',
        host: 'dionisio.5k9.studio',
        porta: 5176,
    },
    {
        id: 'partners',
        nome: 'Partners',
        descricao: 'A porta de entrada do cliente',
        icone: 'layout-grid',
        host: 'partners.5k9.studio',
        porta: 5177,
    },
];

/**
 * Endereço de uma ferramenta, adaptado a onde estamos.
 *
 * Em desenvolvimento os sistemas rodam em portas diferentes do mesmo
 * localhost; em produção, em subdomínios. Sem esta distinção, clicar em
 * "Forms" durante o desenvolvimento jogaria a pessoa para o site publicado —
 * e o pior tipo de bug é o que faz você testar a versão errada sem perceber.
 */
export const urlDe = (ferramenta) => {
    const { hostname, protocol } = window.location;
    const local = hostname === 'localhost' || hostname === '127.0.0.1';
    if (local) return `${protocol}//${hostname}:${ferramenta.porta}`;

    /* Em produção, monta o host trocando o primeiro rótulo do domínio atual
       em vez de usar `ferramenta.host` cru. É o que mantém o trocador
       funcionando em ambiente de pré-visualização e se o domínio do estúdio
       mudar: dionisio.5k9.studio → painel.5k9.studio, sem este arquivo
       precisar saber qual é o domínio-pai. O host fixo é a reserva para
       quando não há de onde derivar (deploy .vercel.app, por exemplo). */
    const partes = hostname.split('.');
    const rotuloAlvo = ferramenta.host.split('.')[0];
    if (partes.length >= 3) {
        partes[0] = rotuloAlvo;
        return `https://${partes.join('.')}`;
    }
    return `https://${ferramenta.host}`;
};

/** Qual ferramenta é ESTA. Única linha que difere entre os repositórios. */
export const ATUAL = 'chronos';
