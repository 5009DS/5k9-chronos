/* ═══════════════════════════════════════════════════════════════════════════
   PDF → TEXTO, dentro do navegador.

   ── POR QUE ESCREVER ISTO EM VEZ DE USAR O PDF.JS ─────────────────────────
   O pdf.js resolve o caso geral e pesa ~1MB. Este sistema não tem passo de
   build: uma biblioteca dessas viria de CDN, e a regra da casa sobre CDN já
   custou caro uma vez (o unpkg caiu em teste e o 5K9 Forms passou a servir o
   Lucide de cópia local). Aqui o problema é menor que o caso geral: os PDFs
   são feitos pela social mídia no Google Docs, no Word ou no Canva, têm camada
   de texto e não precisam ser desenhados — só lidos.

   ── O CAMINHO ─────────────────────────────────────────────────────────────
     1. indexa os objetos indiretos do arquivo;
     2. acha as páginas e, de cada uma, os recursos e as fontes;
     3. lê o ToUnicode DE CADA FONTE separadamente;
     4. percorre o conteúdo da página trocando de tabela a cada `Tf`,
        acompanhando a posição e quebrando linha quando o Y muda.

   ── POR QUE UMA TABELA POR FONTE, E NÃO UMA SÓ ────────────────────────────
   A primeira versão juntava todos os ToUnicode num mapa só. Funcionou no
   documento de teste e explodiu no seguinte: um PDF do Canva com SETE fontes
   Type3, todas chamadas `/F1`, cada uma com sua tabela. Códigos iguais com
   significados diferentes se sobrescreveram e o documento inteiro saiu
   ilegível — não com erro, com texto embaralhado, que é pior.

   Resolver isso exigiu percorrer a árvore de objetos (página → /Resources →
   /Font → /ToUnicode). É o pedaço mais chato deste arquivo e o que o torna
   confiável.

   ── O QUE ELE NÃO FAZ, E A INTERFACE DIZ ISSO ─────────────────────────────
   PDF escaneado (imagem, sem camada de texto) sai vazio — não há OCR aqui.
   Objeto dentro de /ObjStm não é lido. E há PDFs cuja própria tabela ToUnicode
   está errada: o do Canva decodifica o corpo do texto perfeitamente e erra
   letras dos títulos de display, porque o gerador não mapeou aqueles glifos
   direito. Nenhum leitor conserta isso — o dado não está no arquivo. Por isso
   a tela de importação SEMPRE oferece colar o texto à mão e mostra o que
   extraiu antes de gravar qualquer coisa.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Descomprime um trecho zlib/deflate. Devolve null quando não é nenhum dos dois. */
const inflar = async (bytes) => {
    for (const formato of ['deflate', 'deflate-raw']) {
        try {
            const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(formato));
            return new Uint8Array(await new Response(fluxo).arrayBuffer());
        } catch { /* tenta o próximo */ }
    }
    return null;
};

/* latin1 e não utf-8: o conteúdo do arquivo é uma mistura de sintaxe ASCII com
   bytes de código de glifo que não formam UTF-8 válido. Decodificar como utf-8
   substituiria esses bytes por U+FFFD e destruiria justamente os códigos que a
   tabela ToUnicode precisa traduzir. */
const texto1 = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    return s;
};

// ═══════════════════════════════════════════════════════════════════════════
// Índice de objetos
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapa número → { dict, ini, fim } de todo objeto indireto do arquivo.
 *
 * Varredura por texto, sem ler a tabela xref. A xref seria o caminho oficial,
 * mas ela quebra em arquivo com atualização incremental, com xref stream ou
 * com byte offset errado — os três comuns em exportador de design. Varrer é
 * mais lento e não erra: o que está escrito `12 0 obj` é o objeto 12.
 */
const indexar = (bruto, bytes) => {
    const idx = new Map();
    const re = /(?:^|[^0-9])(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(bruto))) {
        const ini = m.index + m[0].indexOf(m[1]);
        const fimObj = bruto.indexOf('endobj', ini);
        const s = bruto.indexOf('stream', ini);
        const temStream = s > 0 && (fimObj < 0 || s < fimObj);

        let sIni = -1, sFim = -1;
        if (temStream) {
            sIni = s + 6;
            if (bytes[sIni] === 0x0d) sIni++;
            if (bytes[sIni] === 0x0a) sIni++;
            sFim = bruto.indexOf('endstream', sIni);
            /* A quebra de linha antes de "endstream" é do arquivo, não do dado
               comprimido. O zlib de linha de comando ignora sobra no fim; o
               DecompressionStream do navegador NÃO — falha o fluxo inteiro por
               causa de um \n, e o resultado é um PDF que "não tem texto". */
            while (sFim > sIni && (bytes[sFim - 1] === 0x0a || bytes[sFim - 1] === 0x0d)) sFim--;
        }

        idx.set(Number(m[1]), {
            dict: bruto.slice(ini, temStream ? s : (fimObj < 0 ? ini + 4000 : fimObj)),
            sIni, sFim,
        });
    }
    return idx;
};

const conteudoDe = async (idx, num, bytes) => {
    const o = idx.get(num);
    if (!o || o.sIni < 0) return null;
    const dados = await inflar(bytes.subarray(o.sIni, o.sFim));
    return dados ? texto1(dados) : null;
};

/** Trecho do dicionário logo depois de uma chave. Suficiente para ler ref e sub-dicionário. */
const valorDe = (dict, chave) => {
    const i = dict.indexOf(chave);
    return i < 0 ? '' : dict.slice(i + chave.length, i + chave.length + 600);
};

const REF = /^\s*(\d+)\s+\d+\s+R/;

/** Segue uma referência indireta, se o valor for uma. Senão devolve o próprio texto. */
const talvezSeguir = (idx, texto) => {
    const r = texto.match(REF);
    return r ? (idx.get(Number(r[1]))?.dict || '') : texto;
};

// ═══════════════════════════════════════════════════════════════════════════
// ToUnicode
// ═══════════════════════════════════════════════════════════════════════════

const paraUnicode = (hex) => {
    let s = '';
    for (let k = 0; k + 4 <= hex.length; k += 4) s += String.fromCharCode(parseInt(hex.substr(k, 4), 16));
    return s;
};

const lerCMap = (txt) => {
    const mapa = new Map();
    if (!txt) return mapa;

    let m;
    const rc = /beginbfchar([\s\S]*?)endbfchar/g;
    while ((m = rc.exec(txt))) {
        const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        let p;
        while ((p = re.exec(m[1]))) mapa.set(parseInt(p[1], 16), paraUnicode(p[2]));
    }

    const rr = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = rr.exec(txt))) {
        const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
        let p;
        while ((p = re.exec(m[1]))) {
            const a = parseInt(p[1], 16), b = parseInt(p[2], 16), base = parseInt(p[3], 16);
            // Teto de 5000: um intervalo corrompido pode declarar milhões de
            // códigos e travar a aba antes de qualquer erro aparecer.
            for (let c = a; c <= b && c - a < 5000; c++) mapa.set(c, String.fromCharCode(base + (c - a)));
        }
    }
    return mapa;
};

// ═══════════════════════════════════════════════════════════════════════════
// Conteúdo da página
// ═══════════════════════════════════════════════════════════════════════════

/* Um regex só, varrido em ordem, cobrindo tudo que muda posição, troca de
   fonte ou escreve:
     Td/TD  deslocamento relativo
     Tm     matriz absoluta (o e/f interessam)
     cm     transformação do espaço — o Google Docs põe cada linha num
            `q … cm … BT … ET … Q`, e sem ler o cm todas as linhas relatam o
            mesmo Y e o documento sai numa linha só
     Tf     troca de fonte, e portanto de tabela de decodificação
     q/Q    pilha da transformação
     ( ) < >  as strings */
const OPERADORES = new RegExp([
    '(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+(?:Td|TD)',
    '(?:(-?[\\d.]+)\\s+){4}(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+Tm',
    '(?:(-?[\\d.]+)\\s+){4}(-?[\\d.]+)\\s+(-?[\\d.]+)\\s+cm',
    '/([^\\s/<>\\[\\]()]+)\\s+[\\d.]+\\s+Tf',
    '\\((?:\\\\.|[^\\\\()])*\\)',
    '<[0-9A-Fa-f\\s]+>',
    '\\b(BT|ET|T\\*|q|Q)\\b',
].join('|'), 'g');

const decodificarString = (t, mapa) => {
    const traduz = (cods) => cods
        .map(c => (mapa && mapa.has(c) ? mapa.get(c) : String.fromCharCode(c)))
        .join('');

    if (t[0] === '(') {
        const cru = t.slice(1, -1)
            .replace(/\\([()\\])/g, '$1')
            .replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, ' ')
            .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        return traduz([...cru].map(c => c.charCodeAt(0)));
    }
    const hex = t.slice(1, -1).replace(/\s/g, '');
    const cods = [];
    for (let k = 0; k + 4 <= hex.length; k += 4) cods.push(parseInt(hex.substr(k, 4), 16));
    return traduz(cods);
};

/**
 * Extrai as linhas de um stream de conteúdo.
 * @param {string} st       o stream já descomprimido
 * @param {Object} mapas    nome da fonte → tabela ToUnicode
 * @param {Map|null} padrao tabela usada antes do primeiro Tf
 */
const extrairDoStream = (st, mapas, padrao) => {
    const linhas = [];
    let m;
    let tx = 0, ty = 0;          // posição do texto (Td/Tm)
    let cx = 0, cy = 0;          // translação do espaço (cm)
    const pilha = [];
    let mapa = padrao;
    let linhaY = null, atual = '';

    const soltar = () => {
        if (atual.trim()) linhas.push(atual.replace(/\s+$/, ''));
        atual = '';
    };

    OPERADORES.lastIndex = 0;
    while ((m = OPERADORES.exec(st))) {
        const t = m[0];

        if (m[1] !== undefined) {                              // Td / TD
            tx += Number(m[1]); ty += Number(m[2]);
        } else if (m[4] !== undefined && /Tm$/.test(t)) {      // Tm
            tx = Number(m[4]); ty = Number(m[5]);
        } else if (m[7] !== undefined && /cm$/.test(t)) {      // cm
            // Só a translação. Escala e rotação mudariam a ordem de leitura, e
            // nenhum editor de texto comum gera página rotacionada.
            cx += Number(m[7]); cy += Number(m[8]);
        } else if (m[9] !== undefined) {                       // Tf
            if (mapas[m[9]]) mapa = mapas[m[9]];
        } else if (m[10]) {
            if (m[10] === 'q') pilha.push([cx, cy]);
            else if (m[10] === 'Q') { const p = pilha.pop(); if (p) { cx = p[0]; cy = p[1]; } }
            else if (m[10] === 'BT') { tx = 0; ty = 0; }
            else if (m[10] === 'T*') { ty -= 12; }
        } else if (t[0] === '(' || t[0] === '<') {
            const pedaco = decodificarString(t, mapa);
            if (!pedaco) continue;
            const y = cy + ty;
            // 2 unidades de tolerância: sobrescrito e acento deslocam a linha
            // de base em menos que isso e não devem quebrar a linha.
            if (linhaY === null) linhaY = y;
            else if (Math.abs(y - linhaY) > 2) { soltar(); linhaY = y; }
            atual += pedaco;
        }
    }
    soltar();
    return linhas;
};

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Texto de um PDF, uma linha por linha visual.
 *
 * NÃO insere espaços por distância entre glifos. A tentação é grande — há PDF
 * que posiciona cada letra com seu próprio Td, o que parece pedir uma
 * heurística de "vão grande = espaço". Mas os espaços de verdade VÊM como
 * caractere no fluxo, e a heurística só acrescentava um espaço entre cada par
 * de letras: "P e n s a n d o". Confiar no que o arquivo diz é mais simples e
 * mais correto que adivinhar a partir de coordenadas.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export const textoDoPDF = async (buffer) => {
    const bytes = new Uint8Array(buffer);
    const bruto = texto1(bytes);
    const idx = indexar(bruto, bytes);

    const paginas = [...idx.keys()]
        .filter(n => {
            const d = idx.get(n).dict;
            return /\/Type\s*\/Page\b/.test(d) && !/\/Type\s*\/Pages\b/.test(d);
        })
        // Ordem por número do objeto. Seguir /Kids seria o certo, mas exige
        // percorrer a árvore de páginas — e todo exportador que já vimos grava
        // as páginas em ordem crescente.
        .sort((a, b) => a - b);

    const linhas = paginas.length
        ? await porPagina(idx, bytes, paginas)
        : await varreduraCega(idx, bytes);

    return limpar(linhas);
};

/** Caminho bom: página por página, cada uma com as fontes dela. */
const porPagina = async (idx, bytes, paginas) => {
    const cacheFonte = new Map();
    const linhas = [];

    for (const p of paginas) {
        const dict = idx.get(p).dict;

        const recursos = talvezSeguir(idx, valorDe(dict, '/Resources'));
        const fontes = talvezSeguir(idx, valorDe(recursos, '/Font'));

        const mapas = {};
        const rf = /\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g;
        let m;
        while ((m = rf.exec(fontes))) {
            const objFonte = Number(m[2]);
            if (!cacheFonte.has(objFonte)) {
                const ref = (idx.get(objFonte)?.dict || '').match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
                cacheFonte.set(objFonte, ref ? lerCMap(await conteudoDe(idx, Number(ref[1]), bytes)) : null);
            }
            const mapa = cacheFonte.get(objFonte);
            if (mapa) mapas[m[1]] = mapa;
        }

        /* Antes do primeiro Tf o stream ainda não declarou fonte. Usar a
           primeira da página é melhor que não decodificar nada — e, na
           esmagadora maioria, a página tem uma fonte só. */
        const padrao = Object.values(mapas)[0] || null;

        const conteudos = valorDe(dict, '/Contents');
        const refs = [...conteudos.matchAll(/(\d+)\s+\d+\s+R/g)].map(x => Number(x[1]));
        for (const cn of refs) {
            const st = await conteudoDe(idx, cn, bytes);
            if (st && /T[jJ]/.test(st)) linhas.push(...extrairDoStream(st, mapas, padrao));
        }
    }
    return linhas;
};

/**
 * Caminho de reserva: nenhuma página reconhecida (objetos em /ObjStm, arquivo
 * atípico). Varre todos os streams e junta os ToUnicode num mapa só.
 *
 * É exatamente o que a primeira versão fazia, com o defeito conhecido de
 * embaralhar documento com várias fontes. Fica como rede: texto embaralhado é
 * ruim, tela vazia sem explicação é pior — e a conferência mostra o estrago
 * antes de qualquer coisa ser gravada.
 */
const varreduraCega = async (idx, bytes) => {
    const streams = [];
    for (const [, o] of idx) {
        if (o.sIni < 0) continue;
        const d = await inflar(bytes.subarray(o.sIni, o.sFim));
        if (d) streams.push(texto1(d));
    }
    const mapa = new Map();
    for (const st of streams) {
        if (!/beginbfchar|beginbfrange/.test(st)) continue;
        for (const [k, v] of lerCMap(st)) mapa.set(k, v);
    }
    const linhas = [];
    for (const st of streams) {
        if (/T[jJ]/.test(st)) linhas.push(...extrairDoStream(st, {}, mapa));
    }
    return linhas;
};

const limpar = (linhas) => {
    const limpas = linhas
        .join('\n')
        .replace(/ /g, ' ')                    // espaço fixo → espaço comum
        .replace(/[​‌‍﻿]/g, '') // largura zero e BOM: o Google Docs
                                                    // enfia um depois de cada marcador de
                                                    // lista, e eles sujam toda comparação
        .replace(/[ \t]{2,}/g, ' ')
        .split('\n')
        .map(l => l.trim());

    return juntarMarcadores(limpas)
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/* Um marcador de lista sozinho numa linha é ARTEFATO, não estrutura: o Google
   Docs desenha "1." num objeto de texto próprio, com posição própria, e o texto
   do item em outro. Sem juntar os dois, o documento chega ao parser como uma
   linha "12." seguida de outra com o tema — e a numeração, quando existe, é o
   sinal mais confiável de "aqui começa um item".

   A junção acontece aqui, na leitura do PDF, e não no parser, porque é um
   defeito DESTE meio: quem cola o texto à mão nunca vê esse problema. */
const SO_MARCADOR = /^(\d{1,3}[.)]|[●○•◦▪–—-]|[a-z][.)])$/i;

const juntarMarcadores = (linhas) => {
    const saida = [];
    for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l) { saida.push(''); continue; }
        if (SO_MARCADOR.test(l)) {
            let j = i + 1;
            while (j < linhas.length && !linhas[j]) j++;
            if (j < linhas.length) {
                saida.push(`${l} ${linhas[j]}`);
                i = j;
                continue;
            }
        }
        saida.push(l);
    }
    return saida;
};

/** O arquivo parece mesmo um PDF? Checa a assinatura, não a extensão. */
export const ehPDF = (buffer) => {
    const b = new Uint8Array(buffer.slice(0, 5));
    return b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;   // %PDF
};
