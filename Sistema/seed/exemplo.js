import { store } from '../store.js';
import { semanaAtual, somarDias } from '../lib/formato.js';

/* ═══════════════════════════════════════════════════════════════════════════
   DADOS DE EXEMPLO

   Existem para responder à pergunta que todo cronograma vazio faz ao ser
   aberto: "isso aqui funciona?". Um mês em branco não mostra a fita de
   cobertura das três fases, não mostra o alerta de conteúdo no dia errado,
   não mostra a leitura de um par em conflito — que são justamente as coisas
   que esta ferramenta faz e as outras não.

   Por isso o exemplo é DESENHADO, não aleatório. Ele contém, de propósito:

     · uma semana completa e certinha (três fases, cada uma no seu dia);
     · uma semana com uma fase faltando, para o alerta de volume aparecer;
     · um conteúdo de fundo marcado num sábado, para o alerta de posição;
     · um par em conflito (topo + prova social), para a leitura vermelha;
     · um conteúdo com pedido de ajuste já registrado, para a fila do painel;
     · um roteiro escrito com todos os tipos de bloco.

   Tudo fictício, e datado a partir da SEMANA CORRENTE — assim funciona em
   qualquer época do ano. Nunca é chamado sozinho: só pelo botão em
   Configurações.
   ═══════════════════════════════════════════════════════════════════════════ */

const PREFIXO = 'ex-';

/* Datas relativas à segunda-feira desta semana. `sem` é o deslocamento em
   semanas (-1 passada, 0 atual, +1 próxima) e `dia` é o índice a partir da
   segunda (0 seg … 6 dom). */
const data = (sem, dia) => somarDias(semanaAtual(), sem * 7 + dia);

const CLIENTE = {
    id: 'ex-cli-1',
    nome: 'Instituto Dr. Tigre',
    empresa: 'Instituto Dr. Tigre — Medicina Esportiva',
    token: 'exemplo5k9',
    contato: 'Dra. Helena (marketing)',
    cor: '#A855FF',
    proposito: 'Posicionar a equipe como a maior autoridade regional em dor e recuperação '
             + 'muscular, e transformar essa autoridade em agenda cheia.',
    ativo: true,
    nota: 'Cliente de exemplo. Aprova rápido, prefere áudio no WhatsApp.',
};

/* [id, título, tema, fase, objetivo, formato, semana, dia, status, intenção] */
const CONTEUDOS = [
    // ── Semana passada: completa e no lugar certo ───────────────────────
    ['ex-c1', 'Depoimento da Ana: três meses de acompanhamento',
     'A paciente conta como era a rotina antes e o que mudou depois do protocolo.',
     'fundo', 'prova-social', 'Reels', -1, 0, 'publicado',
     'Fazer quem está em dúvida se reconhecer na história da Ana.'],

    ['ex-c2', 'Por que a dor no joelho volta depois da fisioterapia',
     'A causa mecânica que a maioria dos tratamentos não resolve.',
     'meio', 'autoridade', 'Reels', -1, 2, 'publicado',
     'Mostrar que a equipe enxerga a causa, não só o sintoma.'],

    ['ex-c3', 'Mito ou verdade: alongar antes de correr previne lesão',
     'Dica rápida sobre aquecimento, sem citar tratamento.',
     'topo', 'educacao', 'Carrossel', -1, 4, 'publicado', null],

    // ── Esta semana: uma pendente e uma com ajuste pedido ───────────────
    ['ex-c4', 'Últimas vagas para a avaliação funcional de sábado',
     'Mutirão de avaliação com agenda limitada.',
     'fundo', 'conversao', 'Story', 0, 0, 'ajuste',
     'Encher as 12 vagas do sábado.'],

    ['ex-c5', 'Bastidores: como montamos um plano de recuperação',
     'O passo a passo do diagnóstico até a alta, mostrado por dentro.',
     'meio', 'autoridade', 'Reels', 0, 3, 'em_revisao',
     'Demonstrar método. Quem vê precisa entender que existe um processo, não um chute.'],

    /* Sábado com conteúdo de FUNDO: dispara o alerta de posição na semana.
       Está aqui de propósito — é a única forma de ver o aviso funcionando
       sem ter que errar de verdade. */
    ['ex-c6', 'Garanta sua vaga na turma de reabilitação',
     'Chamada para a turma que começa no próximo mês.',
     'fundo', 'conversao', 'Story', 0, 5, 'em_revisao',
     'Fechar as inscrições da turma.'],

    // ── Próxima semana: falta o meio, e há um par em conflito ───────────
    ['ex-c7', 'Resultado real: o antes e depois do João',
     'Caso de recuperação de lesão em atleta amador.',
     'topo', 'prova-social', 'Reels', 1, 4, 'rascunho',
     'Alcance com prova social.'],

    ['ex-c8', 'Chegou o novo equipamento de avaliação de marcha',
     'Anúncio da chegada do equipamento e o que ele muda no diagnóstico.',
     'fundo', 'institucional', 'Carrossel', 1, 1, 'rascunho',
     'Comunicar o investimento e trazer gente para conhecer.'],
];

/* Roteiro completo do 'ex-c5' — usa todos os tipos de bloco, porque é a
   forma de mostrar que o recorte é livre: seção, gancho, fala, frase curta,
   orientação de gravação e chamada para ação convivendo no mesmo roteiro. */
const BLOCOS = [
    ['ex-b1',  'ex-c5', 'secao',  'Abertura', null],
    ['ex-b2',  'ex-c5', 'gancho', null,
     'Todo mundo acha que fisioterapia é repetir exercício. Não é. Deixa eu te mostrar o que a gente faz antes disso.'],
    ['ex-b3',  'ex-c5', 'nota', null, 'Câmera na mão, andando pelo corredor da clínica. Corte seco no fim da frase.'],

    ['ex-b4',  'ex-c5', 'secao',  'O processo', null],
    ['ex-b5',  'ex-c5', 'fala', null,
     'A primeira coisa que a gente faz não é tratar. É medir.\n'
     + 'Avaliação de marcha, força e amplitude — os três antes de qualquer exercício. '
     + 'Sem isso, você está tratando o lugar que dói, e não o lugar que causou.'],
    ['ex-b6',  'ex-c5', 'frase', null, 'O lugar que dói quase nunca é o lugar do problema.'],
    ['ex-b7',  'ex-c5', 'fala', null,
     'Com os três números na mão, o plano deixa de ser um pacote de sessões e vira uma sequência: '
     + 'o que precisa soltar, o que precisa fortalecer e em que ordem.'],
    ['ex-b8',  'ex-c5', 'nota', null, 'Inserir a tela do software de avaliação aqui, sem dado de paciente.'],

    ['ex-b9',  'ex-c5', 'secao',  'Fechamento', null],
    ['ex-b10', 'ex-c5', 'bloco',  'O limite',
     'E tem caso em que a gente não trata: quando a avaliação aponta para algo fora da nossa área, '
     + 'o encaminhamento é parte do trabalho.'],
    ['ex-b11', 'ex-c5', 'cta', null, 'Comenta aqui a sua dúvida sobre a avaliação — respondo uma por uma.'],
];

/* Um roteiro curto no conteúdo que recebeu pedido de ajuste, para a tela do
   cliente ter o que mostrar junto do retorno. */
const BLOCOS_C4 = [
    ['ex-b20', 'ex-c4', 'gancho', null, 'Sábado tem avaliação funcional aqui no Instituto. E são 12 vagas.'],
    ['ex-b21', 'ex-c4', 'fala', null,
     'É a avaliação completa: marcha, força e amplitude, com laudo na hora. '
     + 'Serve para quem sente dor recorrente e nunca descobriu de onde vem.'],
    ['ex-b22', 'ex-c4', 'cta', null, 'Chama no direct para garantir a sua. Quando fechar, fechou.'],
];

const RETORNOS = [
    ['ex-r1', 'ex-c4', 'ajuste',
     'A frase "quando fechar, fechou" ficou agressiva demais para a nossa voz. '
     + 'Pode trocar por algo mais acolhedor? O resto está ótimo.',
     'Dra. Helena'],
];

/**
 * Cria (ou recria) os dados de exemplo.
 *
 * Os ids são fixos, então rodar de novo REPÕE exatamente os mesmos registros
 * com as datas recalculadas a partir da semana atual — não duplica. É o que
 * permite usar o botão como "restaurar" sem medo.
 */
export const semearExemplo = async () => {
    await store.clientes.salvar(CLIENTE);

    for (const [id, titulo, tema, fase, objetivo, formato, sem, dia, status, intencao] of CONTEUDOS) {
        await store.conteudos.salvar({
            id, cliente_id: CLIENTE.id, titulo, tema, fase, objetivo, formato,
            data: data(sem, dia), status, intencao,
            canal: 'Instagram',
            // Só o que já foi publicado aparece como revisado: um exemplo em
            // que tudo está revisado esconderia o aviso de conformidade.
            revisado: status === 'publicado',
            nota: null,
        });
    }

    for (const [id, conteudo_id, tipo, titulo, texto] of [...BLOCOS, ...BLOCOS_C4]) {
        await store.blocos.salvar({
            id, conteudo_id, tipo, titulo, texto,
            // A ordem sai da posição na lista, em passos de 10 — o mesmo
            // espaçamento que o editor usa ao renumerar.
            ordem: ([...BLOCOS, ...BLOCOS_C4].findIndex(b => b[0] === id) + 1) * 10,
        });
    }

    for (const [id, conteudo_id, tipo, texto, autor] of RETORNOS) {
        await store.retornos.salvar({
            id, conteudo_id, tipo, texto, autor,
            criado_em: new Date().toISOString(),
        });
    }

    store.limparCache();
};

/* Ordem de exclusão: os dependentes primeiro. Bloco e retorno apontam para
   conteúdo, e conteúdo aponta para cliente; começar pelo cliente faria o
   banco apagar em cascata linhas que a gente ia apagar em seguida — e, em
   modo local, deixaria blocos órfãos, porque lá não existe cascade. */
const ORDEM = ['blocos', 'retornos', 'conteudos', 'clientes'];

/**
 * Remove SÓ os registros de exemplo, deixando o que foi criado de verdade.
 *
 * Existe porque "apagar tudo" é uma porta larga demais para quem só quer
 * limpar a demonstração depois de já ter começado a usar o sistema.
 */
export const limparExemplo = async () => {
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        for (const l of linhas) {
            if (String(l.id).startsWith(PREFIXO)) await store[nome].excluir(l.id);
        }
    }
    store.limparCache();
};

/** Quantos registros de exemplo estão no banco agora. */
export const contarExemplo = async () => {
    let total = 0;
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        total += linhas.filter(l => String(l.id).startsWith(PREFIXO)).length;
    }
    return total;
};

/** Apaga tudo, em todas as coleções. Sem volta — ver Configurações. */
export const limparTudo = async () => {
    for (const nome of ORDEM) {
        const linhas = await store[nome].listar();
        for (const l of linhas) await store[nome].excluir(l.id);
    }
    store.limparCache();
};
