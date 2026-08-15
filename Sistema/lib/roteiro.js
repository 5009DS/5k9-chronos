import { segundosDeFala, duracao, esc } from './formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   ROTEIRO — o modelo de blocos.

   O pedido era liberdade de recorte: separar por fala, por seção, por frase
   curta ou por bloco livre. A saída não foi criar quatro editores, e sim UM
   modelo em que cada pedaço declara o próprio tipo.

   Um roteiro é uma lista ordenada de blocos. Cada bloco tem tipo, título
   opcional e texto. Quem escreve decide o recorte enquanto escreve, e pode
   misturar: uma seção "Abertura" contendo duas falas e uma frase de impacto,
   depois um bloco livre de orientação técnica. Nada obriga a uniformidade.

   ── POR QUE UMA LISTA PLANA E NÃO UMA ÁRVORE ──────────────────────────────
   Seria natural aninhar falas dentro de seções. Mas árvore em interface de
   celular é arrastar item entre níveis com o dedo — a operação mais difícil
   que existe em toque. Aqui a seção é um MARCADOR na mesma lista: tudo que
   vem depois dela pertence a ela, até a próxima. Reordenar é mover um item
   numa lista só, o agrupamento é derivado (ver `agruparPorSecao`), e o
   modelo continua honesto sobre o que a interface consegue editar.

   ── O QUE É FALADO E O QUE NÃO É ──────────────────────────────────────────
   `falado` separa o que sai pela boca (fala, frase, gancho, cta) do que é
   instrução de gravação (seção, nota). É o que permite estimar a duração sem
   contar as anotações de bastidor — um roteiro de 40 segundos não pode
   aparecer como 2 minutos porque alguém escreveu três orientações de câmera.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TIPOS = [
    {
        id: 'gancho',
        nome: 'Gancho',
        icone: 'zap',
        falado: true,
        descricao: 'Os primeiros segundos. É o que decide se alguém continua assistindo.',
        placeholder: 'A frase que abre o vídeo…',
    },
    {
        id: 'fala',
        nome: 'Fala',
        icone: 'message-square',
        falado: true,
        descricao: 'Um trecho contínuo do que é dito. O recorte padrão de quem grava lendo.',
        placeholder: 'O que é falado neste trecho…',
    },
    {
        id: 'frase',
        nome: 'Frase curta',
        icone: 'minus',
        falado: true,
        descricao: 'Uma linha só, para ser dita ou aparecer na tela. Serve para corte seco e legenda.',
        placeholder: 'Uma frase, uma ideia.',
    },
    {
        id: 'secao',
        nome: 'Seção',
        icone: 'folder',
        falado: false,
        descricao: 'Divide o roteiro em partes. Tudo que vem depois pertence a ela, até a próxima.',
        placeholder: 'Abertura, desenvolvimento, fechamento…',
    },
    {
        id: 'bloco',
        nome: 'Bloco livre',
        icone: 'square',
        falado: true,
        descricao: 'Título e texto, sem regra de formato. Para o que não cabe nos outros.',
        placeholder: 'Conteúdo do bloco…',
    },
    {
        id: 'cta',
        nome: 'Chamada para ação',
        icone: 'megaphone',
        falado: true,
        descricao: 'O pedido final. Um por roteiro — dois pedidos e ninguém faz nenhum.',
        placeholder: 'Agende sua avaliação pelo link na bio.',
    },
    {
        id: 'nota',
        nome: 'Orientação',
        icone: 'clapperboard',
        falado: false,
        descricao: 'Instrução de gravação: enquadramento, corte, trilha. Não é falado.',
        placeholder: 'Close na mão, corte seco aqui…',
    },
];

export const tipo = (id) => TIPOS.find(t => t.id === id) || TIPOS[1];

/** Blocos de um roteiro, na ordem. Ordem empatada cai para a de criação. */
export const ordenar = (blocos) =>
    [...(blocos || [])].sort((a, b) =>
        (a.ordem ?? 0) - (b.ordem ?? 0) ||
        String(a.criado_em || '').localeCompare(String(b.criado_em || '')));

/** Próximo valor de ordem — sempre no fim, com folga para reordenar. */
export const proximaOrdem = (blocos) =>
    (blocos || []).reduce((m, b) => Math.max(m, b.ordem ?? 0), 0) + 10;

/**
 * Reatribui a ordem em passos de 10 depois de mover um item.
 *
 * Renumerar tudo em vez de calcular um valor intermediário é de propósito: a
 * lista é curta (dezenas de blocos, nunca milhares) e ordem fracionária
 * acumula casas decimais até dois blocos empatarem em silêncio, que é o bug
 * que faz um roteiro trocar de sequência sozinho entre uma visita e outra.
 */
export const renumerar = (blocos) =>
    blocos.map((b, i) => ({ ...b, ordem: (i + 1) * 10 }));

/** Move um bloco uma posição para cima ou para baixo. Devolve a lista nova. */
export const mover = (blocos, id, direcao) => {
    const lista = ordenar(blocos);
    const i = lista.findIndex(b => b.id === id);
    const j = i + (direcao === 'cima' ? -1 : 1);
    if (i < 0 || j < 0 || j >= lista.length) return null;   // já está na ponta
    [lista[i], lista[j]] = [lista[j], lista[i]];
    return renumerar(lista);
};

/** Só o que é falado, para contas de duração e de palavras. */
const falados = (blocos) => ordenar(blocos).filter(b => tipo(b.tipo).falado);

export const contarPalavras = (blocos) =>
    falados(blocos).reduce((t, b) =>
        t + String(b.texto || '').trim().split(/\s+/).filter(Boolean).length, 0);

/** Estimativa de duração do roteiro inteiro, em segundos. */
export const segundosTotais = (blocos) =>
    falados(blocos).reduce((t, b) => t + segundosDeFala(b.texto), 0);

export const duracaoTotal = (blocos) => duracao(segundosTotais(blocos));

/**
 * Agrupa os blocos pelas seções declaradas.
 *
 * O que aparece antes da primeira seção não é descartado nem forçado para
 * dentro dela: vira um grupo sem título. Roteiro curto costuma não ter seção
 * nenhuma, e esse é o caso comum — não a exceção.
 *
 * @returns {{secao: object|null, blocos: object[]}[]}
 */
export const agruparPorSecao = (blocos) => {
    const grupos = [];
    let atual = { secao: null, blocos: [] };
    for (const b of ordenar(blocos)) {
        if (b.tipo === 'secao') {
            if (atual.secao || atual.blocos.length) grupos.push(atual);
            atual = { secao: b, blocos: [] };
        } else {
            atual.blocos.push(b);
        }
    }
    if (atual.secao || atual.blocos.length) grupos.push(atual);
    return grupos;
};

/**
 * O roteiro como texto corrido, para copiar ou imprimir.
 *
 * Existe porque quem grava muitas vezes não grava lendo a tela do sistema:
 * cola no teleprompter, manda no WhatsApp, imprime. Sem uma saída em texto, a
 * pessoa copia bloco por bloco e perde a ordem no caminho.
 */
export const paraTexto = (conteudo, blocos) => {
    const linhas = [];
    if (conteudo?.titulo) linhas.push(conteudo.titulo.toUpperCase(), '');
    for (const b of ordenar(blocos)) {
        const t = tipo(b.tipo);
        if (b.tipo === 'secao') {
            linhas.push('', `── ${(b.titulo || 'Seção').toUpperCase()} ──`, '');
            continue;
        }
        if (b.tipo === 'nota') {
            linhas.push(`[${b.texto || b.titulo || 'orientação'}]`, '');
            continue;
        }
        if (b.titulo) linhas.push(`${b.titulo} (${t.nome.toLowerCase()})`);
        if (b.texto)  linhas.push(b.texto);
        linhas.push('');
    }
    return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * Um bloco vazio do tipo pedido, pronto para entrar na lista.
 * `criado_em` sai daqui, e não do banco, para o desempate de ordem funcionar
 * antes mesmo de a linha ser gravada.
 */
export const blocoNovo = (conteudoId, tipoId, blocos) => ({
    id: crypto.randomUUID(),
    conteudo_id: conteudoId,
    tipo: tipoId,
    titulo: null,
    texto: '',
    ordem: proximaOrdem(blocos),
    criado_em: new Date().toISOString(),
});

/**
 * Aviso de estrutura — a única coisa que o roteiro "avalia" sozinho.
 *
 * São regras que saem direto do guia estratégico, não opinião: um conteúdo
 * sem gancho perde a retenção nos primeiros segundos; dois CTAs disputam a
 * ação; um bloco de fala muito longo é o que faz alguém travar na gravação.
 * Silencioso quando está tudo bem.
 */
export const avisosDeEstrutura = (blocos) => {
    const lista = ordenar(blocos);
    const avisos = [];
    if (!lista.length) return avisos;

    const ctas = lista.filter(b => b.tipo === 'cta');
    if (ctas.length > 1) {
        avisos.push('Há mais de uma chamada para ação. Quem escolhe entre dois pedidos não faz nenhum.');
    }
    if (!lista.some(b => b.tipo === 'gancho')) {
        avisos.push('Não há gancho marcado. Os três primeiros segundos são o que decide a retenção.');
    }
    const longo = lista.find(b => tipo(b.tipo).falado && segundosDeFala(b.texto) > 45);
    if (longo) {
        avisos.push(`Um bloco passa de 45 segundos de fala (${duracao(segundosDeFala(longo.texto))}). Vale quebrar em dois.`);
    }
    return avisos;
};

/** Prévia curta do roteiro para a lista de conteúdos. */
export const previa = (blocos, limite = 120) => {
    const primeiro = falados(blocos)[0];
    const texto = String(primeiro?.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) return '';
    return esc(texto.length > limite ? `${texto.slice(0, limite).trimEnd()}…` : texto);
};
