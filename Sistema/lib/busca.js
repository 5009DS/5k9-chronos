/* ═══════════════════════════════════════════════════════════════════════════
   BUSCA — achar um conteúdo por qualquer pedaço do que foi escrito nele.

   A equipe lembra de um roteiro pela frase que abre ("quem nunca acordou com
   o rosto inchado…"), não pelo título que ele recebeu nem pela semana em que
   caiu. Então a busca lê tudo: título, tema, intenção, nota, etiquetas e o
   texto de cada bloco do roteiro.

   ── COMO CASA ────────────────────────────────────────────────────────────
   Sem acento e sem maiúscula dos dois lados (semAcento), porque "habito" e
   "Hábito" são a mesma lembrança. A consulta é quebrada em palavras e TODAS
   precisam aparecer no conteúdo — não necessariamente juntas, não
   necessariamente no mesmo bloco. Quem lembra de "rosto" e "inchado" acha o
   roteiro mesmo que as duas estejam em falas diferentes.

   ── COMO ORDENA ──────────────────────────────────────────────────────────
   A frase inteira vale mais que palavras soltas, e onde ela aparece conta:
   no título pesa mais; no começo do roteiro (o gancho, a frase inicial) pesa
   quase o mesmo, porque é justamente o jeito como as pessoas lembram. Empate
   vai para o mais recente — é o que mais provavelmente está sendo procurado.
   ═══════════════════════════════════════════════════════════════════════════ */

import { semAcento } from './formato.js';
import { ordenar } from './roteiro.js';

const LIMITE = 40;

/* Normaliza guardando, para cada caractere do resultado, de onde ele veio no
   original. É o que permite destacar o trecho CERTO no texto com acento
   depois de casar no texto sem acento — as duas versões nem sempre têm o
   mesmo comprimento. */
const normalizarComMapa = (texto) => {
    const original = String(texto ?? '');
    let norm = '';
    const mapa = [];
    for (let i = 0; i < original.length; i++) {
        const n = semAcento(original[i]);
        for (let k = 0; k < n.length; k++) { norm += n[k]; mapa.push(i); }
    }
    mapa.push(original.length);
    return { original, norm, mapa };
};

/** Quebra a consulta em palavras normalizadas. */
export const termosDe = (consulta) =>
    semAcento(consulta).split(/\s+/).map(t => t.trim()).filter(Boolean);

/* Os campos de um conteúdo, em ordem de relevância. `peso` multiplica a
   pontuação quando a frase inteira aparece ali. */
const camposDe = (c, blocosDoConteudo) => {
    const campos = [
        { onde: 'Título',   texto: c.titulo,   peso: 10 },
        { onde: 'Tema',     texto: c.tema,     peso: 5 },
        { onde: 'Intenção', texto: c.intencao, peso: 3 },
        { onde: 'Nota',     texto: c.nota,     peso: 2 },
        { onde: 'Etiqueta', texto: (c.etiquetas || []).join(' · '), peso: 2 },
    ];
    ordenar(blocosDoConteudo).forEach((b, i) => {
        // Os primeiros blocos são a "frase inicial" — pesam quase como título.
        const peso = i === 0 ? 8 : i < 3 ? 5 : 3;
        if (b.titulo) campos.push({ onde: 'Roteiro', bloco: b, texto: b.titulo, peso });
        if (b.texto)  campos.push({ onde: 'Roteiro', bloco: b, texto: b.texto,  peso });
    });
    return campos.filter(f => f.texto && String(f.texto).trim());
};

/**
 * Procura a consulta em todos os conteúdos.
 * @returns {Array<{conteudo, pontos, campo, trecho}>} do mais relevante ao menos.
 *   `trecho` é uma lista de { texto, marcado } — quem desenha escapa.
 */
export const buscar = (consulta, { conteudos = [], blocos = [] } = {}) => {
    const termos = termosDe(consulta);
    if (!termos.length) return [];
    const frase = termos.join(' ');

    const blocosPor = new Map();
    for (const b of blocos) {
        if (!blocosPor.has(b.conteudo_id)) blocosPor.set(b.conteudo_id, []);
        blocosPor.get(b.conteudo_id).push(b);
    }

    const resultados = [];
    for (const c of conteudos) {
        const campos = camposDe(c, blocosPor.get(c.id) || [])
            .map(f => ({ ...f, ...normalizarComMapa(f.texto) }));

        // Toda palavra precisa aparecer em ALGUM campo.
        if (!termos.every(t => campos.some(f => f.norm.includes(t)))) continue;

        let pontos = 0;
        let melhor = null;     // { campo, valor }
        for (const f of campos) {
            let valor = 0;
            const iFrase = f.norm.indexOf(frase);
            if (iFrase >= 0) {
                valor = f.peso * 10 + (iFrase === 0 ? f.peso * 5 : 0);
            } else {
                valor = f.peso * termos.filter(t => f.norm.includes(t)).length;
            }
            pontos += valor;
            if (valor && (!melhor || valor > melhor.valor)) melhor = { campo: f, valor };
        }

        resultados.push({
            conteudo: c, pontos, campo: melhor.campo,
            trecho: recortar(melhor.campo, termos, frase),
        });
    }

    return resultados
        .sort((a, b) => b.pontos - a.pontos
            || String(b.conteudo.data || '').localeCompare(String(a.conteudo.data || '')))
        .slice(0, LIMITE);
};

/* Onde, no texto ORIGINAL, cada palavra da consulta aparece. A frase
   inteira, se estiver lá, vira um trecho só; senão cada palavra é marcada
   onde quer que apareça. Faixas que se tocam são fundidas. */
const faixasDe = ({ norm, mapa }, termos, frase) => {
    const agulhas = norm.includes(frase) ? [frase] : termos;
    const faixas = [];
    for (const a of agulhas) {
        for (let i = norm.indexOf(a); i >= 0; i = norm.indexOf(a, i + a.length)) {
            faixas.push([mapa[i], mapa[i + a.length]]);
        }
    }
    faixas.sort((x, y) => x[0] - y[0]);
    const juntas = [];
    for (const f of faixas) {
        const ult = juntas[juntas.length - 1];
        if (ult && f[0] <= ult[1]) ult[1] = Math.max(ult[1], f[1]);
        else juntas.push([...f]);
    }
    return juntas;
};

/* Um pedaço do texto em volta do que casou, para a pessoa reconhecer o
   roteiro sem abrir. Texto curto (título, tema) vai inteiro.
   Devolve pedaços { texto, marcado } — quem desenha escapa. */
const CURTO = 140;
const recortar = (campo, termos, frase) => {
    const { original } = campo;
    const faixas = faixasDe(campo, termos, frase);
    const a = faixas[0]?.[0] ?? 0;

    let ini = 0, fin = original.length;
    if (original.length > CURTO) {
        ini = Math.max(0, a - 40);
        fin = Math.min(original.length, ini + CURTO);
        // Não cortar palavra no meio.
        if (ini > 0) { const sp = original.indexOf(' ', ini); if (sp >= 0 && sp < a) ini = sp + 1; }
        if (fin < original.length) { const sp = original.indexOf(' ', fin); fin = sp < 0 ? original.length : sp; }
    }

    const limpar = (t) => t.replace(/\s+/g, ' ');
    const pedacos = [];
    let cursor = ini;
    for (const [x, y] of faixas) {
        if (y <= ini || x >= fin) continue;
        const xx = Math.max(x, ini), yy = Math.min(y, fin);
        if (xx > cursor) pedacos.push({ texto: limpar(original.slice(cursor, xx)), marcado: false });
        pedacos.push({ texto: limpar(original.slice(xx, yy)), marcado: true });
        cursor = yy;
    }
    if (cursor < fin) pedacos.push({ texto: limpar(original.slice(cursor, fin)), marcado: false });
    if (ini > 0) pedacos.unshift({ texto: '…', marcado: false });
    if (fin < original.length) pedacos.push({ texto: '…', marcado: false });
    return pedacos;
};
