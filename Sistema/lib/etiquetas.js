import { esc, semAcento } from './formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ETIQUETAS — o vocabulário de produção, e tudo o mais.

   Etiqueta continua sendo texto livre: o sistema não decide nada com base
   nela, nada quebra quando ela muda e ninguém precisa de código para inventar
   uma nova. Isso não mudou e é o ponto todo do recurso.

   O que este arquivo acrescenta é VISUAL. Um punhado de etiquetas se repete em
   todo cliente — "a gravar", "gravado", "roteiro em aprovação" — e elas
   merecem ser reconhecidas de longe, com ícone e cor, como o chip de status já
   é. Um cartão com quatro etiquetas cinzas idênticas obriga a ler as quatro
   para achar a que interessa.

   ── A LINHA QUE NÃO SE ATRAVESSA ──────────────────────────────────────────
   Este mapa serve para DESENHAR, nunca para decidir. Nenhuma regra do sistema
   pergunta se um conteúdo está "gravado" — se um dia perguntar, isso vira
   status, com migração e tela, e não uma entrada aqui. Etiqueta fora da lista
   funciona igual, só sai com o desenho neutro.

   ── A ORDEM É O FLUXO ─────────────────────────────────────────────────────
   A lista está na ordem em que as coisas acontecem: escrever, aprovar, gravar,
   editar, publicar. É essa ordem que aparece no formulário, e é ela que
   transforma uma lista de palavras numa explicação do processo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* `publica` decide se o CLIENTE vê. Sete das oito dizem em que pé está a
   produção — é informação que ele quer e que hoje ele pede por WhatsApp.
   "refazer" fica de fora: é crítica nossa ao nosso próprio trabalho, e o
   cliente lendo isso no cronograma dele não ajuda ninguém.

   Etiqueta que a equipe inventar NUNCA sai. Não por desconfiança do texto,
   mas porque o campo livre é exatamente onde mora o recado interno — e um
   recurso que às vezes vaza é pior que um que nunca vaza.

   O recorte de verdade acontece no banco (db/migracao-etiquetas-cliente.sql).
   Esta marcação existe para a interna e a pública concordarem; se as duas
   discordarem, quem manda é o banco, e é ele que precisa ser corrigido. */
/* ── A ESTEIRA ────────────────────────────────────────────────────────────
   Oito destas etiquetas são ETAPAS: uma peça está em uma delas de cada vez, e
   avançar significa sair da anterior. Marcar "gravado" tira "a gravar" e
   "roteiro aprovado" sozinho — antes elas se acumulavam e o cartão passava a
   dizer três coisas contraditórias ao mesmo tempo.

   `etapa` é a ordem no caminho feliz e `proxima` diz para onde o botão de
   avançar leva. "revisão" tem etapa mas volta para "em edição": é o desvio de
   quando a gravação não passa, e o caminho de volta é o corte, não a câmera.

   As que NÃO têm `etapa` são paralelas — "aguardando data" e "aguardando
   material" convivem com qualquer etapa, porque descrevem uma pendência, não
   um estágio. Marcar uma delas não tira nada.

   Continua valendo o que o resto do arquivo diz: etiqueta é texto livre, e
   qualquer palavra que a equipe inventar funciona, fora da esteira e com o
   desenho neutro. */
export const ETIQUETAS = [
    /* A primeira etapa, e a razão de ela existir: liberar o mês para o cliente
       exigia ter TODOS os roteiros escritos, senão a peça aparecia lá pedindo
       uma aprovação que não tinha texto. Isso virava pressa — escrever oito
       roteiros porque o cronograma precisa sair.

       Com esta etiqueta o cronograma sai primeiro e o roteiro vem depois: o
       cliente vê a peça, a data e o tema, e lê que o texto ainda está sendo
       escrito. Ela é a única etapa em que a peça está visível SEM esperar
       nada dele — a conferência e o painel dele sabem disso.

       Etapa 0.5 e não 1: renumerar a esteira mexeria em toda regra que fala
       "da etapa tal em diante", e meia etapa custa nada. */
    { nome: 'roteiro em desenvolvimento', publica: true, etapa: 0.5, esteira: 'ambas',
      proxima: 'roteiro em aprovação',
      icone: 'file-pen', tom: 'info',
      dica: 'A equipe ainda está escrevendo o texto.' },

    { nome: 'roteiro em aprovação', publica: true, etapa: 1, esteira: 'ambas',
      proxima: 'roteiro aprovado', esperaCliente: true,
      icone: 'file-clock', tom: 'espera',
      dica: 'A médica está lendo o roteiro.' },

    /* Daqui em diante os dois caminhos se separam: vídeo vai para a câmera,
       carrossel vai para a prancheta. O texto aprovado é o mesmo; o que se faz
       com ele, não. */
    { nome: 'roteiro aprovado', publica: true, etapa: 2, esteira: 'ambas',
      proxima: { video: 'a gravar', carrossel: 'a diagramar' },
      icone: 'file-check', tom: 'ok',
      dica: 'Liberado para produzir.' },

    // ── Esteira de vídeo ────────────────────────────────────────────────
    { nome: 'a gravar', publica: true, etapa: 3, esteira: 'video', proxima: 'gravado',
      icone: 'video', tom: 'atencao',
      dica: 'Ainda não foi para a câmera.' },

    /* Esta é a ÚNICA etiqueta que DECIDE algo, e a exceção está registrada de
       propósito: ela faz o cliente perder o botão de pedir ajuste.

       O motivo é físico, não organizacional — depois de gravado, mudar uma
       fala custa uma diária de estúdio. Deixar o botão ali é convidar para um
       pedido que a equipe vai ter de recusar, e recusar depois é pior que não
       oferecer. A trava de verdade mora no banco (db/migracao-gravado.sql). */
    { nome: 'gravado', publica: true, travaAjuste: true, etapa: 4, esteira: 'video',
      proxima: 'em edição',
      icone: 'circle-check', tom: 'ok',
      dica: 'Material bruto na mão.' },

    { nome: 'em edição', publica: true, etapa: 5, esteira: 'video',
      proxima: 'gravação aguardando aprovação',
      icone: 'scissors', tom: 'info',
      dica: 'Na mesa de corte.' },

    { nome: 'gravação aguardando aprovação', publica: true, etapa: 6, esteira: 'video',
      proxima: 'pronto para publicar', esperaCliente: true,
      icone: 'monitor-play', tom: 'espera',
      dica: 'O vídeo pronto está com a médica.' },

    // ── Esteira de carrossel ────────────────────────────────────────────
    /* Os mesmos três degraus do vídeo, com os nomes do ofício: sai da mão de
       quem escreve, passa pela de quem desenha, volta para o olho do cliente.
       Os números batem com os do vídeo de propósito — "etapa 3" quer dizer
       "o texto já passou pelo cliente" nas duas, e é disso que as regras de
       status precisam saber. */
    { nome: 'a diagramar', publica: true, etapa: 3, esteira: 'carrossel',
      proxima: 'arte pronta',
      icone: 'layout-template', tom: 'atencao',
      dica: 'Texto aprovado, arte por fazer.' },

    /* Sem travaAjuste, e a diferença com "gravado" é física: refazer uma
       gravação custa uma diária de estúdio, refazer um card custa reabrir o
       arquivo. Travar o pedido aqui seria copiar uma regra sem copiar o
       motivo dela. */
    { nome: 'arte pronta', publica: true, etapa: 4, esteira: 'carrossel',
      proxima: 'arte aguardando aprovação',
      icone: 'image-plus', tom: 'ok',
      dica: 'Cards diagramados.' },

    { nome: 'arte aguardando aprovação', publica: true, etapa: 6, esteira: 'carrossel',
      proxima: 'pronto para publicar', esperaCliente: true,
      icone: 'image-check', tom: 'espera',
      dica: 'A arte pronta está com a médica.' },

    /* Fora do caminho feliz: some quando a peça avança, e leva de volta ao
       corte porque é lá que o problema se resolve. */
    { nome: 'revisão', publica: false, etapa: 6.5, esteira: 'ambas',
      proxima: { video: 'em edição', carrossel: 'a diagramar' },
      icone: 'rotate-ccw', tom: 'risco',
      dica: 'Não passou — volta para quem produz.' },

    /* O degrau que faltava no fim: a peça está pronta, aprovada, e só espera
       a data. Sem ele, o único jeito de dizer "acabou" era marcar publicado —
       o que é mentira até o post existir — ou deixar em "aguardando
       aprovação", que continua pedindo algo a quem já respondeu.

       Vale para as duas esteiras: vídeo montado e carrossel diagramado chegam
       ao mesmo lugar. */
    { nome: 'pronto para publicar', publica: true, etapa: 6.8, esteira: 'ambas',
      proxima: 'publicado',
      icone: 'calendar-check', tom: 'ok',
      dica: 'Aprovado e pronto. Só falta a data chegar.' },

    { nome: 'publicado', publica: true, etapa: 7, esteira: 'ambas',
      icone: 'send', tom: 'ok',
      dica: 'No ar.' },

    /* Paralelas: descrevem pendência, não estágio, e convivem com qualquer
       etapa da esteira. */
    { nome: 'aguardando data', publica: true, icone: 'calendar-clock', tom: 'espera',
      dica: 'Pronto, sem dia definido.' },

    { nome: 'aguardando material', publica: true, icone: 'image', tom: 'espera',
      dica: 'Falta algo que vem do cliente.' },
];

/* Os nomes que o código precisa citar. Escritos uma vez: "a gravar" digitado
   em quatro arquivos vira "à gravar" no quinto, e a etapa deixa de existir sem
   ninguém errar nada visível. */
export const ETAPA_ESCRITA   = 'roteiro em desenvolvimento';
export const ETAPA_APROVACAO = 'roteiro em aprovação';
export const ETAPA_GRAVAR    = 'a gravar';
export const ETAPA_DIAGRAMAR = 'a diagramar';
export const ETAPA_APROVADO  = 'roteiro aprovado';
export const ETAPA_PRONTO    = 'pronto para publicar';
export const ETAPA_PUBLICADO = 'publicado';

/** Todas as etapas, das duas esteiras, na ordem do caminho feliz. */
export const ETAPAS = ETIQUETAS.filter(e => e.etapa).sort((a, b) => a.etapa - b.etapa);

/* ═══════════════════════════════════════════════════════════════════════════
   DUAS ESTEIRAS

   Um vídeo e um carrossel compartilham o começo — alguém escreve, o cliente lê,
   o cliente aprova — e se separam exatamente aí. Depois do texto aprovado, um
   vai para a câmera e o outro para a prancheta, e forçar os dois pelas mesmas
   etiquetas obrigava a social mídia a ler "a gravar" num post que ninguém vai
   gravar.

   ── POR QUE OS NÚMEROS SE REPETEM ─────────────────────────────────────────
   "a gravar" e "a diagramar" são as duas a etapa 3; "gravado" e "arte pronta"
   são as duas a etapa 4. O número não é a posição numa lista global: ele diz
   QUÃO LONGE a peça está, e as regras que já existiam falam nessa língua —
   "da etapa 3 em diante o texto já passou pelo cliente" continua verdade nas
   duas esteiras, sem uma linha a mais.

   ── QUEM DECIDE A ESTEIRA ─────────────────────────────────────────────────
   O campo formato, que é texto livre escrito por gente. Na dúvida, vídeo: é
   o que a maioria das peças é, e é o que o sistema fazia antes de existir a
   segunda esteira. Formato em branco não muda o comportamento de ninguém.
   ═══════════════════════════════════════════════════════════════════════════ */
const FORMATO_ARTE = /carro?ss?el|carousel|est[áa]tico|imagem|foto|arte|infogr[áa]fico/i;

/** A etapa equivalente na esteira da peça: "a gravar" num carrossel vira
    "a diagramar". null quando a outra esteira não tem equivalente. */
export const etapaNaEsteira = (nome, esteira) => {
    const meta = etiquetaMeta(nome);
    if (!meta.etapa || meta.esteira === 'ambas' || meta.esteira === esteira) return meta.nome || nome;
    return etapasDa(esteira).find(e => e.etapa === meta.etapa)?.nome || null;
};

/** Qual esteira este formato segue. Sem formato, a de vídeo. */
export const esteiraDe = (formato) => FORMATO_ARTE.test(String(formato || '')) ? 'carrossel' : 'video';

/** As etapas de UMA esteira, na ordem. As comuns entram nas duas. */
export const etapasDa = (esteira) =>
    ETAPAS.filter(e => e.esteira === 'ambas' || e.esteira === esteira);

/** O destino de proxima, que difere entre as esteiras nas etapas comuns. */
const proximaDe = (meta, esteira) =>
    typeof meta?.proxima === 'string' ? meta.proxima : (meta?.proxima?.[esteira] || null);

/** A etapa em que o cliente é quem tem de olhar alguma coisa. */
export const etapaEsperaCliente = (lista) => !!etapaAtual(lista)?.esperaCliente;

/* Comparação sem acento, sem caixa e sem pontuação: "A Gravar", "a gravar" e
   "à gravar" são a mesma etiqueta para os olhos de quem lê o cartão, e seria
   estranho que só uma delas ganhasse ícone. */
const chave = (s) => semAcento(s || '').replace(/[^a-z0-9]/g, '');

const MAPA = new Map(ETIQUETAS.map(e => [chave(e.nome), e]));

/** O desenho de uma etiqueta. Devolve o neutro quando ela é da casa. */
export const etiquetaMeta = (nome) =>
    MAPA.get(chave(nome)) || { nome, icone: 'tag', tom: 'neutro', dica: '' };

/** As que o cliente pode ver. Desconhecida some — é a regra, não a exceção. */
export const etiquetasPublicas = (lista) =>
    (lista || []).filter(nome => etiquetaMeta(nome).publica);

/** O conteúdo já foi gravado? Então o roteiro dele virou passado. */
export const ajusteTravado = (lista) =>
    (lista || []).some(nome => etiquetaMeta(nome).travaAjuste);

/* ── O QUE A APROVAÇÃO DO CLIENTE MUDA ────────────────────────────────────
   Aprovar o roteiro põe a peça na etapa "a gravar" — que é a etapa seguinte
   e, por estar depois de "roteiro aprovado" na esteira, já diz que o roteiro
   passou. Guardar as duas seria dizer a mesma coisa em duplicado, e foi
   exatamente isso que empilhou etiquetas contraditórias no cartão.

   Que o roteiro foi aprovado não se perde: está no `status` do conteúdo, que
   é onde a conversa com o cliente mora.

   Peça já GRAVADA fica intocada — aprovar um assunto pendente depois da
   gravação é legítimo, e voltar para "a gravar" mandaria gravar de novo o que
   está pronto.

   A regra decide no banco (db/migracao-esteira.sql); aqui ela existe para o
   adaptador local responder igual. */
export const etiquetasAoAprovar = (lista, esteira = 'video') => {
    const atuais = lista || [];
    const atual = etapaAtual(atuais);
    /* Aprovar a GRAVAÇÃO ou a ARTE é o fim da conversa: a peça fica pronta.
       Antes isto caía na regra do roteiro e mandava gravar de novo o vídeo
       que o cliente tinha acabado de aprovar. */
    if (atual?.esperaCliente && atual.etapa >= 6) return comEtapa(atuais, ETAPA_PRONTO);
    // Já está em produção ou adiante: aprovar confirma, não empurra para trás.
    if (atual && atual.etapa >= 3) return atuais;
    if (ajusteTravado(atuais)) return atuais;
    return comEtapa(atuais, esteira === 'carrossel' ? ETAPA_DIAGRAMAR : ETAPA_GRAVAR);
};

/** O status que a aprovação do cliente deixa, dada a etapa que resultou. */
export const statusAoAprovar = (lista) => {
    const nome = etapaAtual(lista)?.nome;
    if (nome === ETAPA_PRONTO) return 'pronto';
    if (nome === ETAPA_PUBLICADO) return 'publicado';
    return 'aprovado';
};

/** Em que etapa a peça está, ou null quando ainda não entrou na esteira. */
export const etapaAtual = (lista) => {
    const achadas = (lista || [])
        .map(etiquetaMeta)
        .filter(m => m.etapa)
        .sort((a, b) => b.etapa - a.etapa);
    return achadas[0] || null;
};

/**
 * A lista depois de marcar uma etapa: a nova entra, as OUTRAS etapas saem, e
 * as paralelas ficam. Uma peça não está gravada e a gravar ao mesmo tempo.
 */
export const comEtapa = (lista, nome) => {
    const paralelas = (lista || []).filter(e => !etiquetaMeta(e).etapa);
    return nome ? [...paralelas, nome] : paralelas;
};

/** A próxima etapa do caminho feliz. Sem etapa nenhuma, o começo. */
export const proximaEtapa = (lista, esteira = 'video') => {
    const atual = etapaAtual(lista);
    if (!atual) return etapasDa(esteira)[0]?.nome || null;
    return proximaDe(atual, esteira);
};

/* ═══════════════════════════════════════════════════════════════════════════
   UM CAMPO SÓ: A ETAPA DECIDE, O STATUS É CONSEQUÊNCIA

   Até aqui a peça tinha dois vocabulários — o status (a conversa com o
   cliente) e a etapa (onde está a produção) — e regras de ida e volta tentando
   mantê-los de acordo. As regras deixavam brechas de propósito, e cada brecha
   virava uma peça dizendo duas coisas ao mesmo tempo.

   Agora a equipe só escolhe a ETAPA. O status continua gravado na coluna,
   porque a tela do cliente e as funções do banco leem dele, mas ninguém o
   escolhe mais: ele sai desta tabela.

     sem etapa                      rascunho         o cliente não vê
     roteiro em desenvolvimento     desenvolvimento  vê, não faz nada
     roteiro em aprovação           em revisão       aprova ou pede ajuste
     roteiro aprovado               aprovado
     a gravar … em edição, revisão  aprovado — se o cliente aprovou o roteiro;
                                    senão "em desenvolvimento", para a tela
                                    dele não dizer "aprovado por você" num
                                    texto que ele nunca leu
     gravação/arte em aprovação     em revisão       aprova ou pede ajuste
     pronto para publicar           pronto
     publicado                      publicado

   O único status que NÃO sai daqui é "ajuste": ele é o cliente falando, não a
   equipe escolhendo. Fica como marca em cima da etapa em que o pedido chegou
   e some no próximo movimento da equipe — mover a peça é a resposta.
   ═══════════════════════════════════════════════════════════════════════════ */

/** O status que uma etapa impõe. `nome` null é "sem etapa" (rascunho). */
export const statusDaEtapa = (nome, { aprovouRoteiro = false } = {}) => {
    if (!nome) return 'rascunho';
    const meta = etiquetaMeta(nome);
    if (!meta.etapa) return 'rascunho';
    if (meta.nome === ETAPA_ESCRITA)   return 'desenvolvimento';
    if (meta.nome === ETAPA_PRONTO)    return 'pronto';
    if (meta.nome === ETAPA_PUBLICADO) return 'publicado';
    if (meta.esperaCliente)            return 'em_revisao';
    if (meta.nome === ETAPA_APROVADO)  return 'aprovado';
    return aprovouRoteiro ? 'aprovado' : 'desenvolvimento';
};

/** As pendências: marcas que convivem com qualquer etapa e não mudam status. */
export const PENDENCIAS = ETIQUETAS.filter(e => !e.etapa && e.publica);

/**
 * Traz uma peça do modelo antigo (status e etiquetas escolhidos à parte) para
 * o novo: UMA etapa, as pendências, e o status calculado.
 *
 * A etapa ganha do status quando as duas existem — é a informação mais
 * específica. A exceção é o fim da linha: status "pronto" ou "publicado" com
 * etapa mais atrás é a etapa que ficou esquecida, e quem avança é ela.
 *
 * Etiqueta livre não tem mais onde morar; vai para a nota, com a data, para
 * não se perder nada. O mesmo raciocínio está em db/migracao-etapa-unica.sql.
 *
 * @returns {?{status, etiquetas, nota}} null quando a peça já está certa.
 */
export const normalizarPeca = (c, { aprovouRoteiro = false } = {}) => {
    const lista = c.etiquetas || [];
    const esteira = esteiraDe(c.formato);
    const pendencias = lista.filter(e => PENDENCIAS.some(p => chave(p.nome) === chave(e)))
        .map(e => etiquetaMeta(e).nome);
    const livres = lista.filter(e => !etiquetaMeta(e).etapa && !PENDENCIAS.some(p => chave(p.nome) === chave(e)));

    let etapa = etapaAtual(lista)?.nome || null;
    /* Rascunho continua rascunho: a conversão nunca pode fazer uma peça
       aparecer para o cliente sem alguém decidir. A etapa que havia fica
       anotada, para não se perder. */
    if (c.status === 'rascunho' && etapa) {
        livres.push(`etapa antes da etapa única: ${etapa}`);
        etapa = null;
    }
    const porStatus = {
        desenvolvimento: ETAPA_ESCRITA,
        em_revisao: ETAPA_APROVACAO,
        ajuste: ETAPA_APROVACAO,
        aprovado: ETAPA_APROVADO,
        pronto: ETAPA_PRONTO,
        publicado: ETAPA_PUBLICADO,
    }[c.status];
    if (!etapa && porStatus) etapa = porStatus;
    if (c.status === 'publicado') etapa = ETAPA_PUBLICADO;
    if (c.status === 'pronto' && etapa !== ETAPA_PUBLICADO) etapa = ETAPA_PRONTO;
    // Etapa da outra esteira (um "a gravar" num carrossel) vira a equivalente.
    const meta = etapa && etiquetaMeta(etapa);
    if (meta && meta.esteira !== 'ambas' && meta.esteira !== esteira) {
        etapa = etapasDa(esteira).find(e => e.etapa === meta.etapa)?.nome || etapa;
    }

    const aprovou = aprovouRoteiro || ['aprovado', 'pronto', 'publicado'].includes(c.status);
    let status = statusDaEtapa(etapa, { aprovouRoteiro: aprovou });
    // O pedido de ajuste sobrevive quando a peça ainda está com o cliente.
    if (c.status === 'ajuste' && etiquetaMeta(etapa).esperaCliente) status = 'ajuste';

    const etiquetas = [...(etapa ? [etapa] : []), ...new Set(pendencias)];
    const nota = livres.length
        ? [c.nota, `Etiquetas antigas: ${livres.join('; ')}`].filter(Boolean).join('\n')
        : c.nota;

    const igual = status === c.status && nota === c.nota
        && etiquetas.length === lista.length && etiquetas.every(e => lista.includes(e));
    return igual ? null : { status, etiquetas, nota };
};

export const chipEtiqueta = (nome) => {
    const m = etiquetaMeta(nome);
    return `<span class="vz-etiqueta vz-etiqueta--${esc(m.tom)}"${m.dica ? ` title="${esc(m.dica)}"` : ''}>
        <i data-lucide="${esc(m.icone)}"></i>${esc(nome)}
    </span>`;
};

/* O ESTADO da peça, num lugar só: a etapa (ou "rascunho" quando não há), a
   marca de ajuste quando o cliente pediu, e as pendências. É o que substitui
   o par "chip de status + chips de etiqueta" nas telas da equipe. */
export const chipsEstado = (c) => {
    const etapa = etapaAtual(c?.etiquetas);
    const principal = etapa ? chipEtiqueta(etapa.nome)
        : `<span class="vz-etiqueta vz-etiqueta--neutro" title="Só a equipe vê. Não aparece no link do cliente.">
               <i data-lucide="pencil"></i>rascunho</span>`;
    const ajuste = c?.status === 'ajuste'
        ? `<span class="vz-etiqueta vz-etiqueta--risco" title="O cliente pediu uma alteração. Mover a peça de etapa é a resposta.">
               <i data-lucide="message-circle-warning"></i>ajuste pedido</span>` : '';
    const resto = (c?.etiquetas || []).filter(e => !etiquetaMeta(e).etapa).map(chipEtiqueta).join('');
    return principal + ajuste + resto;
};

/** Rótulo curto do estado, para texto corrido e títulos de menu. */
export const nomeEstado = (c) => etapaAtual(c?.etiquetas)?.nome || 'rascunho';

/* Estilos das etiquetas. Vivem aqui, e não no CSS de uma página, porque o chip
   aparece no cronograma, no quadro e no painel de edição — três arquivos que
   divergiriam no primeiro ajuste de cor. */
export const injectEstilosEtiqueta = () => {
    if (document.getElementById('etiquetas-styles')) return;
    const style = document.createElement('style');
    style.id = 'etiquetas-styles';
    style.textContent = `
        .vz-etiqueta {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 3px 10px; border-radius: var(--radius-pill);
            border: 1px solid transparent;
            font-size: var(--text-xs); font-weight: 600; white-space: nowrap;
        }
        .vz-etiqueta i, .vz-etiqueta svg { width: 13px; height: 13px; }
        /* Os tons dizem de quem é a vez, não o que é a etiqueta: amarelo é
           trabalho nosso parado, azul é trabalho andando, verde é etapa
           vencida, roxo é espera por terceiro, vermelho é problema. */
        .vz-etiqueta--atencao { background: var(--warning-muted); color: var(--warning); }
        .vz-etiqueta--info    { background: color-mix(in oklch, var(--info) 14%, transparent); color: var(--info); }
        .vz-etiqueta--ok      { background: var(--success-muted); color: var(--success); }
        .vz-etiqueta--espera  { background: var(--accent-muted);  color: var(--accent); }
        .vz-etiqueta--risco   { background: var(--danger-muted);  color: var(--danger); }
        .vz-etiqueta--neutro  { background: var(--surface-3); color: var(--text-secondary); border-color: var(--border-subtle); }

        /* Os botões do formulário. Mesmo desenho do chip, mais o estado de
           marcado — o que se vê ao escolher é o que vai aparecer no cartão. */
        .vz-etiqueta--botao { cursor: pointer; opacity: 0.5; font-family: var(--font-sans); }
        .vz-etiqueta--botao:hover { opacity: 0.85; }
        .vz-etiqueta--botao.is-marcada { opacity: 1; box-shadow: inset 0 0 0 1px currentColor; }
    `;
    document.head.appendChild(style);
};
