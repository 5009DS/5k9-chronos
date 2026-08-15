import { segundaDa, semanasDoMes, chaveMes, indiceDia, hoje } from './formato.js';
import { listarFases, nomeFase, noDiaCerto, DIAS_DA_FASE } from './diretorio.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CRONOGRAMA — as contas que transformam uma lista de conteúdos em semanas.

   Tudo aqui é derivado. Nenhum conteúdo guarda "semana" nem "posição": guarda
   uma data, e a semana sai dela. Gravar a semana junto criaria duas fontes
   para a mesma verdade, e mover um conteúdo de quinta para sexta passaria a
   exigir que alguém lembrasse de atualizar as duas.

   Os alertas saem do guia estratégico, não de opinião: a regra de volume (3
   por semana, uma por fase) e a posição de cada fase na semana estão escritas
   em Diretórios/01-guia-estrategico.md e em lib/diretorio.js.
   ═══════════════════════════════════════════════════════════════════════════ */

export const porData = (conteudos) =>
    [...(conteudos || [])].sort((a, b) =>
        String(a.data).localeCompare(String(b.data)) ||
        String(a.criado_em || '').localeCompare(String(b.criado_em || '')));

/**
 * Agrupa conteúdos por semana (chave = data da segunda-feira).
 * @returns {Map<string, object[]>}
 */
export const agruparPorSemana = (conteudos) => {
    const mapa = new Map();
    for (const c of porData(conteudos)) {
        const chave = segundaDa(c.data);
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(c);
    }
    return mapa;
};

/**
 * As semanas de um mês, já com os conteúdos de cada uma.
 *
 * Inclui semanas VAZIAS de propósito: uma semana sem nada programado é a
 * informação mais importante que este sistema tem para dar, e ela só aparece
 * se a semana ocupar lugar na tela. Um cronograma que só mostra o que existe
 * esconde exatamente o que falta.
 */
export const mesEmSemanas = (conteudos, mes) => {
    const mapa = agruparPorSemana(conteudos);
    return semanasDoMes(mes).map(segunda => ({
        segunda,
        conteudos: mapa.get(segunda) || [],
    }));
};

/** Quais fases já estão cobertas numa semana. */
export const cobertura = (conteudosDaSemana) => {
    const tem = {};
    for (const f of listarFases()) {
        tem[f.id] = conteudosDaSemana.some(c => c.fase === f.id);
    }
    return tem;
};

/**
 * Alertas de uma semana, na ordem em que importam.
 *
 * Vazio quando está tudo certo — e essa é a intenção. Um painel que sempre
 * tem algo escrito na caixa de aviso ensina a ignorar a caixa de aviso.
 */
export const alertasDaSemana = ({ conteudos }) => {
    const alertas = [];
    if (!conteudos.length) return alertas;

    const cob = cobertura(conteudos);
    const faltando = listarFases().filter(f => !cob[f.id]);
    if (faltando.length && conteudos.length) {
        alertas.push({
            tom: 'atencao',
            texto: `Sem conteúdo de ${faltando.map(f => nomeFase(f.id).toLowerCase()).join(' nem de ')} nesta semana. `
                 + 'A regra de volume do guia é três publicações, uma por fase.',
        });
    }

    /* Posição na semana. O Funil Invertido não é uma preferência de ordem: a
       fase de fundo abre a semana porque segunda e terça é quando a
       disposição para resolver pendência está no pico. Um conteúdo de fundo
       no sábado perde justamente o que faz ele funcionar. */
    for (const c of conteudos) {
        const i = indiceDia(c.data);
        if (c.fase && !noDiaCerto(c.fase, i)) {
            alertas.push({
                tom: 'atencao',
                conteudo: c.id,
                texto: `"${c.titulo}" é ${nomeFase(c.fase).toLowerCase()} e está ${numDia(c.data)}. `
                     + `O guia posiciona essa fase em ${rotuloDias(c.fase)}.`,
            });
        }
    }

    const duplicadas = {};
    for (const c of conteudos) if (c.fase) duplicadas[c.fase] = (duplicadas[c.fase] || 0) + 1;
    for (const [fase, n] of Object.entries(duplicadas)) {
        if (n > 1) alertas.push({
            tom: 'info',
            texto: `${n} conteúdos de ${nomeFase(fase).toLowerCase()} na mesma semana. `
                 + 'Não é erro, mas alguma fase está ficando sem vez.',
        });
    }

    return alertas;
};

const DIAS_NOME = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

/* "está numa sexta" · "está num sábado". Os cinco primeiros dias da semana
   são femininos em português (a segunda-feira), sábado e domingo são
   masculinos — e um alerta que escreve "em uma sábado" perde a autoridade
   que ele precisa ter para alguém mexer no cronograma por causa dele. */
const numDia = (iso) => {
    const i = indiceDia(iso);
    return `${i <= 4 ? 'numa' : 'num'} ${DIAS_NOME[i]}`;
};

const rotuloDias = (faseId) => {
    const dias = (DIAS_DA_FASE[faseId] || []).map(i => DIAS_NOME[i]);
    if (dias.length <= 1) return dias[0] || '—';
    return `${dias.slice(0, -1).join(', ')} ou ${dias[dias.length - 1]}`;
};

/** Meses que têm algum conteúdo, do mais novo para o mais antigo. */
export const mesesComConteudo = (conteudos) =>
    [...new Set((conteudos || []).map(c => chaveMes(c.data)))].sort().reverse();

/** Contagem por status — alimenta os indicadores do painel. */
export const contarPorStatus = (conteudos) => {
    const contagem = {};
    for (const c of conteudos || []) contagem[c.status] = (contagem[c.status] || 0) + 1;
    return contagem;
};

/**
 * O próximo conteúdo a partir de hoje. É o que o cliente quer ver primeiro ao
 * abrir o link — "o que vem agora", não "o que houve em março".
 */
export const proximo = (conteudos) => {
    const h = hoje();
    return porData(conteudos).find(c => c.data >= h) || null;
};

/** Retornos de um conteúdo, do mais recente para o mais antigo. */
export const retornosDe = (retornos, conteudoId) =>
    (retornos || [])
        .filter(r => r.conteudo_id === conteudoId)
        .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
