import { semAcento } from './formato.js';
import { listarObjetivos, objetivosDaFase, classificar } from './diretorio.js';

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTAÇÃO — do documento da social mídia para dentro do sistema.

   Dois formatos, dois parsers:

     lerTemas(texto)      o PDF de temas do mês: seções de funil, eixos e a
                          lista numerada de temas.
     lerRoteiros(texto)   o PDF de roteiros: título + roteiro, título +
                          roteiro. Os títulos são ligados aos conteúdos que
                          já existem no cronograma.

   ── O ARQUIVO NÃO FICA ────────────────────────────────────────────────────
   Nada aqui grava PDF. O texto é extraído no navegador (ver lib/pdf.js), vira
   conteúdo e bloco, e o arquivo é descartado — foi o pedido, e é a decisão
   certa: um PDF de 100kB por mês por cliente vira megabytes que ninguém
   consegue pesquisar, enquanto o mesmo conteúdo em linha de banco é filtrável,
   editável e aparece no celular do cliente.

   ── NENHUM PARSER ACERTA SOZINHO ──────────────────────────────────────────
   Documento escrito por gente varia: numeração que reinicia, eixo que parece
   tema, título com aspas curvas de um lado e retas do outro. Por isso os dois
   parsers devolvem uma PROPOSTA — com o que entenderam e o quanto confiam —
   e a tela de importação mostra tudo para conferência antes de gravar.
   Nenhuma linha entra no banco sem alguém ter olhado.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Cabeçalho de seção, tolerante a letra trocada ────────────────────────
   A comparação NÃO é exata, e o motivo é concreto: o PDF do Canva traz a
   própria tabela de caracteres errada nos títulos de display. "TOPO DE FUNIL"
   chega como "Toao de Funil" e "MEIO DE FUNIL" como "Mlio dl funil" — o dado
   está errado dentro do arquivo, e nenhum leitor conserta isso.

   Então a regra é: a linha é curta, contém "funil", e a primeira palavra dela
   PARECE topo, meio ou fundo. Semelhança por posição de caractere, que é o que
   sobrevive a uma letra trocada sem abrir a porta para falso positivo. */

const soLetras = (s) => semAcento(s).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Quantos caracteres batem na mesma posição, sobre o comprimento maior. */
const parecidoCom = (a, b) => {
    if (!a || !b) return 0;
    let iguais = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) iguais++;
    return iguais / Math.max(a.length, b.length);
};

const detectarFase = (linha) => {
    const n = soLetras(linha);

    /* ── A PALAVRA "funil" TAMBÉM CHEGA CORROMPIDA ────────────────────────
       Era a última coisa que este parser tratava como confiável, e não é. No
       PDF da Dra. Fernanda o cabeçalho chega "Toao de Funil"; no do Dr.
       Daniel, "Topo de Funpl". Exigir a palavra escrita certa fez o segundo
       documento perder a fase de TOPO inteira — 21 temas — enquanto o
       primeiro passava, por sorte de qual letra foi trocada.

       Então "funil" também é comparado por semelhança, palavra a palavra. É a
       mesma régua já usada no nome da fase, aplicada ao resto do cabeçalho.

       60 caracteres e não 32: o Canva traz subtítulo na mesma linha
       ("TOPO DE FUNIL – Emagrecimento e Metabolismo", 47 chars). */
    if (!n || n.length > 60) return null;
    const palavras = n.split(' ');
    const pareceFunil = palavras.some(w => w.length >= 4 && parecidoCom(w, 'funil') >= 0.6);
    if (!pareceFunil) return null;

    const primeira = n.split(' ')[0];
    let melhor = null, nota = 0;
    for (const id of ['topo', 'meio', 'fundo']) {
        const s = parecidoCom(primeira, id);
        if (s > nota) { nota = s; melhor = id; }
    }
    // 0,6 aceita uma letra trocada em quatro ("toao" ≈ "topo") e recusa
    // qualquer palavra que só por acaso apareça perto de "funil".
    return nota >= 0.6 ? melhor : null;
};

/* Aspas curvas, retas, travessão de citação — tudo que envolve um tema e não
   faz parte dele. Google Docs alterna entre “ ” e " " no mesmo documento. */
const tirarAspas = (s) => String(s || '').trim()
    .replace(/^[“”"'«»‘’]+/, '')
    .replace(/[“”"'«»‘’]+$/, '')
    .trim();

const ITEM = /^(\d{1,3})\s*[.)]\s*(.+)$/;
const OBJETIVO_LINHA = /^objetivo\s*[:\-–]\s*(.+)$/i;

/* Linha de cabeçalho da estratégia semanal:
     "● Reel 1 — TOPO: identificação, alcance e quebra de crenças."
   Vale a pena ler: é onde o documento diz o FORMATO de cada fase na semana,
   e adivinhar isso depois seria inventar. */
const FORMATO_LINHA = /^[●•◦▪\-–—]?\s*(.{2,40}?)\s*[—–-]\s*(topo|meio|fundo)\s*[:\-–]\s*(.*)$/i;

/**
 * Uma linha é o título de um eixo temático?
 *
 * Eixo é "Hormônios", "Menopausa e mulher 40+", "Terapias injetáveis": rótulo
 * curto, sem numeração e sem pontuação final. O que exclui, e é o caso que
 * importa, é o parágrafo de contexto que costuma vir logo abaixo do objetivo
 * da seção ("Aqui entram temas com headlines fortes, dúvidas comuns…") — ele
 * é longo e termina em ponto.
 *
 * Erro aqui é barato: eixo é rótulo de agrupamento, aparece na conferência e
 * pode ser corrigido. Errar para o lado de NÃO ser eixo é o mais seguro, e é
 * o que os limites abaixo fazem.
 */
const ehEixo = (linha) => {
    const t = linha.trim();
    if (!t || ITEM.test(t) || OBJETIVO_LINHA.test(t)) return false;
    if (t.length > 48 || t.length < 3) return false;
    if (/[.?!:;]$/.test(t)) return false;
    if (/^[“”"'«»‘’]/.test(t)) return false;          // tema entre aspas
    if (t.split(/\s+/).length > 6) return false;
    // Começar com minúscula é forte sinal de continuação de frase anterior.
    if (/^[a-zà-ÿ]/.test(t)) return false;
    /* "Dra. Fernanda Trece" tem a forma de rótulo — curto, sem pontuação
       final, em maiúscula. O que o denuncia é a abreviação no meio: rótulo de
       eixo temático não tem ponto seguido de espaço. */
    if (/\w\.\s/.test(t)) return false;
    /* Palavra de uma letra só costuma ser lixo de extração ("oln M dl oo") —
       MENOS as que existem em português. "Emagrecimento e metabolismo" é um
       eixo perfeitamente válido, e rejeitá-lo por causa do "e" fazia a seção
       inteira de temas abaixo dele ser lida como nota. */
    const UMA_LETRA_OK = new Set(['e', 'a', 'o', 'à', 'á', 'é', 'ó', 'u']);
    if (t.split(/\s+/).some(p => p.length === 1 && !UMA_LETRA_OK.has(p.toLowerCase()))) return false;
    return true;
};

/**
 * Enfeite de página: cabeçalho e rodapé que se repetem e não são conteúdo.
 *
 * Três regras, da mais confiável para a menos:
 *   · a linha aparece três vezes ou mais no documento — nenhum tema se repete
 *     tanto, e todo rodapé se repete;
 *   · contém barra vertical, que em documento de proposta só aparece em
 *     rodapé ("Proposta | Fernanda Trece AGO/2026");
 *   · é um fragmento de data solto ("/2K26", "JU/2K2"), sobra da paginação.
 *
 * A primeira regra só existe porque a segunda e a terceira não bastam: o
 * cabeçalho "Dra. Fernanda Trece" não tem nem barra nem data, e repete em
 * todas as páginas.
 */
const acharEnfeites = (linhas) => {
    const conta = new Map();
    for (const l of linhas) if (l) conta.set(l, (conta.get(l) || 0) + 1);

    const enfeite = new Set();
    for (const [l, n] of conta) {
        /* TRÊS ocorrências, não duas. Baixar para duas parecia resolver o
           cabeçalho de um documento de duas páginas e cobrava caro: no PDF da
           Dra. Fernanda, dez temas legítimos do meio de funil sumiram de uma
           vez, porque um documento longo repete construção de título com mais
           frequência do que se imagina. Enfeite que aparece só duas vezes
           incomoda; tema que some não tem conserto na tela. */
        if (n >= 3) enfeite.add(l);
        else if (l.includes('|')) enfeite.add(l);
        else if (/^[A-Za-z]{0,3}\/\d/.test(l)) enfeite.add(l);
    }
    return enfeite;
};

/* Formato declarado numa linha própria, logo ANTES do nome da fase:

       Reel 1
       Topo do Funil
       Identificação, alcance e quebra de crenças.

   É como o documento novo escreve a estratégia da semana. O documento antigo
   escrevia tudo numa linha só ("● Reel 1 — TOPO: …"), e os dois continuam
   valendo. */
const FORMATO_SOLTO = /^(reel|carrossel|story|stories|v[íi]deo|post|carrossel est[áa]tico|foto|album|álbum)\b/i;

/* Palavras do objetivo declarado no documento → objetivo do nosso diretório.
   A ordem importa: a primeira que casar vence, e as mais específicas vêm
   antes. "educar e mostrar que existe uma abordagem médica individualizada"
   tem "educar" e "individualizada"; o par certo é autoridade, então
   "individualizad" vem antes de "educ". */
const PISTAS_OBJETIVO = [
    [/depoiment|prova social|antes e depois|caso real/i, 'prova-social'],
    [/objeç|objec|quebra de crenç|crenç/i, 'quebra-objecao'],
    [/consulta|agendar|agendamento|intenç[aã]o|convers[aã]o|vender|inscri/i, 'conversao'],
    [/individualizad|autoridade|m[ée]todo|abordagem|t[ée]cnic|aprofundament/i, 'autoridade'],
    [/lan[çc]ament|institucional|inaugura|equipe nova|novidade da cl[íi]nica/i, 'institucional'],
    [/bastidor|proximidade|human|pessoas por tr[áa]s/i, 'relacionamento'],
    [/lembran[çc]a|recall|top of mind/i, 'recall'],
    [/alcance|compartilh|viral|identifica[çc]|salvament/i, 'alcance'],
    [/educ|explicar|entender|ensinar|esclarec/i, 'educacao'],
];

/**
 * Objetivo sugerido a partir da frase que o documento escreveu.
 * Sem pista reconhecível, cai no primeiro objetivo NATURAL daquela fase — que
 * é a resposta certa na maioria das vezes e nunca é absurda.
 */
export const sugerirObjetivo = (textoObjetivo, faseId) => {
    const t = String(textoObjetivo || '');
    for (const [re, id] of PISTAS_OBJETIVO) {
        if (re.test(t) && listarObjetivos().some(o => o.id === id)) return id;
    }
    return objetivosDaFase(faseId)[0]?.id || null;
};

/**
 * Lê o documento de temas.
 *
 * @returns {{
 *   introducao: string,
 *   formatos: Object<string,string>,
 *   secoes: {fase: string, objetivoTexto: string, objetivo: string, nota: string,
 *            temas: {numero: number, eixo: string, titulo: string, divergencia: object|null}[]}[],
 *   total: number, avisos: string[]
 * }}
 */
export const lerTemas = (texto) => {
    const todas = String(texto || '').split('\n').map(l => l.trim());
    const enfeites = acharEnfeites(todas);
    const linhas = todas.filter(l => !enfeites.has(l));

    const secoes = [];
    const formatos = {};
    const introducao = [];
    const avisos = [];
    const vistos = new Set();
    let repetidos = 0;
    let atual = null;
    let eixo = '';
    let esperandoNota = false;
    let anterior = '';

    for (const linha of linhas) {
        if (!linha) { anterior = ''; continue; }

        const fase = detectarFase(linha);
        if (fase) {
            /* Página de estratégia: o formato vem na linha de cima e o que
               segue é a descrição da fase, não tema. Reconhecer isso evita
               três seções fantasma no fim do documento — e ainda aproveita o
               formato, que é informação de verdade. */
            if (FORMATO_SOLTO.test(anterior)) {
                formatos[fase] = anterior.trim();
                atual = null;
                esperandoNota = false;
                anterior = linha;
                continue;
            }
            /* Mesma fase declarada duas vezes: continua a seção existente em
               vez de abrir outra. O documento é escrito por gente e às vezes
               repete o cabeçalho ao virar a página. */
            atual = secoes.find(s => s.fase === fase)
                || (secoes.push({ fase, objetivoTexto: '', objetivo: null, nota: '', temas: [] }),
                    secoes[secoes.length - 1]);
            eixo = '';
            esperandoNota = false;
            anterior = linha;
            continue;
        }

        const fmt = linha.match(FORMATO_LINHA);
        if (fmt && !atual) {
            // "● Reel 1 — TOPO: …" → o formato daquela fase, no documento antigo.
            formatos[fmt[2].toLowerCase()] = fmt[1].trim();
            introducao.push(linha.replace(/^[●•◦▪]\s*/, ''));
            anterior = linha;
            continue;
        }

        if (!atual) { introducao.push(linha); anterior = linha; continue; }
        anterior = linha;

        const obj = linha.match(OBJETIVO_LINHA);
        if (obj) {
            /* Só aceita Objetivo: se a seção ainda não tem temas.
               Documento com múltiplas páginas por fase repete o
               cabeçalho e o objetivo em cada página — sem este guarda,
               o flag esperandoNota reativava e todos os temas da
               página seguinte iam para nota em vez de temas. */
            if (!atual.temas.length) {
                atual.objetivoTexto = obj[1].trim();
                atual.objetivo = sugerirObjetivo(atual.objetivoTexto, atual.fase);
                esperandoNota = true;
            }
            continue;
        }

        if (ehEixo(linha)) { eixo = linha; esperandoNota = false; continue; }

        /* Tema numerado desativa esperandoNota. Sem isso, um documento
           com Objetivo: seguido direto de temas numerados (sem eixo no
           meio) engolia TODOS os temas como nota da seção. */
        const item = linha.match(ITEM);
        if (esperandoNota && item) esperandoNota = false;

        /* Continuação de título. Um tema longo quebra em duas linhas no PDF, e
           a segunda vem sem numeração:

               Por que algumas pessoas respondem melhor aos medicamentos para
               emagrecimento?

           Sem juntar, o tema entra pela metade — e a metade órfã ainda entra
           como um tema a mais, o que é pior: são dois erros que parecem certos
           na conferência rápida. A junção só acontece quando o título anterior
           está gramaticalmente aberto (não terminou em pontuação nem em
           aspas), que é exatamente o rastro que uma quebra de linha deixa.

           Esta checagem vem ANTES da de tema, e não depois. Quando os temas
           deixaram de ser numerados, qualquer linha passou a poder ser tema —
           e a continuação, que nunca chegava a ser testada, virou tema órfão. */
        const ultimo = atual.temas[atual.temas.length - 1];
        if (!esperandoNota && ultimo && !/[.?!:…”"]$/.test(ultimo.titulo)) {
            ultimo.titulo = tirarAspas(`${ultimo.titulo} ${linha}`);
            ultimo.divergencia = conferirTema(ultimo.titulo, atual.fase);
            continue;
        }

        // Parágrafo de contexto logo abaixo do objetivo — nota da seção.
        if (esperandoNota) { atual.nota = `${atual.nota} ${linha}`.trim(); continue; }

        /* Tema. A numeração é OPCIONAL: o documento antigo numerava, o novo
           não. Quando existe, vira o rótulo; quando não, a posição na seção
           serve. O que identifica um tema é o descarte de tudo o mais —
           enfeite, eixo, objetivo, nota e continuação já saíram antes daqui. */
        const titulo = tirarAspas(item ? item[2] : linha);
        if (!titulo) continue;

        /* Dois cortes contra sobra de diagramação. Sem numeração para se
           apoiar, qualquer linha solta viraria tema, e o fim do documento
           costuma trazer capa e página de estratégia:

             · menos de 15 caracteres não é tema, é rótulo picado pela extração
               ("Reel 1", "oln M dl oo" — este passou a entrar como tema quando
               o limite caiu para 10, e é exatamente o tipo de sujeira que a
               regra existe para barrar);
             · terminar em dois-pontos é abertura de lista, não pauta
               ("…pensamos em trabalhar com o método do funil de conteúdo:"). */
        if (titulo.length < 15 || /:$/.test(titulo)) continue;

        /* Documento escrito por gente repete bloco ao copiar e colar entre
           seções. Importar o mesmo tema duas vezes criaria dois conteúdos
           idênticos em semanas diferentes, e ninguém percebe até o cliente
           perguntar por que a mesma pauta apareceu de novo. */
        const chave = semAcento(titulo).replace(/[^a-z0-9]/g, '');
        if (vistos.has(chave)) { repetidos++; continue; }
        vistos.add(chave);

        atual.temas.push({
            numero: item ? Number(item[1]) : atual.temas.length + 1,
            eixo,
            titulo,
            /* O classificador confere o que o documento afirmou. Ele não manda
               — a seção do PDF é a fonte — mas discordar em silêncio seria
               desperdiçar a única checagem automática que temos. */
            divergencia: conferirTema(titulo, atual.fase),
        });
    }

    for (const s of secoes) {
        if (!s.objetivo) s.objetivo = sugerirObjetivo('', s.fase);
        if (!s.temas.length) avisos.push(`A seção de ${s.fase} de funil não trouxe nenhum tema.`);
    }
    if (!secoes.length) {
        avisos.push('Não encontrei nenhuma seção de funil. O documento precisa ter linhas como '
                  + '"TOPO DE FUNIL", "MEIO DE FUNIL" e "FUNDO DE FUNIL".');
    }
    if (repetidos) {
        avisos.push(`${repetidos} tema(s) apareciam repetidos no documento e entraram uma vez só.`);
    }

    return {
        introducao: introducao.join(' ').trim(),
        formatos,
        secoes,
        total: secoes.reduce((t, s) => t + s.temas.length, 0),
        avisos,
    };
};

/* Só reporta quando o classificador tem confiança e discorda — o mesmo
   critério do formulário de conteúdo. Um aviso por tema seria ruído sobre
   ruído numa lista de oitenta linhas. */
const conferirTema = (titulo, fase) => {
    const s = classificar(titulo);
    if (!s || s.fase === fase || s.confianca === 'baixa') return null;
    return { fase: s.fase, termos: s.termos, regra: s.regra };
};

// ═══════════════════════════════════════════════════════════════════════════
// ROTEIROS
// ═══════════════════════════════════════════════════════════════════════════

/* Rótulos que abrem um bloco. O documento da social mídia não segue um padrão
   fechado, então a lista é generosa e o que não casar vira fala — que é o tipo
   mais comum e o mais fácil de trocar depois, num clique no editor. */
const ROTULOS = [
    [/^(gancho|hook|abertura|chamada inicial)\s*[:\-–]\s*/i, 'gancho'],
    [/^(cta|chamada para a[çc][aã]o|call to action|convite)\s*[:\-–]\s*/i, 'cta'],
    [/^(frase|frase curta|frase de impacto|impacto|legenda)\s*[:\-–]\s*/i, 'frase'],
    [/^(se[çc][aã]o|parte|etapa|bloco)\s*\d*\s*[:\-–]\s*/i, 'secao'],
    [/^(orienta[çc][aã]o|nota|obs|observa[çc][aã]o|grava[çc][aã]o|imagem|c[aâ]mera|edi[çc][aã]o)\s*[:\-–]\s*/i, 'nota'],
    [/^(fala|narra[çc][aã]o|texto|roteiro|corpo)\s*\d*\s*[:\-–]\s*/i, 'fala'],
];

const tipoDaLinha = (linha) => {
    for (const [re, tipo] of ROTULOS) {
        const m = linha.match(re);
        if (m) return { tipo, texto: linha.slice(m[0].length).trim() };
    }
    // [entre colchetes] é convenção universal de instrução de gravação.
    const col = linha.match(/^\[(.+)\]$/);
    if (col) return { tipo: 'nota', texto: col[1].trim() };
    return null;
};

/* Formatação de WhatsApp e de Docs, que vem colada no texto e não é texto:
   *negrito*, _itálico_, ~riscado~. Some na leitura porque nenhum desses
   marcadores sobrevive a virar bloco de roteiro — e um título que chega como
   "*ROTEIRO FLACIDEZ NA FACE*" não casa com nada. */
const semMarcacao = (s) => String(s || '')
    .replace(/[*_~]{1,3}(.+?)[*_~]{1,3}/g, '$1')
    .replace(/^[*_~\s]+|[*_~\s]+$/g, '')
    .trim();

/** Marcador de item: "- ", "• ", "– ", "1. ". Devolve só o texto. */
const SEM_MARCADOR = /^\s*(?:[-–—•●◦▪*]|\d{1,3}\s*[.)])\s+/;
const ehItem = (linha) => SEM_MARCADOR.test(linha);

/* Linha que ANUNCIA um roteiro pela forma, sem depender de casar com nada:

     *ROTEIRO FLACIDEZ NA FACE*
     ROTEIRO: flacidez na face
     Roteiro 3 — Flacidez

   É o formato que a social mídia usa de verdade, e resolve o caso em que o
   apelido do roteiro ("FLACIDEZ NA FACE") não se parece com o título longo do
   tema ("Você emagreceu e percebeu que seu rosto ficou mais caído?"). Sem
   isso, um documento inteiro desses seria lido como um bloco só. */
const TITULO_EXPLICITO = /^roteiro\s*\d*\s*[:\-–—]?\s*(.+)$/i;

const tituloDeclarado = (linha) => {
    const limpa = semMarcacao(linha);
    if (!limpa || ehItem(linha)) return null;
    const m = limpa.match(TITULO_EXPLICITO);
    if (m && m[1].trim()) return m[1].trim();
    /* Linha inteira em CAIXA ALTA, curta e sem pontuação final também é
       título. Documento de roteiro usa isso o tempo todo, e o custo de errar é
       baixo: a conferência mostra a ligação e permite trocar. */
    if (limpa.length <= 70 && limpa === limpa.toUpperCase() && /[A-ZÀ-Ý]/.test(limpa)
        && !/[.?!]$/.test(limpa)) return limpa;
    return null;
};

/* Sinais de que a última fala é o pedido, e não mais uma explicação. Só o
   ÚLTIMO bloco é testado: "a avaliação individualizada é fundamental" no meio
   do roteiro é argumento, não chamada — e testar todos transformaria metade
   das falas em CTA. */
const SINAIS_CTA = /agend|marque sua|marque a sua|garanta|te aguardo|aguardo voc|link na bio|chama no|chame no|whats|direct|inscre|clique|comenta aqui|salve esse|compartilh|marque algu|te espero|venha conhecer|entre em contato|fale comigo/i;

/* Palavras que não distinguem um título de outro. Sem removê-las, "O que
   avaliar antes de iniciar um tratamento" e "O que fazer quando o paciente
   chega" ficam parecidos por causa de "o que", "de", "um" — e o importador
   liga o roteiro ao conteúdo errado, que é bem pior que não ligar a nada. */
const VAZIAS = new Set(('a as o os um uma uns umas de do da dos das em no na nos nas por para pelo pela '
    + 'com sem sob sobre entre ate apos ante e ou mas que se quando onde como porque pois ja ainda mais '
    + 'menos muito pouco tao tambem nao sim e sao foi eram ser sido sendo tem tinha ter tendo ha havia '
    + 'esta estao estava estar fui foram vou vai vamos ir fazer faz fez feito eu ele ela nos eles elas me '
    + 'te lhe seu sua seus suas meu minha isso isto esse essa este esta aquele aquela ao aos as qual quais '
    + 'voce vocce dr dra').split(/\s+/));

const fichas = (texto) => new Set(
    semAcento(texto)
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(p => p.length > 2 && !VAZIAS.has(p)));

/**
 * Semelhança entre dois títulos, de 0 a 1.
 *
 * Não é Jaccard puro, e o motivo veio do documento real: o roteiro se chama
 * "FLACIDEZ NA FACE" e o tema cadastrado é "Flacidez depois do emagrecimento:
 * o que fazer com o rosto?". Jaccard divide pela UNIÃO, então um apelido de
 * duas palavras contra um título de oito nunca passa de 0,17 — por mais que
 * a palavra que importa esteja lá.
 *
 * Por isso entra também a COBERTURA: quanto do lado mais curto aparece no mais
 * longo. Ela responde "o apelido está contido no título?", que é exatamente a
 * pergunta certa aqui.
 *
 * A cobertura sozinha seria frouxa demais — uma palavra em comum daria 1,0 e
 * a ligação errada viria com cara de certeza. Então ela é remapeada para a
 * faixa 0,34–0,54, que a tela lê como certeza BAIXA: suficiente para a
 * sugestão aparecer no seletor, insuficiente para alguém confiar sem olhar.
 */
export const semelhanca = (a, b) => {
    const A = fichas(a), B = fichas(b);
    if (!A.size || !B.size) return 0;
    let comuns = 0;
    for (const p of A) if (B.has(p)) comuns++;
    if (!comuns) return 0;

    const jaccard = comuns / (A.size + B.size - comuns);
    const cobertura = comuns / Math.min(A.size, B.size);
    return Math.max(jaccard, cobertura >= 0.5 ? 0.34 + 0.2 * cobertura : 0);
};

/**
 * Acha o conteúdo cujo título mais se parece com um ou mais trechos.
 *
 * Recebe uma LISTA de trechos porque o título do roteiro nem sempre é o que
 * identifica o conteúdo. No documento real, o título é um apelido curto
 * ("FLACIDEZ NA FACE") e quem carrega as palavras do tema é a primeira fala
 * ("Você emagreceu e percebeu que seu rosto ficou mais caído?"). Comparar as
 * duas coisas e ficar com a melhor liga roteiros que o título sozinho perderia.
 *
 * `certeza` acompanha o resultado para a tela separar a ligação óbvia da que
 * precisa de olho humano.
 */
export const casarConteudo = (trechos, conteudos) => {
    const lista = (Array.isArray(trechos) ? trechos : [trechos]).filter(Boolean);
    let melhor = null, nota = 0, veioDe = '';
    for (const c of conteudos) {
        for (const t of lista) {
            const s = Math.max(semelhanca(t, c.titulo), semelhanca(t, c.tema || ''));
            if (s > nota) { nota = s; melhor = c; veioDe = t; }
        }
    }
    if (nota < 0.34) return null;
    return {
        conteudo: melhor, nota, veioDe,
        certeza: nota >= 0.7 ? 'alta' : nota >= 0.5 ? 'média' : 'baixa',
    };
};

/**
 * Lê o documento de roteiros e liga cada um a um conteúdo do cronograma.
 *
 * A regra de corte é: uma linha que se parece com o título de um conteúdo
 * existente ABRE um roteiro novo, e tudo até a próxima dessas pertence a ele.
 * É por isso que o pedido de "usar os mesmos títulos do PDF de temas" resolve
 * o problema inteiro — sem os títulos, não há como saber onde um roteiro
 * termina e o outro começa.
 *
 * @returns {{roteiros: {linha, conteudo, nota, certeza, blocos}[], soltos: string[], avisos: string[]}}
 */
export const lerRoteiros = (texto, conteudos) => {
    const linhas = String(texto || '').split('\n').map(l => l.trim());
    const roteiros = [];
    const soltos = [];
    const avisos = [];
    let atual = null;
    let paragrafo = [];

    const fecharParagrafo = () => {
        const t = paragrafo.join(' ').trim();
        paragrafo = [];
        if (!t || !atual) return;
        atual.blocos.push({ tipo: 'fala', titulo: null, texto: t });
    };

    const abrir = (titulo) => {
        fecharParagrafo();
        atual = { titulo, blocos: [], conteudo: null, nota: 0, certeza: null, veioDe: '' };
        roteiros.push(atual);
    };

    for (const linha of linhas) {
        if (!linha) { fecharParagrafo(); continue; }

        // 1. Título anunciado pela forma: "*ROTEIRO X*", "ROTEIRO: X", CAIXA ALTA.
        const declarado = tituloDeclarado(linha);
        if (declarado) { abrir(declarado); continue; }

        /* 2. Título que casa com um conteúdo já cadastrado. Só é tentado em
           linha CURTA e que NÃO seja item de lista: sem esses limites, uma
           fala que repete palavras do título abriria um roteiro novo no meio
           do anterior, e o resto do texto iria parar no conteúdo errado. */
        if (linha.length <= 140 && !ehItem(linha)) {
            const limpa = tirarAspas(semMarcacao(linha));
            const casa = casarConteudo(limpa, conteudos);
            if (casa && casa.nota >= 0.5 && !roteiros.some(r => r.conteudo?.id === casa.conteudo.id)) {
                abrir(limpa);
                Object.assign(atual, casa);
                continue;
            }
        }

        // 3. Linha com rótulo explícito ("Gancho:", "CTA:", "[câmera]").
        const rotulado = tipoDaLinha(semMarcacao(linha));
        if (rotulado) {
            fecharParagrafo();
            if (!atual) { soltos.push(linha); continue; }
            atual.blocos.push({
                tipo: rotulado.tipo,
                titulo: rotulado.tipo === 'secao' ? rotulado.texto : null,
                texto: rotulado.tipo === 'secao' ? null : rotulado.texto,
            });
            continue;
        }

        if (!atual) { soltos.push(linha); continue; }

        /* 4. Item de lista é um bloco INTEIRO, sozinho. É o formato do roteiro
           de verdade — uma fala por marcador — e juntá-lo ao parágrafo vizinho
           destruiria justamente o recorte que quem escreveu já fez à mão. */
        if (ehItem(linha)) {
            fecharParagrafo();
            const t = semMarcacao(linha.replace(SEM_MARCADOR, ''));
            if (t) atual.blocos.push({ tipo: 'fala', titulo: null, texto: t });
            continue;
        }

        // 5. Sobrou: prosa. Acumula até a linha em branco.
        paragrafo.push(semMarcacao(linha));
    }
    fecharParagrafo();

    for (const r of roteiros) {
        r.blocos = r.blocos.filter(b => (b.texto && b.texto.trim()) || (b.titulo && b.titulo.trim()));
        tipar(r.blocos);
        // O título do roteiro pode ser apelido, mas a primeira fala carrega as
        // palavras do tema. Tenta ligar pelos dois quando o título não bastou.
        if (!r.conteudo) {
            const casa = casarConteudo([r.titulo, r.blocos[0]?.texto], conteudos);
            if (casa && !roteiros.some(x => x.conteudo?.id === casa.conteudo.id)) Object.assign(r, casa);
        }
        if (!r.blocos.length) avisos.push(`"${r.titulo}" foi reconhecido como roteiro, mas veio sem texto embaixo.`);
    }

    const semLigacao = roteiros.filter(r => !r.conteudo).length;
    if (!roteiros.length) {
        avisos.push('Não reconheci nenhum roteiro. O documento precisa separar cada um por um título — '
                  + 'em caixa alta, começando com "ROTEIRO", ou repetindo o título do tema.');
    } else if (semLigacao) {
        avisos.push(`${semLigacao} roteiro(s) não foram ligados a nenhum conteúdo do cronograma. `
                  + 'Escolha o conteúdo de cada um na lista abaixo, ou deixe de fora.');
    }

    return { roteiros, soltos, avisos };
};

/**
 * Dá tipo aos blocos que vieram sem rótulo.
 *
 * Duas regras, e só duas, porque são as únicas que a estrutura do roteiro
 * sustenta sozinha:
 *
 *   · a PRIMEIRA fala é o gancho. Não é chute: o roteiro abre pelo que segura
 *     quem está passando, e `avisosDeEstrutura` reclama de todo roteiro sem
 *     gancho — importar oitenta e receber oitenta avisos ensinaria a ignorar
 *     o aviso.
 *   · a ÚLTIMA fala é a chamada para ação SE pedir alguma coisa. Sem os
 *     sinais, continua fala: nem todo roteiro fecha pedindo.
 *
 * O resto fica como fala. Trocar o tipo é um clique no editor, e chutar
 * "frase curta" por causa do comprimento acertaria metade das vezes — o que,
 * numa importação de oitenta, é metade errada.
 */
const tipar = (blocos) => {
    const falados = blocos.filter(b => b.tipo === 'fala');
    if (!falados.length) return;

    const jaTemGancho = blocos.some(b => b.tipo === 'gancho');
    if (!jaTemGancho && blocos[0]?.tipo === 'fala') blocos[0].tipo = 'gancho';

    const jaTemCta = blocos.some(b => b.tipo === 'cta');
    const ultimo = blocos[blocos.length - 1];
    if (!jaTemCta && ultimo?.tipo === 'fala' && SINAIS_CTA.test(ultimo.texto || '')) {
        ultimo.tipo = 'cta';
    }

    /* Frase curta: uma afirmação só, curta e sem vírgula, no MEIO do roteiro.
       "Isso é mais comum do que parece." é isso; "Por isso, a avaliação
       individualizada é fundamental para definir o melhor plano" não é.
       Os três limites juntos é que tornam a regra segura:

         · até 58 caracteres — acima disso é argumento, não frase de efeito;
         · sem vírgula — frase de impacto não tem oração subordinada;
         · nem primeira nem última — essas já são gancho e chamada.

       Errar aqui custa um clique no editor para trocar o tipo. Não classificar
       nada custa a pessoa marcar tudo à mão, que é o problema que este parser
       existe para resolver. */
    blocos.forEach((b, i) => {
        if (b.tipo !== 'fala' || i === 0 || i === blocos.length - 1) return;
        const t = (b.texto || '').trim();
        if (t.length <= 58 && !t.includes(',') && /[.!?…]$/.test(t)) b.tipo = 'frase';
    });
};

/**
 * Lê UM roteiro colado inteiro, sem depender de casar com conteúdo nenhum.
 *
 * `lerRoteiros` existe para o documento com vários roteiros, e por isso precisa
 * de títulos para saber onde um termina e o outro começa. Aqui o contexto já
 * diz de quem é o roteiro — a pessoa está dentro do conteúdo — então título é
 * opcional e tudo que vier vira bloco.
 *
 * @returns {{titulo: string|null, blocos: object[]}}
 */
export const lerRoteiroUnico = (texto) => {
    const linhas = String(texto || '').split('\n').map(l => l.trim());
    const blocos = [];
    let titulo = null;
    let paragrafo = [];

    const fecharParagrafo = () => {
        const t = paragrafo.join(' ').trim();
        paragrafo = [];
        if (t) blocos.push({ tipo: 'fala', titulo: null, texto: t });
    };

    for (const linha of linhas) {
        if (!linha) { fecharParagrafo(); continue; }

        /* Só a PRIMEIRA linha pode ser o título, e só antes de qualquer bloco.
           Depois disso, uma linha em caixa alta no meio do roteiro é ênfase da
           roteirista — não um segundo título. */
        if (!titulo && !blocos.length && !paragrafo.length) {
            const t = tituloDeclarado(linha);
            if (t) { titulo = t; continue; }
        }

        const rotulado = tipoDaLinha(semMarcacao(linha));
        if (rotulado) {
            fecharParagrafo();
            blocos.push({
                tipo: rotulado.tipo,
                titulo: rotulado.tipo === 'secao' ? rotulado.texto : null,
                texto: rotulado.tipo === 'secao' ? null : rotulado.texto,
            });
            continue;
        }

        // Marcador de lista é um bloco inteiro: é o recorte que a roteirista
        // já fez à mão, e juntá-lo ao vizinho seria desfazer trabalho pronto.
        if (ehItem(linha)) {
            fecharParagrafo();
            const t = semMarcacao(linha.replace(SEM_MARCADOR, ''));
            if (t) blocos.push({ tipo: 'fala', titulo: null, texto: t });
            continue;
        }

        paragrafo.push(semMarcacao(linha));
    }
    fecharParagrafo();

    const limpos = blocos.filter(b => (b.texto && b.texto.trim()) || (b.titulo && b.titulo.trim()));
    tipar(limpos);
    return { titulo, blocos: limpos };
};
