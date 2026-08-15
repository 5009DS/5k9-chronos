import { TAXONOMIA, OBJETIVOS } from './diretorio-dados.js';

/* ═══════════════════════════════════════════════════════════════════════════
   DIRETÓRIO — a parte "inteligente" do sistema.

   Duas camadas descrevem cada conteúdo:

     FASE      para quem ele fala   (fundo · meio · topo)
     OBJETIVO  o que precisa provocar (autoridade, prova social, conversão…)

   São independentes de propósito. Dois roteiros de meio de funil podem ter
   objetivos opostos, e é o CRUZAMENTO dos dois que diz alguma coisa útil a
   quem vai gravar. Marcar um conteúdo como "meio de funil + construção de
   autoridade" faz o sistema mostrar sozinho: o que aquele objetivo pede do
   roteiro, por que aquele par funciona, o que evitar e o que medir depois.

   ── O QUE ESTE ARQUIVO NÃO É ──────────────────────────────────────────────
   Não é um modelo de linguagem, e não deve virar um. Toda frase que o sistema
   exibe vem de diretorio-dados.js — escrita, revisada e corrigível por quem
   entende do negócio. A classificação automática é contagem de sinais, e ela
   DEVOLVE OS SINAIS QUE ENCONTROU junto com o palpite: quem lê a sugestão
   consegue conferir por que ela apareceu e discordar com base. É a mesma
   regra do 5K9 Forms, onde a tela de análise diz abertamente o que ela não
   calcula em vez de exibir número inventado.

   ── SOBREPOSIÇÃO ──────────────────────────────────────────────────────────
   `usarDiretorio()` troca o conteúdo em memória pelo JSON enviado em
   Configurações. É como a estratégia evolui sem passar por deploy — mas o
   arquivo gerado continua sendo a base, então limpar a sobreposição devolve
   o sistema a um estado conhecido.
   ═══════════════════════════════════════════════════════════════════════════ */

let taxonomia = TAXONOMIA;
let objetivos = OBJETIVOS;

/**
 * Substitui o diretório em memória pelo pacote enviado.
 * Aceita { taxonomia, objetivos } ou qualquer um dos dois isolado — a
 * equipe pode querer atualizar só os objetivos sem reenviar a taxonomia.
 */
export const usarDiretorio = (pacote) => {
    if (!pacote) return;
    if (pacote.taxonomia?.fases)     taxonomia = pacote.taxonomia;
    if (pacote.fases)                taxonomia = pacote;
    if (pacote.objetivos?.objetivos) objetivos = pacote.objetivos;
    if (Array.isArray(pacote.objetivos)) objetivos = { ...objetivos, objetivos: pacote.objetivos };
};

export const restaurarDiretorio = () => {
    taxonomia = TAXONOMIA;
    objetivos = OBJETIVOS;
};

/** O diretório inteiro, como está agora. Usado pela tela de Diretório. */
export const diretorio = () => ({ taxonomia, objetivos });

// ── Consulta ────────────────────────────────────────────────────────────

export const listarFases = () => taxonomia.fases;
export const fase = (id) => taxonomia.fases.find(f => f.id === id) || null;

export const listarObjetivos = () => objetivos.objetivos;
export const objetivo = (id) => objetivos.objetivos.find(o => o.id === id) || null;

/** Rótulo curto para chip: 'Fundo', 'Meio', 'Topo'. */
export const rotuloFase = (id) => ({ fundo: 'Fundo', meio: 'Meio', topo: 'Topo' }[id] || '—');

/** Nome inteiro: 'Fundo de funil'. */
export const nomeFase = (id) => ({
    fundo: 'Fundo de funil', meio: 'Meio de funil', topo: 'Topo de funil',
}[id] || 'Sem fase');

/**
 * A leitura de um PAR fase × objetivo.
 *
 * É o coração do sistema: devolve se a combinação é natural, exige cuidado ou
 * está em conflito, com a nota específica daquele cruzamento. A tela do
 * cliente mostra isso sem que ninguém precise escrever nada por conteúdo.
 */
export const leitura = (faseId, objetivoId) => {
    const o = objetivo(objetivoId);
    const entrada = o?.por_fase?.[faseId];
    if (!entrada) return null;
    const meta = objetivos.leituras?.[entrada.leitura] || {};
    return {
        chave: entrada.leitura,
        nota: entrada.nota,
        rotulo: meta.rotulo || entrada.leitura,
        tom: meta.tom || 'neutro',
        explicacao: meta.explicacao || '',
    };
};

/**
 * Objetivos ordenados pela aderência a uma fase: naturais primeiro, em
 * conflito por último. É o que ordena o seletor no formulário — a lista
 * ensina enquanto a pessoa escolhe, em vez de despejar nove opções soltas.
 */
export const objetivosDaFase = (faseId) => {
    const peso = { natural: 0, exige_cuidado: 1, conflito: 2 };
    return [...listarObjetivos()]
        .map(o => ({ ...o, _leitura: o.por_fase?.[faseId]?.leitura || 'exige_cuidado' }))
        .sort((a, b) => (peso[a._leitura] ?? 1) - (peso[b._leitura] ?? 1)
                     || a.nome.localeCompare(b.nome, 'pt-BR'));
};

/**
 * Aviso de conformidade que vale para um conteúdo.
 *
 * Vem de dois lugares e os dois importam: a fase carrega o alerta geral da
 * Resolução CFM 2.336/2023 (`compliance_flag` na taxonomia) e o objetivo
 * carrega o alerta específico — prova social é o caso agudo. Devolve os dois
 * quando existem, sem juntar em um texto só: são responsabilidades
 * diferentes na hora da revisão jurídica.
 */
export const avisosConformidade = (faseId, objetivoId) => {
    const avisos = [];
    const f = fase(faseId);
    const o = objetivo(objetivoId);
    if (f?.compliance_flag) avisos.push({ origem: 'fase', texto: f.compliance_flag, grave: false });
    if (o?.compliance)      avisos.push({ origem: 'objetivo', texto: o.compliance, grave: true });
    return avisos;
};

// ── Classificação automática ────────────────────────────────────────────
/* Contagem de sinais sobre o texto, não adivinhação.

   Os termos vêm de `palavras_chave` na taxonomia (dado, editável pela
   equipe). A eles somam-se RADICAIS derivados dos `sinais_classificacao` —
   escritos aqui porque são morfologia, não estratégia: "agende", "agendar" e
   "agendamento" são o mesmo sinal, e pedir que a equipe liste as três formas
   em JSON é transformar conhecimento de negócio em trabalho de gramática.

   Cada radical é procurado como PREFIXO DE PALAVRA (\b...), nunca no meio:
   sem isso "vaga" casa dentro de "divagar" e a sugestão fica inexplicável
   justamente quando alguém for conferir por que ela apareceu. */

const RADICAIS = {
    fundo: ['agend', 'inscri', 'matricul', 'vaga', 'garant', 'depoiment', 'lançament',
            'lancament', 'campanha', 'promo', 'últim', 'ultim', 'prazo', 'urgen',
            'antes e depois', 'resultado real', 'caso real', 'transformaç', 'transformac',
            'não perca', 'nao perca', 'marque sua', 'chame no', 'link na bio'],
    meio:  ['por que', 'porque', 'como funciona', 'entend', 'explic', 'caus', 'sintom',
            'bastidor', 'diagnóstic', 'diagnostic', 'planejament', 'protocol', 'tratament',
            'etapa', 'passo a passo', 'diferen', 'mecanism', 'avaliaç', 'avaliac',
            'você sabia', 'voce sabia', 'o que acontece', 'sinais de'],
    /* "marque" aparece nas duas pontas com sentidos opostos: "marque sua
       consulta" é conversão (fundo) e "marque aquele amigo" é alcance (topo).
       Por isso os dois lados carregam a expressão INTEIRA, nunca o verbo
       sozinho — que casaria com as duas e não decidiria nada. */
    topo:  ['mito', 'verdade', 'dica', 'rotina', 'salve', 'compartilh',
            'marque alguém', 'marque alguem', 'marque aquele', 'marque aquela',
            'marque quem', 'marca aquele', 'manda para aquele',
            'dia a dia', 'hidrat', 'sono', 'alimentaç', 'alimentac',
            'hábito', 'habito', 'curiosidade', 'você já', 'voce ja', 'quem nunca',
            'bem-estar', 'bem estar'],
};

/* Regra de desempate número 2 da taxonomia: "Prova social/depoimento sempre
   puxa para Fundo, mesmo que o tom pareça leve". Fica separada porque não é
   um voto a mais — é um veto sobre o resultado. */
const PROVA_SOCIAL = ['depoiment', 'antes e depois', 'resultado real', 'caso real',
                      'paciente cont', 'história d', 'historia d', 'relato d',
                      'transformaç', 'transformac'];

const normalizar = (s) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Termos de uma lista presentes no texto, já normalizados dos dois lados. */
const encontrar = (texto, termos) => {
    const alvo = normalizar(texto);
    return termos.filter(t => {
        const termo = normalizar(t);
        // Fronteira de palavra à esquerda apenas: o lado direito fica aberto
        // porque os radicais existem justamente para casar a flexão
        // ("agend" → agendar, agendamento, agende).
        return new RegExp(`(^|[^a-z0-9])${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(alvo);
    });
};

/**
 * Descarta os achados que são o MESMO sinal contado de novo.
 *
 * "Últimas vagas para o mutirão" casava quatro termos — "últimas vagas",
 * "vaga", "últim" e "ultim" — que são um sinal só escrito de quatro jeitos.
 * Isso inflava a pontuação e, pior, aparecia na justificativa como quatro
 * evidências independentes: quem lesse acharia que o texto tinha muito mais
 * indício de fundo do que tem.
 *
 * A regra é conter: se um termo achado está dentro de outro termo achado, o
 * mais curto sai. Fica sempre o mais específico, que é também o mais legível
 * na justificativa.
 */
const distintos = (termos) => {
    const norm = termos.map(t => ({ bruto: t, n: normalizar(t) }));
    return norm
        .filter(a => !norm.some(b => b.n !== a.n && b.n.includes(a.n)))
        .map(a => a.bruto);
};

/**
 * Sugere a fase de um tema ou roteiro.
 *
 * Devolve null quando não encontra sinal nenhum — e isso é deliberado. Um
 * classificador que sempre responde algo transforma "não sei" em "topo", que
 * é a fase com menos sinais explícitos, e a equipe passa a ver sugestões
 * erradas com cara de certeza. Silêncio é uma resposta honesta.
 *
 * @returns {null | {
 *   fase: string, confianca: 'alta'|'média'|'baixa',
 *   justificativa: string, termos: string[],
 *   pontuacao: {fundo:number, meio:number, topo:number},
 *   regra: string|null
 * }}
 */
export const classificar = (texto) => {
    if (!String(texto || '').trim()) return null;

    const achados = {};
    const pontuacao = {};
    for (const f of listarFases()) {
        const termos = [...(f.palavras_chave || []), ...(RADICAIS[f.id] || [])];
        achados[f.id] = distintos(encontrar(texto, termos));
        pontuacao[f.id] = achados[f.id].length;
    }

    const prova = distintos(encontrar(texto, PROVA_SOCIAL));
    if (prova.length) {
        return {
            fase: 'fundo',
            confianca: 'alta',
            termos: prova,
            pontuacao,
            regra: taxonomia.regras_desempate?.[1] || 'Prova social sempre puxa para Fundo.',
            justificativa: `Prova social explícita (${prova.join(', ')}) — pela regra de desempate, isto é fundo de funil mesmo com tom leve.`,
        };
    }

    const ordenadas = Object.entries(pontuacao).sort((a, b) => b[1] - a[1]);
    const [lider, pontosLider] = ordenadas[0];
    const [, pontosSegundo] = ordenadas[1] || [null, 0];

    if (!pontosLider) return null;

    /* Confiança pela margem, não pelo volume: dois sinais de meio contra zero
       é mais conclusivo que cinco de meio contra quatro de topo. */
    let confianca = 'baixa';
    if (pontosLider >= 2 && pontosLider >= pontosSegundo * 2) confianca = 'alta';
    else if (pontosLider > pontosSegundo) confianca = 'média';

    return {
        fase: lider,
        confianca,
        termos: achados[lider],
        pontuacao,
        regra: null,
        justificativa: `${achados[lider].length} sinal(is) de ${nomeFase(lider).toLowerCase()} no texto: ${achados[lider].slice(0, 4).join(', ')}.`,
    };
};

/**
 * Confere a classificação que a pessoa escolheu contra a que o texto sugere.
 * Só fala quando DISCORDA e tem confiança — um aviso a cada conteúdo vira
 * ruído e ninguém lê o que importa.
 */
export const conferir = (faseEscolhida, texto) => {
    const s = classificar(texto);
    if (!s || !faseEscolhida) return null;
    if (s.fase === faseEscolhida) return null;
    if (s.confianca === 'baixa') return null;
    return {
        ...s,
        aviso: `O texto tem mais sinais de ${nomeFase(s.fase).toLowerCase()} do que de ${nomeFase(faseEscolhida).toLowerCase()}.`,
    };
};

/**
 * A posição sugerida na semana para uma fase, segundo o Funil Invertido.
 * Devolve os índices de dia (0 = segunda) que a taxonomia recomenda.
 */
export const DIAS_DA_FASE = { fundo: [0, 1], meio: [2, 3], topo: [4, 5, 6] };

/** O conteúdo está no dia que a estratégia recomenda para a fase dele? */
export const noDiaCerto = (faseId, indiceDoDia) =>
    !DIAS_DA_FASE[faseId] || DIAS_DA_FASE[faseId].includes(indiceDoDia);
