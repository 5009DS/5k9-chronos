/* ═══════════════════════════════════════════════════════════════════════════
   FORMATO — datas, rótulos e escape.

   ── Por que datas são STRING 'AAAA-MM-DD', nunca Date ─────────────────────
   `new Date('2026-08-13')` é interpretado como UTC e, em fuso negativo, volta
   como 12/08 às 21h. Num sistema de cronograma isso é fatal: um conteúdo
   marcado para segunda apareceria no domingo, ou seja, na semana anterior —
   e a semana é a unidade de leitura inteira desta ferramenta. Comparar e
   fatiar texto não tem esse problema.

   Onde um Date é inevitável (somar dias, descobrir o dia da semana), ele é
   construído com `new Date(ano, mes - 1, dia)`, que é LOCAL, e desmontado de
   volta para string antes de sair daqui. Nenhuma outra parte do sistema
   deveria criar Date a partir de string ISO.
   ═══════════════════════════════════════════════════════════════════════════ */

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                             'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* Segunda em primeiro: o Funil Invertido é definido pela POSIÇÃO na semana
   (fundo na segunda, topo no fim de semana), então a semana precisa começar
   onde a estratégia começa. `getDay()` do JavaScript devolve 0 para domingo —
   toda conversão para este índice passa por `indiceDia()` abaixo. */
export const DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

// ── Básicos ─────────────────────────────────────────────────────────────

/** Hoje em 'AAAA-MM-DD', no fuso local. */
export const hoje = () => paraIso(new Date());

/** Date local → 'AAAA-MM-DD'. */
export const paraIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 'AAAA-MM-DD' → Date LOCAL (meia-noite). Uso interno; ver o cabeçalho. */
export const paraData = (iso) => {
    const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(a, (m || 1) - 1, d || 1);
};

/** '2026-08-13' → '2026-08' */
export const chaveMes = (iso) => String(iso || '').slice(0, 7);

/** Mês corrente como '2026-08'. */
export const mesAtual = () => hoje().slice(0, 7);

/** '2026-08-13' → '13/08/2026' */
export const dataBR = (iso) => {
    const p = String(iso || '').slice(0, 10).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—';
};

/** '2026-08-13' → '13 de ago' */
export const diaCurto = (iso) => {
    const [, m, d] = String(iso || '').slice(0, 10).split('-');
    return m ? `${Number(d)} de ${MESES_CURTOS[Number(m) - 1]}` : '—';
};

/** '2026-08' → 'agosto de 2026' */
export const mesExtenso = (chave) => {
    const [ano, mes] = String(chave || '').split('-');
    return mes ? `${MESES[Number(mes) - 1]} de ${ano}` : '—';
};

/** '2026-08' → 'ago/26' */
export const mesCurto = (chave) => {
    const [ano, mes] = String(chave || '').split('-');
    return mes ? `${MESES_CURTOS[Number(mes) - 1]}/${String(ano).slice(2)}` : '—';
};

/** Desloca uma chave de mês. somarMeses('2026-01', -1) → '2025-12' */
export const somarMeses = (chave, delta) => {
    const [ano, mes] = String(chave).split('-').map(Number);
    const d = new Date(ano, mes - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Soma dias a uma data ISO e devolve ISO. */
export const somarDias = (iso, dias) => {
    const d = paraData(iso);
    d.setDate(d.getDate() + dias);
    return paraIso(d);
};

/** Índice do dia com a semana começando na SEGUNDA (0) e terminando no domingo (6). */
export const indiceDia = (iso) => (paraData(iso).getDay() + 6) % 7;

/** 'segunda', 'terça'… */
export const nomeDia = (iso) => DIAS[indiceDia(iso)];
export const nomeDiaCurto = (iso) => DIAS_CURTOS[indiceDia(iso)];

/** Diferença em dias entre hoje e uma data ISO. Negativo = já passou. */
export const diasAte = (iso) => {
    if (!iso) return null;
    return Math.round((paraData(iso) - paraData(hoje())) / 86_400_000);
};

/**
 * Distância em linguagem de gente: 'hoje', 'amanhã', 'em 3 dias', 'há 2 dias'.
 * Serve para o cliente entender o cronograma sem contar no calendário.
 */
export const quandoRelativo = (iso) => {
    const d = diasAte(iso);
    if (d == null) return '—';
    if (d === 0) return 'hoje';
    if (d === 1) return 'amanhã';
    if (d === -1) return 'ontem';
    if (d > 1 && d <= 6) return `em ${d} dias`;
    if (d < -1 && d >= -6) return `há ${Math.abs(d)} dias`;
    if (d > 6 && d <= 13) return 'semana que vem';
    if (d < -6 && d >= -13) return 'semana passada';
    return dataBR(iso);
};

// ── Semana ──────────────────────────────────────────────────────────────
/* A semana é identificada pela DATA DA SEGUNDA, não por número ISO de semana.
   Número de semana é curto de escrever e péssimo de ler: ninguém sabe de cor
   o que é "semana 33", e a virada de ano tem regras (a semana 1 pode começar
   em dezembro) que produzem exatamente um bug por ano — sempre na semana em
   que ninguém está olhando. A segunda-feira é uma data de verdade: ordena
   sozinha, imprime legível e não tem caso especial. */

/** Segunda-feira da semana de uma data. '2026-08-13' → '2026-08-10' */
export const segundaDa = (iso) => somarDias(iso, -indiceDia(iso));

/** Semana da data de hoje. */
export const semanaAtual = () => segundaDa(hoje());

/** As sete datas ISO de uma semana, de segunda a domingo. */
export const diasDaSemana = (segunda) =>
    Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));

/**
 * Rótulo curto de uma semana: '10 – 16 de ago' ou '29 de set – 5 de out'
 * quando ela cruza a virada do mês.
 */
export const semanaCurta = (segunda) => {
    const domingo = somarDias(segunda, 6);
    const [, m1, d1] = segunda.split('-');
    const [, m2, d2] = domingo.split('-');
    const mes1 = MESES_CURTOS[Number(m1) - 1];
    const mes2 = MESES_CURTOS[Number(m2) - 1];
    return m1 === m2
        ? `${Number(d1)} – ${Number(d2)} de ${mes2}`
        : `${Number(d1)} de ${mes1} – ${Number(d2)} de ${mes2}`;
};

/**
 * Semanas que TOCAM um mês, cada uma representada pela segunda-feira.
 *
 * Inclui a semana que começa no mês anterior e termina neste, e vice-versa —
 * senão os conteúdos dos dias 1 e 2 sumiriam da visão mensal quando o mês
 * começa numa quarta. A semana é a unidade da estratégia; recortá-la para
 * caber na grade do mês é o tipo de simplificação que esconde trabalho.
 */
export const semanasDoMes = (chaveMes) => {
    const [ano, mes] = String(chaveMes).split('-').map(Number);
    const ultimo = new Date(ano, mes, 0).getDate();
    const semanas = [];
    let cursor = segundaDa(`${chaveMes}-01`);
    const fim = `${chaveMes}-${String(ultimo).padStart(2, '0')}`;
    while (cursor <= fim) {
        semanas.push(cursor);
        cursor = somarDias(cursor, 7);
    }
    return semanas;
};

/**
 * Minúsculas e sem acento, para COMPARAR — nunca para exibir.
 *
 * Usado onde duas escritas do mesmo texto precisam bater: o classificador
 * procurando "hábito" num texto que diz "habito", e o importador ligando o
 * título de um roteiro ao conteúdo já cadastrado. Sem isso, um acento a mais
 * no PDF quebra a ligação sem deixar rastro de por quê.
 */
export const semAcento = (s) => String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/* ═══════════════════════════════════════════════════════════════════════════
   ENDEREÇO LEGÍVEL

   /conteudo/9cf09abe-3eec-4b0b-bbb3-6e10202d40ef não diz nada a ninguém. O
   mesmo conteúdo em /conteudo/ago/como-saber-se-voce-esta-perdendo-gordura diz
   duas coisas antes de a página abrir: quando sai e do que se trata.

   ── O QUE O MÊS RESOLVE E O QUE ELE NÃO RESOLVE ──────────────────────────
   Ele informa e separa a maior parte dos homônimos — dois "3 erros comuns" em
   meses diferentes viram endereços diferentes. NÃO resolve dois no mesmo mês,
   nem o mesmo mês em anos diferentes, e não é estável: mover a peça de agosto
   para novembro muda o endereço dela.

   Por isso o endereço é uma ETIQUETA, não uma chave. Quem resolve de verdade
   é a busca (ver lib/rotas.js): o id antigo continua abrindo, o apelido de um
   mês antigo continua abrindo, e a barra de endereço se corrige sozinha. O
   preço de um link bonito não pode ser um link que morre.
   ═══════════════════════════════════════════════════════════════════════════ */
const MAX_APELIDO = 80;

/** Texto virado endereço: sem acento, sem maiúscula, o resto vira hífen. */
export const apelidoDeTexto = (texto) => (semAcento(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_APELIDO)
    .replace(/-+$/, '')) || 'sem-titulo';

/** A abreviação do mês de uma data ISO: "2026-08-27" vira "ago".
    Não confundir com mesCurto(), que recebe CHAVE de mês e devolve "ago/26". */
export const abrevMes = (iso) => MESES_CURTOS[Number(String(iso || '').slice(5, 7)) - 1] || '';

/** O apelido completo de um conteúdo: "ago/como-saber-se-voce-esta...". */
export const apelidoDeConteudo = (c) =>
    `${abrevMes(c?.data)}/${apelidoDeTexto(c?.titulo)}`;

/** Escapa texto vindo do usuário antes de entrar em template de HTML. */
export const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Texto de roteiro para HTML: escapa e preserva as quebras de linha.
 * Um bloco de fala escrito em três linhas precisa CHEGAR em três linhas —
 * é assim que quem grava lê.
 */
export const escLinhas = (texto) => esc(texto).replace(/\n/g, '<br>');

/** Duração em segundos → '1min 20s' | '45s'. */
export const duracao = (segundos) => {
    const s = Math.max(0, Math.round(Number(segundos) || 0));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}min ${r}s` : `${m}min`;
};

/**
 * Estimativa de tempo de fala a partir do texto.
 *
 * 150 palavras por minuto é a média de locução em português para vídeo curto
 * — mais lento que conversa (~180) porque roteiro gravado tem pausa. É
 * ESTIMATIVA e a interface diz isso: serve para perceber que um bloco está
 * longo demais, não para cronometrar a gravação.
 */
export const PALAVRAS_POR_MINUTO = 150;
export const segundosDeFala = (texto) => {
    const palavras = String(texto || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.round((palavras / PALAVRAS_POR_MINUTO) * 60);
};

export const numero = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);

/** Percentual inteiro, protegido contra divisão por zero. */
export const pct = (parte, todo) => (todo ? Math.round((parte / todo) * 100) : 0);
