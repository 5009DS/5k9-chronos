import { esc, escLinhas, diaCurto } from './formato.js';
import { fase, objetivo, leitura, nomeFase, rotuloFase, avisosConformidade } from './diretorio.js';
import { tipo as tipoBloco, agruparPorSecao } from './roteiro.js';

/* ═══════════════════════════════════════════════════════════════════════════
   PEÇAS — os pedaços de HTML que aparecem na tela interna E na do cliente.

   O chip de fase, o cartão de leitura estratégica, o bloco de roteiro. São os
   mesmos nos dois lados de propósito: quando a equipe olha um conteúdo, ela
   precisa estar vendo exatamente o que o cliente vê. Duas implementações
   divergem na segunda pressa, e a divergência aparece como "mas no meu está
   escrito outra coisa" numa reunião.

   Tudo aqui é função pura: recebe dado, devolve string de HTML. Nada consulta
   o store, nada liga evento. Quem chama é que decide onde colar e o que fazer
   com o clique.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── A ORDEM AQUI É A ORDEM DOS MENUS ─────────────────────────────────────
   O objeto é percorrido como está escrito, e as três telas que oferecem troca
   de status mostram nesta sequência. Ela segue a vida da peça: some da vista
   do cliente, aparece sendo feita, vai para ele, volta.

   ── POR QUE "EM DESENVOLVIMENTO" EXISTE ──────────────────────────────────
   Faltava o estado mais comum do meio do caminho: a peça está sendo PRODUZIDA
   — o carrossel sendo diagramado, o vídeo esperando a câmera — e não há nada
   para o cliente fazer. Sem ele só havia escolha ruim: rascunho esconde a peça
   do link dele, e "em revisão" a põe na lista de coisas que ele precisa
   responder. Marcar como aprovado era pior ainda — inventa uma aprovação que
   ele nunca deu.

   Este status aparece no link do cliente e não pede nada: a peça entra em "em
   produção" no painel dele, com data e tema, e a barra de aprovar nem existe. */
export const STATUS = {
    rascunho:   { rotulo: 'Rascunho',   icone: 'pencil',       dica: 'Só a equipe vê. Não aparece no link do cliente.' },
    desenvolvimento: { rotulo: 'Em desenvolvimento', icone: 'pencil-ruler',
                       dica: 'A equipe está produzindo. O cliente vê e não precisa fazer nada.' },
    em_revisao: { rotulo: 'Em revisão', icone: 'eye',          dica: 'Enviado ao cliente, aguardando resposta.' },
    aprovado:   { rotulo: 'Aprovado',   icone: 'check',        dica: 'O cliente aprovou este conteúdo.' },
    ajuste:     { rotulo: 'Ajuste',     icone: 'message-circle-warning', dica: 'O cliente pediu uma alteração.' },
    /* Depois do ajuste de propósito: "pronto" é o fim da conversa, e ajuste é o
       desvio que pode acontecer antes dele. A ordem do menu conta a história. */
    pronto:     { rotulo: 'Pronto para publicar', icone: 'calendar-check',
                  dica: 'Aprovado e finalizado. Só falta a data chegar.' },
    publicado:  { rotulo: 'Publicado',  icone: 'send',         dica: 'Já foi ao ar.' },
};

export const statusMeta = (id) => STATUS[id] || STATUS.rascunho;

export const chipStatus = (id) => {
    const s = statusMeta(id);
    return `<span class="vz-status vz-status--${esc(id)}" title="${esc(s.dica)}">
        <i data-lucide="${s.icone}"></i>${esc(s.rotulo)}
    </span>`;
};

/** Chip de fase. `curto` usa só 'Fundo'; senão, 'Fundo de funil'. */
export const chipFase = (faseId, { curto = false } = {}) => {
    if (!faseId) return `<span class="vz-status">sem fase</span>`;
    return `<span class="vz-fase vz-fase--${esc(faseId)}">
        <span class="vz-ponto vz-ponto--${esc(faseId)}"></span>
        ${esc(curto ? rotuloFase(faseId) : nomeFase(faseId))}
    </span>`;
};

const ICONE_TOM = { sucesso: 'circle-check', atencao: 'triangle-alert', risco: 'octagon-alert' };

/**
 * O cartão de leitura do par fase × objetivo.
 *
 * É a peça que responde ao pedido original — marcar "meio de funil" com foco
 * em "construção de autoridade" e o sistema explicar sozinho o que aquilo
 * significa. Nada aqui é escrito por conteúdo: sai inteiro do diretório.
 *
 * Devolve string vazia quando falta uma das duas pontas. Um cartão que diz
 * "selecione um objetivo" ocuparia o mesmo espaço sem informar nada.
 */
export const cartaoLeitura = (faseId, objetivoId) => {
    const l = leitura(faseId, objetivoId);
    const o = objetivo(objetivoId);
    if (!l || !o) return '';
    return `
        <div class="vz-leitura vz-leitura--${esc(l.tom)}">
            <div class="vz-leitura__cabeca">
                <i data-lucide="${ICONE_TOM[l.tom] || 'info'}"></i>
                ${esc(l.rotulo)}
            </div>
            <p class="vz-leitura__texto">
                <strong>${esc(nomeFase(faseId))} + ${esc(o.nome)}.</strong> ${esc(l.nota)}
            </p>
        </div>`;
};

/**
 * A explicação longa do objetivo, dobrada em <details>.
 *
 * Fechada por padrão: quem escreve três roteiros por semana não precisa reler
 * a mesma definição toda vez. Aberta, é a referência completa — e é a mesma
 * que o cliente vê, o que faz as duas pontas discutirem sobre o mesmo texto.
 */
export const explicacaoObjetivo = (faseId, objetivoId, { aberto = false } = {}) => {
    const o = objetivo(objetivoId);
    if (!o) return '';
    const f = fase(faseId);

    const lista = (titulo, itens) => !itens?.length ? '' : `
        <div>
            <span class="vz-rotulo">${esc(titulo)}</span>
            <ul class="vz-lista">${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>`;

    return `
        <details class="vz-saiba" ${aberto ? 'open' : ''}>
            <summary>
                <i data-lucide="${esc(o.icone || 'compass')}"></i>
                O que "${esc(o.nome)}" pede deste roteiro
            </summary>
            <div class="vz-saiba__corpo">
                <p class="vz-nota">${esc(o.explicacao)}</p>
                <p class="vz-nota"><strong>Por que funciona:</strong> ${esc(o.por_que_funciona)}</p>
                ${lista('O roteiro precisa ter', o.o_roteiro_precisa_ter)}
                ${lista('Evitar', o.evitar)}
                ${o.como_medir ? `<p class="vz-nota"><strong>Como medir:</strong> ${esc(o.como_medir)}</p>` : ''}
                ${f?.objetivo_principal ? `
                    <p class="vz-nota">
                        <strong>${esc(nomeFase(faseId))}:</strong> fala com público de consciência
                        ${esc(f.nivel_consciencia_publico)}. Posição sugerida na semana:
                        ${esc(f.posicao_cronograma)}.
                    </p>` : ''}
            </div>
        </details>`;
};

/**
 * Avisos de conformidade (CFM 2.336/2023).
 *
 * Aparecem SEMPRE que a fase ou o objetivo pedem, mesmo que a equipe já saiba
 * — a norma vale para toda publicação, e o custo de ler um aviso repetido é
 * incomparavelmente menor que o de uma publicação que precisa sair do ar.
 */
export const avisosHTML = (faseId, objetivoId) => {
    const avisos = avisosConformidade(faseId, objetivoId);
    if (!avisos.length) return '';
    return avisos.map(a => `
        <div class="vz-leitura vz-leitura--${a.grave ? 'risco' : 'atencao'}">
            <div class="vz-leitura__cabeca">
                <i data-lucide="scale"></i> Conformidade
            </div>
            <p class="vz-leitura__texto">${esc(a.texto)}</p>
        </div>`).join('');
};

/**
 * Um bloco do roteiro.
 *
 * `acoes` é HTML que quem chama injeta no canto (mover, editar, excluir). A
 * tela do cliente não passa nada e o mesmo bloco vira leitura pura — é o que
 * permite a equipe editar e o cliente ler o MESMO desenho.
 */
export const blocoHTML = (b, { acoes = '' } = {}) => {
    const t = tipoBloco(b.tipo);

    if (b.tipo === 'secao') {
        return `<div class="vz-bloco vz-bloco--secao" data-bloco="${esc(b.id)}">
            <h3 class="vz-bloco__titulo">${esc(b.titulo || b.texto || 'Seção')}</h3>
            ${acoes}
        </div>`;
    }

    return `
        <article class="vz-bloco vz-bloco--${esc(b.tipo)}" data-bloco="${esc(b.id)}">
            <div class="vz-bloco__cabeca">
                <i data-lucide="${esc(t.icone)}"></i>${esc(t.nome)}
                ${acoes ? `<span style="flex:1"></span>${acoes}` : ''}
            </div>
            ${b.titulo ? `<h4 class="vz-bloco__titulo">${esc(b.titulo)}</h4>` : ''}
            ${b.texto ? `<p class="vz-bloco__texto">${escLinhas(b.texto)}</p>` : ''}
        </article>`;
};

/** O roteiro inteiro, agrupado pelas seções declaradas. */
export const roteiroHTML = (blocos, opcoes = {}) => {
    const grupos = agruparPorSecao(blocos);
    if (!grupos.length) return '';
    return `<div class="vz-blocos">${grupos.map(g => `
        ${g.secao ? blocoHTML(g.secao, opcoes.acoesDe ? { acoes: opcoes.acoesDe(g.secao) } : {}) : ''}
        ${g.blocos.map(b => blocoHTML(b, opcoes.acoesDe ? { acoes: opcoes.acoesDe(b) } : {})).join('')}
    `).join('')}</div>`;
};

/**
 * O selo de conteúdo fora da posição de origem.
 *
 * Só aparece nas telas internas. O cliente não vê remanejamento — é
 * rotatividade de produção, não informação de quem recebe, e mostrar
 * "substituído" para ele só produziria uma pergunta que ninguém quer responder.
 *
 * O texto muda conforme o caso, porque os três significam coisas diferentes:
 *   troca mútua  os dois se moveram, um para o lugar do outro;
 *   substituído  eu saí e alguém ocupou meu lugar;
 *   movido       eu saí e meu lugar ficou vazio.
 */
export const seloDeslocado = (leitura) => {
    if (!leitura) return '';

    const { ocupante, trocaMutua, de, foraDeFase } = leitura;
    const texto = trocaMutua
        ? `trocado com "${ocupante.titulo}"`
        : ocupante
            ? `saiu de ${diaCurto(de)} — no lugar dele: "${ocupante.titulo}"`
            : `movido de ${diaCurto(de)}`;

    return `
        <span class="vz-deslocado ${foraDeFase ? 'vz-deslocado--fase' : ''}"
              title="${esc(texto)}">
            <i data-lucide="${trocaMutua ? 'arrow-left-right' : 'move-right'}"></i>
            ${esc(texto)}
        </span>`;
};

/** Estado vazio padrão. */
export const vazioHTML = (icone, titulo, texto, acao = '') => `
    <div class="vz-vazio">
        <div class="vz-vazio__icone"><i data-lucide="${esc(icone)}"></i></div>
        <h3>${esc(titulo)}</h3>
        <p>${esc(texto)}</p>
        ${acao}
    </div>`;
