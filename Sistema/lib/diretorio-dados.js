/* ═══════════════════════════════════════════════════════════════════════════
   DIRETÓRIO — o conhecimento estratégico, como DADO.

   ESTE ARQUIVO É GERADO. Ele é a cópia, em módulo ES, dos JSON que vivem em
   Diretórios/ na raiz do repositório:

       Diretórios/02-taxonomia-classificacao.json  →  TAXONOMIA
       Diretórios/04-objetivos-conteudo.json       →  OBJETIVOS

   POR QUE COPIAR EM VEZ DE BUSCAR O ARQUIVO
   O servidor entrega apenas Sistema/; a pasta Diretórios/ é documentação do
   repositório e não tem URL. Buscar por fetch obrigaria a publicar os JSON
   junto e a lidar com uma tela que abre vazia enquanto a rede não responde —
   numa página que o cliente abre no celular, em rede de operadora. Como
   módulo, o conhecimento chega junto com o código e a explicação nunca fica
   em branco.

   Nada aqui é gerado por modelo de linguagem. Toda explicação que o sistema
   mostra sai deste arquivo, e por isso pode ser conferida e corrigida à mão.

   PARA ATUALIZAR: edite o JSON em Diretórios/, rode
       node .claude/gerar-diretorio.js
   e confira o diff. Quem preferir editar pela interface pode subir o JSON em
   Configurações → Diretório — nesse caso a versão enviada fica no banco e
   passa por cima desta, sem tocar no arquivo.
   ═══════════════════════════════════════════════════════════════════════════ */

export const TAXONOMIA = {
  "sistema": "Funil Invertido de Conteúdo",
  "regra_volume": "3 postagens semanais, uma por fase",
  "fases": [
    {
      "id": "fundo",
      "nome": "Fundo de Funil - Decisão e Ação",
      "ordem_semana": 1,
      "posicao_cronograma": "início da semana (segunda/terça)",
      "nivel_consciencia_publico": "alto - já conhece a marca, precisa de empurrão final",
      "objetivo_principal": "conversão, agendamento, inscrição, urgência",
      "tom": [
        "direto",
        "assertivo",
        "orientado a resultado"
      ],
      "sinais_classificacao": [
        "pede ação imediata e mensurável",
        "contém prova social explícita (depoimento, antes/depois)",
        "menciona vagas limitadas, prazos ou urgência",
        "cita evento, campanha institucional ou lançamento de protocolo"
      ],
      "palavras_chave": [
        "agende",
        "vagas limitadas",
        "garanta seu lugar",
        "inscreva-se",
        "antes e depois",
        "resultado real",
        "depoimento",
        "lançamento",
        "últimas vagas",
        "não perca",
        "agendar",
        "marque sua",
        "marcar consulta",
        "consulta",
        "primeira consulta",
        "avaliação individualizada",
        "avaliação presencial",
        "te aguardo",
        "procurar um",
        "procurar o",
        "quando procurar",
        "deveria procurar",
        "endocrinologista",
        "nutrólogo",
        "nutrologista",
        "dermatologista",
        "especialista",
        "quem pode fazer",
        "sou candidato",
        "candidata",
        "vale a pena",
        "como é a consulta",
        "link na bio",
        "chama no direct",
        "whatsapp",
        "atendimento"
      ],
      "formatos": [
        "prova social/depoimento",
        "campanha institucional",
        "lançamento de protocolo/evento"
      ],
      "cta_exemplos": [
        "Agende sua consulta",
        "Garanta sua vaga",
        "Inscreva-se agora"
      ],
      "compliance_flag": "conteúdo com depoimento/resultado exige revisão jurídica (CFM 2.336/2023)"
    },
    {
      "id": "meio",
      "nome": "Meio de Funil - Autoridade e Consideração",
      "ordem_semana": 2,
      "posicao_cronograma": "meio da semana (quarta/quinta)",
      "nivel_consciencia_publico": "médio - já identificou o problema, avalia soluções",
      "objetivo_principal": "posicionar autoridade técnica, gerar desejo pela solução",
      "tom": [
        "técnico traduzido em linguagem acessível",
        "educativo",
        "explicativo"
      ],
      "sinais_classificacao": [
        "explica causa, sintoma ou 'como funciona' de um tratamento",
        "mostra bastidores ou processo técnico",
        "quebra objeções sem pedir conversão direta",
        "não pede ação imediata, mas convida a saber mais"
      ],
      "palavras_chave": [
        "entenda como",
        "por que acontece",
        "causas",
        "sintomas",
        "bastidores",
        "diagnóstico",
        "planejamento",
        "protocolo explicado",
        "você sabia que",
        "tratamento",
        "tratamentos",
        "protocolo",
        "implante",
        "aplicação",
        "medicamento",
        "caneta",
        "injetável",
        "suplementação",
        "reposição",
        "terapia",
        "procedimento",
        "sessões",
        "como funciona",
        "o que é",
        "o que acontece",
        "diferença entre",
        "quando é indicado",
        "indicações",
        "contraindicações",
        "efeitos colaterais",
        "exame",
        "exames",
        "laboratorial",
        "acompanhamento",
        "individualizado",
        "hormônio",
        "hormonal",
        "insulina",
        "resistência à insulina",
        "tireoide",
        "vitamina",
        "colágeno",
        "nadh",
        "glutationa",
        "creatina",
        "ozempic",
        "nutrologia",
        "endocrinologia",
        "dermatologia",
        "composição corporal",
        "nosso protocolo",
        "nosso método",
        "nosso diferencial",
        "nossa abordagem",
        "exclusivo",
        "exclusiva",
        "aqui na clínica",
        "no consultório",
        "nossa equipe"
      ],
      "formatos": [
        "explicação de patologia",
        "bastidores de protocolo",
        "diagnóstico e planejamento médico"
      ],
      "cta_exemplos": [
        "Saiba mais",
        "Entenda como funciona",
        "Comenta aqui sua dúvida"
      ],
      "compliance_flag": "evitar promessa de resultado ou comparação superlativa (CFM 2.336/2023)"
    },
    {
      "id": "topo",
      "nome": "Topo de Funil - Atração e Consciência",
      "ordem_semana": 3,
      "posicao_cronograma": "final da semana (sexta/sábado/domingo)",
      "nivel_consciencia_publico": "baixo - público geral, pode não conhecer a marca",
      "objetivo_principal": "alcance, salvamentos, compartilhamentos",
      "tom": [
        "leve",
        "dinâmico",
        "relacionável",
        "fácil consumo"
      ],
      "sinais_classificacao": [
        "dica genérica de saúde/bem-estar/rotina",
        "não cita tratamento ou protocolo específico da clínica",
        "formato de fácil viralização (mitos e verdades, dica rápida)",
        "objetivo é alcance, não conversão nem autoridade"
      ],
      "palavras_chave": [
        "mito ou verdade",
        "dica rápida",
        "no dia a dia",
        "salve esse post",
        "marque alguém",
        "você sabia",
        "hidratação",
        "rotina saudável",
        "cansaço",
        "cansada",
        "cansado",
        "sem energia",
        "disposição",
        "sono ruim",
        "insônia",
        "inchaço",
        "retenção",
        "queda de cabelo",
        "unha fraca",
        "libido",
        "memória",
        "ansiedade",
        "compulsão",
        "vontade de doce",
        "por que",
        "motivos",
        "sinais de",
        "sinais que",
        "será que",
        "verdade sobre",
        "mito",
        "engorda",
        "emagrece",
        "efeito sanfona",
        "metabolismo lento",
        "barriga",
        "celulite",
        "flacidez",
        "envelhecimento",
        "pele"
      ],
      "formatos": [
        "mitos e verdades",
        "dicas de rotina",
        "conteúdo relacionável"
      ],
      "cta_exemplos": [
        "Salve para depois",
        "Marque alguém que precisa ver isso",
        "Compartilhe"
      ],
      "compliance_flag": null
    }
  ],
  "regras_desempate": [
    "Se o roteiro atender critérios de mais de uma fase, classificar pelo objetivo dominante (a ação pedida no final do conteúdo), não pela primeira característica identificada.",
    "Prova social/depoimento sempre puxa para Fundo, mesmo que o tom pareça leve.",
    "Explicação técnica sem CTA de conversão é Meio, mesmo que mencione um protocolo específico.",
    "Ausência de menção a tratamento específico e ausência de pedido de ação é forte sinal de Topo."
  ]
};

export const OBJETIVOS = {
  "sistema": "Objetivos de conteúdo — camada complementar à taxonomia de funil",
  "versao": 1,
  "atualizado_em": "2026-08-14",

  "por_que_existe": "A fase do funil responde PARA QUEM o conteúdo fala. O objetivo responde O QUE ele precisa provocar. As duas coisas são independentes: dois roteiros de meio de funil podem ter objetivos opostos — um constrói autoridade técnica, outro quebra uma objeção de preço. Sem essa segunda camada, 'meio de funil' vira um rótulo grande demais para orientar quem escreve. Com ela, o sistema consegue dizer em uma frase o que aquele roteiro precisa entregar.",

  "como_o_sistema_usa": "Cada conteúdo carrega uma fase e um objetivo. O Chronos cruza os dois e mostra automaticamente: a explicação do objetivo, a leitura do par (se a combinação é natural, se exige cuidado ou se está em conflito) e o que medir depois de publicar. Nada é gerado por modelo de linguagem — tudo sai deste arquivo, e por isso pode ser conferido e corrigido à mão.",

  "objetivos": [
    {
      "id": "autoridade",
      "nome": "Construção de autoridade",
      "icone": "graduation-cap",
      "resumo": "Fazer o público concluir sozinho que esta equipe é quem mais entende do assunto.",
      "explicacao": "Autoridade não se afirma, se demonstra. O roteiro precisa mostrar profundidade — uma distinção que só quem é da área faz, um critério de decisão, um erro comum que a maioria comete. Quem assiste deve terminar pensando 'isso eu não sabia, e essa pessoa sabe', não 'que legal esse consultório'.",
      "por_que_funciona": "A decisão por um profissional de saúde é uma decisão de risco. O público não consegue avaliar competência técnica diretamente, então avalia por procuração: clareza ao explicar, segurança ao delimitar, honestidade ao dizer o que não serve. Cada um desses sinais reduz o risco percebido.",
      "fase_natural": ["meio"],
      "o_roteiro_precisa_ter": [
        "uma distinção que o leigo não faria sozinho",
        "o porquê por trás do procedimento, não só o quê",
        "linguagem técnica traduzida — o termo aparece e é explicado, não escondido",
        "um limite explícito: em que caso aquilo NÃO se aplica"
      ],
      "evitar": [
        "superlativo sobre a própria equipe ('os melhores', 'referência nacional') — além de fraco, esbarra na CFM 2.336/2023",
        "explicação genérica que qualquer site de saúde repetiria",
        "encerrar com pedido de agendamento: o conteúdo perde a natureza de aula e vira anúncio"
      ],
      "como_medir": "Tempo médio de visualização e comentários com perguntas. Autoridade se mede por quem fica até o fim e volta perguntando — não por curtida.",
      "cta_sugeridos": ["Entenda como funciona", "Comenta aqui a sua dúvida", "Salve para consultar depois"],
      "por_fase": {
        "fundo": {
          "leitura": "exige_cuidado",
          "nota": "Autoridade no fundo de funil funciona como reforço de última milha: a pessoa já vai agendar e precisa de uma razão final para escolher você e não o concorrente. Só se sustenta se a credencial for concreta e verificável — formação, volume de casos, protocolo próprio. Se virar autoelogio, derruba a conversão em vez de apoiar."
        },
        "meio": {
          "leitura": "natural",
          "nota": "É o par de origem do sistema. O público já sabe que tem um problema e está comparando quem resolve; a aula é exatamente o que ele foi procurar. Aqui o conteúdo pode ser o mais técnico da semana sem perder ninguém."
        },
        "topo": {
          "leitura": "conflito",
          "nota": "Autoridade pede profundidade e o topo pede consumo rápido de quem não conhece a marca. As duas coisas puxam o roteiro para lados opostos: ou ele aprofunda e perde o alcance, ou simplifica e não demonstra nada. Se o tema é bom, mova para o meio da semana. Se a posição no cronograma é fixa, troque o objetivo para educação."
        }
      }
    },
    {
      "id": "prova-social",
      "nome": "Prova social",
      "icone": "quote",
      "resumo": "Mostrar alguém parecido com o público tendo o resultado que ele quer.",
      "explicacao": "A prova social responde a uma pergunta que o argumento técnico não alcança: 'funciona para alguém como eu?'. O centro do roteiro não é o procedimento, é a pessoa — de onde ela partiu, o que a fez procurar ajuda, o que mudou na rotina dela. Quanto mais comum for o ponto de partida, mais forte é a identificação.",
      "por_que_funciona": "Reduz o medo do desconhecido. Ver alguém comum passar pelo processo antecipa a experiência e transforma uma decisão abstrata em algo que já aconteceu com outra pessoa.",
      "fase_natural": ["fundo"],
      "o_roteiro_precisa_ter": [
        "um ponto de partida reconhecível — o problema antes da solução",
        "a voz da própria pessoa, não a descrição da equipe sobre ela",
        "um detalhe concreto do cotidiano, que é o que gera identificação",
        "contexto: quanto tempo levou e o que foi feito"
      ],
      "evitar": [
        "promessa de resultado, garantia ou comparação de antes e depois sem o contexto clínico completo",
        "depoimento sem autorização de uso de imagem por escrito",
        "escolher só o caso excepcional — o resultado atípico é o que mais atrai fiscalização e menos gera identificação"
      ],
      "como_medir": "Mensagens diretas e agendamentos nas 72h seguintes. Prova social é o formato de fundo com resposta mais rápida.",
      "cta_sugeridos": ["Agende sua avaliação", "Chame no direct para saber se serve para o seu caso"],
      "compliance": "ALTO. A Resolução CFM 2.336/2023 restringe divulgação de resultados, antes e depois e depoimentos de pacientes. Todo conteúdo com este objetivo passa por revisão jurídica antes de publicar.",
      "por_fase": {
        "fundo": {
          "leitura": "natural",
          "nota": "Par de origem. A pessoa já conhece a marca e está a um passo de decidir; ver o resultado de alguém igual a ela é o empurrão que faltava."
        },
        "meio": {
          "leitura": "exige_cuidado",
          "nota": "Funciona quando o caso é usado como ILUSTRAÇÃO de um conceito — 'a Ana chegou com este quadro, e é por isso que o protocolo começa pelo diagnóstico'. A regra de desempate da taxonomia continua valendo: se o depoimento é o centro e não o exemplo, o conteúdo é fundo, não meio."
        },
        "topo": {
          "leitura": "conflito",
          "nota": "Depoimento pressupõe que a pessoa sabe quem você é. Para quem nunca viu a marca, um resultado alheio soa como anúncio e o alcance despenca — com o agravante de ser o formato mais sensível à norma do CFM. Não vale o risco."
        }
      }
    },
    {
      "id": "conversao",
      "nome": "Conversão direta",
      "icone": "target",
      "resumo": "Pedir uma ação mensurável agora: agendar, inscrever, responder.",
      "explicacao": "É o único objetivo em que o conteúdo tem permissão de pedir. O roteiro inteiro existe para sustentar uma única ação, e tudo que não empurra para ela sobra. Precisa deixar explícito o que fazer, onde e até quando.",
      "por_que_funciona": "Público de alta consciência não precisa ser convencido de novo — precisa de instrução e de um motivo para não adiar. A maior parte da perda de conversão não é discordância, é adiamento.",
      "fase_natural": ["fundo"],
      "o_roteiro_precisa_ter": [
        "uma ação só, dita com verbo no imperativo",
        "o caminho concreto: link na bio, botão, telefone — sem 'entre em contato' genérico",
        "uma razão honesta para agir agora (agenda que fecha, turma que começa, sazonalidade real)",
        "a objeção mais provável respondida antes do pedido"
      ],
      "evitar": [
        "urgência inventada — escassez falsa queima a confiança que o resto do funil construiu",
        "dois pedidos no mesmo conteúdo: quem escolhe entre duas ações não faz nenhuma",
        "condicionar atendimento a promoção ou desconto, o que a CFM veda"
      ],
      "como_medir": "Cliques no link, mensagens recebidas e agendamentos atribuídos. É o único objetivo em que alcance baixo com conversão alta é um bom resultado.",
      "cta_sugeridos": ["Agende sua consulta", "Garanta sua vaga", "Chame no WhatsApp"],
      "por_fase": {
        "fundo": {
          "leitura": "natural",
          "nota": "Par de origem, e a razão de o fundo abrir a semana: segunda e terça é quando a disposição para resolver pendência está no pico."
        },
        "meio": {
          "leitura": "exige_cuidado",
          "nota": "Um pedido de ação no fim de uma aula não invalida a aula — mas muda o que ela é. Pela regra de desempate da taxonomia, quem classifica pelo objetivo dominante vai ler esse conteúdo como fundo. Se a intenção é mesmo educar, troque o pedido por um convite ('entenda como funciona')."
        },
        "topo": {
          "leitura": "conflito",
          "nota": "Pedir agendamento a quem nunca ouviu falar da clínica é a forma mais rápida de derrubar o alcance: o algoritmo lê a queda de retenção e para de entregar. O topo converte, mas indiretamente — trazendo para dentro quem depois será público de meio e fundo."
        }
      }
    },
    {
      "id": "educacao",
      "nome": "Educação e esclarecimento",
      "icone": "book-open",
      "resumo": "Corrigir uma informação errada ou ensinar algo útil de imediato.",
      "explicacao": "O objetivo aqui é a pessoa terminar sabendo de algo que não sabia e conseguir usar hoje. Diferente da autoridade, não busca demonstrar profundidade — busca ser útil rápido. É o objetivo mais versátil do sistema porque cabe nas três fases sem forçar.",
      "por_que_funciona": "Informação útil e imediatamente aplicável é o que as pessoas salvam e mandam para alguém. E corrigir um erro comum tem uma vantagem extra: gera discordância nos comentários, que é o combustível mais barato de alcance.",
      "fase_natural": ["topo", "meio"],
      "o_roteiro_precisa_ter": [
        "uma afirmação clara logo no início — a correção ou o dado, sem rodeio",
        "aplicação prática: o que fazer com essa informação",
        "uma única ideia por conteúdo"
      ],
      "evitar": [
        "listar cinco dicas quando uma bem explicada resolveria",
        "abrir com contexto longo antes de chegar ao ponto"
      ],
      "como_medir": "Salvamentos e compartilhamentos. Conteúdo educativo bem feito é arquivado, não só curtido.",
      "cta_sugeridos": ["Salve para depois", "Marque alguém que precisa ver isso"],
      "por_fase": {
        "fundo": {
          "leitura": "exige_cuidado",
          "nota": "Educar no fundo só faz sentido como remoção do último obstáculo — explicar como é a primeira consulta, o que levar, quanto tempo dura. É educação sobre o PROCESSO de decidir, não sobre o tema."
        },
        "meio": {
          "leitura": "natural",
          "nota": "Encaixe direto: explicar causa, sintoma e mecanismo é exatamente o que o público em avaliação procura."
        },
        "topo": {
          "leitura": "natural",
          "nota": "Encaixe direto, desde que a dica não dependa de conhecer a clínica. Mito e verdade, dica de rotina e o dado que contraria o senso comum vivem aqui."
        }
      }
    },
    {
      "id": "quebra-objecao",
      "nome": "Quebra de objeção",
      "icone": "shield-question",
      "resumo": "Responder de frente o motivo real pelo qual a pessoa ainda não procurou ajuda.",
      "explicacao": "Toda pessoa que não agendou tem um motivo, e quase nunca é falta de informação: é medo de doer, vergonha, experiência ruim anterior, achar que o problema não é grave o bastante, ou preço. O roteiro nomeia a objeção em voz alta — de preferência com as palavras que a própria pessoa usaria — e responde sem defensiva.",
      "por_que_funciona": "Objeção não dita não pode ser respondida. Ao dizer em voz alta o que a pessoa pensa e não fala, o conteúdo produz a sensação de ter sido entendida, que é o que abre espaço para a resposta.",
      "fase_natural": ["meio", "fundo"],
      "o_roteiro_precisa_ter": [
        "a objeção nomeada nas palavras do público, não nas da clínica",
        "reconhecimento de que ela é legítima antes da resposta",
        "resposta concreta e verificável, não tranquilização genérica",
        "honestidade sobre o que não dá para prometer"
      ],
      "evitar": [
        "tratar a objeção como ignorância do público",
        "responder preço com 'invista em você' — desvia em vez de responder",
        "prometer ausência de dor ou de risco"
      ],
      "como_medir": "Comentários e mensagens diretas relatando a mesma objeção. Quando o conteúdo acerta, as pessoas se identificam publicamente.",
      "cta_sugeridos": ["Comenta se você já pensou isso", "Chame no direct e tire essa dúvida"],
      "por_fase": {
        "fundo": {
          "leitura": "natural",
          "nota": "A objeção é o último obstáculo antes da ação. Responder e emendar o pedido de agendamento é uma das sequências mais eficientes do sistema."
        },
        "meio": {
          "leitura": "natural",
          "nota": "Par de origem. A taxonomia já lista 'quebra objeções sem pedir conversão direta' como sinal de meio de funil."
        },
        "topo": {
          "leitura": "exige_cuidado",
          "nota": "Só funciona com objeções universais, do tipo 'todo mundo sente isso' — nunca com objeções sobre a clínica, que pressupõem conhecê-la. Na dúvida, o objetivo certo para o topo é educação."
        }
      }
    },
    {
      "id": "alcance",
      "nome": "Alcance e descoberta",
      "icone": "radio",
      "resumo": "Ser visto por quem ainda não conhece a marca.",
      "explicacao": "Aqui o conteúdo é a porta aberta do consultório para o mundo. Ele não pede nada, não explica protocolo e não cita tratamento — é útil ou divertido o bastante para ser compartilhado por alguém que não tem relação nenhuma com a clínica.",
      "por_que_funciona": "Todo funil se esvazia. Sem entrada constante de público novo, meio e fundo passam a falar para uma audiência cada vez menor e mais saturada — e a queda aparece na conversão semanas depois, quando já é difícil descobrir a causa.",
      "fase_natural": ["topo"],
      "o_roteiro_precisa_ter": [
        "os três primeiros segundos resolvendo por que vale continuar assistindo",
        "compreensão total sem áudio e sem contexto prévio",
        "um motivo claro para mandar para alguém"
      ],
      "evitar": [
        "citar o nome da clínica ou o protocolo no meio do conteúdo",
        "qualquer pedido de ação que não seja salvar, marcar ou compartilhar",
        "depender de saber quem você é"
      ],
      "como_medir": "Proporção de contas alcançadas que ainda não seguem o perfil, compartilhamentos e salvamentos.",
      "cta_sugeridos": ["Marque alguém que precisa ver isso", "Salve para depois", "Compartilhe"],
      "por_fase": {
        "fundo": {
          "leitura": "conflito",
          "nota": "Alcance e conversão disputam o mesmo roteiro e nenhum dos dois ganha. Conteúdo de fundo é feito para poucas pessoas certas; medir seu alcance é usar a régua errada e concluir que ele fracassou."
        },
        "meio": {
          "leitura": "exige_cuidado",
          "nota": "Uma aula pode viralizar, mas não é para isso que existe. Se o tema depende de explicar um mecanismo, alcance é consequência possível — não deve virar o critério de sucesso."
        },
        "topo": {
          "leitura": "natural",
          "nota": "Par de origem, e a razão de o topo fechar a semana: sexta a domingo o consumo é mais leve e disperso, exatamente onde conteúdo compartilhável rende mais."
        }
      }
    },
    {
      "id": "relacionamento",
      "nome": "Relacionamento e proximidade",
      "icone": "heart-handshake",
      "resumo": "Mostrar as pessoas por trás da clínica.",
      "explicacao": "Rosto, nome, rotina, bastidor. O objetivo é que o público reconheça um ser humano e não uma marca — o que muda a régua com que ele avalia tudo que a conta publica depois. Não precisa ter tese nem ensinar nada.",
      "por_que_funciona": "Confiança em saúde é transferida para pessoas, não para instituições. Quem já viu o rosto do profissional chega à consulta com uma familiaridade que encurta o primeiro atendimento.",
      "fase_natural": ["topo", "meio"],
      "o_roteiro_precisa_ter": [
        "uma pessoa identificável, com nome",
        "algo espontâneo — o excesso de produção anula o efeito",
        "conexão com o cotidiano de quem assiste"
      ],
      "evitar": [
        "bastidor que na verdade é propaganda de estrutura",
        "espontaneidade encenada, que o público reconhece e desconta"
      ],
      "como_medir": "Comentários com o nome do profissional, respostas a stories e recorrência de quem já assiste.",
      "cta_sugeridos": ["Conta aqui o seu", "Manda sua pergunta para a próxima"],
      "por_fase": {
        "fundo": {
          "leitura": "exige_cuidado",
          "nota": "Só funciona se a proximidade for o argumento final — 'é este profissional que vai te atender'. Fora disso, dilui o pedido de ação."
        },
        "meio": {
          "leitura": "natural",
          "nota": "Bastidor de protocolo já é um formato de meio na taxonomia. Mostrar quem faz e como decide constrói consideração junto com a proximidade."
        },
        "topo": {
          "leitura": "natural",
          "nota": "É o conteúdo mais leve que a conta pode publicar, e o fim de semana é onde ele rende. Serve também para não deixar o topo virar só dica genérica intercambiável."
        }
      }
    },
    {
      "id": "recall",
      "nome": "Lembrança de marca",
      "icone": "bell-ring",
      "resumo": "Ocupar a cabeça do público antes de ele precisar.",
      "explicacao": "Ninguém decide procurar um especialista no mesmo dia em que vê o conteúdo. O objetivo do recall é ser o nome que aparece quando a necessidade chegar — semanas ou meses depois. Repetição de um mesmo território temático importa mais do que a peça isolada.",
      "por_que_funciona": "A decisão em saúde é adiada até virar urgente, e nesse momento não há pesquisa: a pessoa recorre a quem já está na memória.",
      "fase_natural": ["topo", "meio"],
      "o_roteiro_precisa_ter": [
        "associação clara entre um sintoma ou situação e a especialidade",
        "consistência com o que a conta já vem dizendo",
        "um elemento repetível — formato, bordão, abertura"
      ],
      "evitar": [
        "trocar de território a cada semana, o que impede qualquer associação de se formar",
        "medir por resultado imediato: recall é o objetivo mais lento do sistema"
      ],
      "como_medir": "Menções espontâneas, buscas pelo nome da clínica e crescimento de seguidores recorrentes ao longo de meses.",
      "cta_sugeridos": ["Salve para quando precisar", "Segue para não perder"],
      "por_fase": {
        "fundo": {
          "leitura": "conflito",
          "nota": "Recall aceita retorno lento; fundo de funil existe para produzir retorno rápido. Juntar os dois entrega um conteúdo que não converte agora nem constrói memória depois."
        },
        "meio": {
          "leitura": "natural",
          "nota": "A aula recorrente sobre o mesmo território é o que faz a clínica virar sinônimo do problema que resolve."
        },
        "topo": {
          "leitura": "natural",
          "nota": "Alcance sem recall é audiência que passa e esquece. Repetir formato e território transforma volume em memória."
        }
      }
    },
    {
      "id": "institucional",
      "nome": "Posicionamento institucional",
      "icone": "landmark",
      "resumo": "Comunicar o que a clínica é, defende ou está lançando.",
      "explicacao": "Novo espaço, nova equipe, campanha sazonal, posição pública sobre um tema da área. O conteúdo fala da instituição, não do problema do paciente — e por isso é o que mais precisa de contrapartida: precisa dar ao público um motivo para se importar com a notícia.",
      "por_que_funciona": "Marca que nunca fala de si vira prestadora de serviço intercambiável. Fatos institucionais concretos — investimento, certificação, chegada de um profissional — sustentam a percepção de solidez que nenhuma afirmação sobre si mesma sustenta.",
      "fase_natural": ["fundo"],
      "o_roteiro_precisa_ter": [
        "o fato antes da celebração",
        "o que muda na prática para quem é atendido",
        "data e próximo passo, quando houver"
      ],
      "evitar": [
        "comemorar internamente sem traduzir o benefício para o público",
        "superlativo e comparação com concorrentes — vedado pela CFM 2.336/2023",
        "acumular vários anúncios num conteúdo só"
      ],
      "como_medir": "Alcance dentro da base que já segue e menções. Institucional fala com quem já está por perto.",
      "cta_sugeridos": ["Saiba mais", "Agende sua avaliação", "Acompanhe por aqui"],
      "por_fase": {
        "fundo": {
          "leitura": "natural",
          "nota": "A taxonomia já lista campanha institucional e lançamento de protocolo como formatos de fundo: são notícias com data e chamada direta."
        },
        "meio": {
          "leitura": "exige_cuidado",
          "nota": "Só quando o anúncio é a porta para explicar o mecanismo — a chegada de um equipamento vira aula sobre o que ele muda no diagnóstico. Sem essa tradução, é anúncio no lugar errado da semana."
        },
        "topo": {
          "leitura": "conflito",
          "nota": "Notícia sobre a clínica não interessa a quem não conhece a clínica. Some no alcance e ainda ocupa a vaga semanal mais valiosa para trazer público novo."
        }
      }
    }
  ],

  "leituras": {
    "natural": {
      "rotulo": "Combinação natural",
      "tom": "sucesso",
      "explicacao": "Fase e objetivo puxam o roteiro para a mesma direção. É onde este par rende mais."
    },
    "exige_cuidado": {
      "rotulo": "Exige cuidado",
      "tom": "atencao",
      "explicacao": "A combinação funciona, mas só com uma condição específica. Vale conferir se o roteiro atende a essa condição antes de gravar."
    },
    "conflito": {
      "rotulo": "Combinação em conflito",
      "tom": "risco",
      "explicacao": "Fase e objetivo pedem coisas opostas do mesmo roteiro. Não é proibido — é um sinal de que provavelmente um dos dois está classificado errado."
    }
  }
};

