# 5K9 Chronos

O cronograma de conteúdo do cliente, com o roteiro de cada peça e a estratégia
por trás dela — num link que abre no celular, sem senha.

Mesmo desenho e mesma stack do [5K9 Forms](../5K9%20Forms) e do
[5K9 Gestor](../5K9%20Gestor): módulos ES servidos direto, sem build, sobre o
design system da marca (`tokens.css` + `ds/`).

---

## Rodar

```bash
node .claude/static-server.js
```

Abre em `http://localhost:5175`. Não há passo de build: o servidor só entrega
os arquivos de `Sistema/` e devolve `index.html` para rotas sem extensão (o
mesmo que o `vercel.json` faz em produção).

Para conhecer a ferramenta sem cadastrar nada: **Configurações → Zona de testes
→ Preencher com dados de exemplo**. Ele cria um cliente com um mês de
cronograma desenhado para mostrar tudo que o sistema sabe fazer — inclusive os
erros que ele detecta.

## Telas

| Rota | O que responde |
|---|---|
| `/` | Quem são os clientes e, antes disso, o que eles devolveram sem resposta. |
| `/cliente/:id` | O mês daquele cliente, semana a semana. Onde o cronograma é montado e liberado. |
| `/conteudo/:id` | O roteiro em blocos, com a leitura estratégica e o que o cliente respondeu. |
| `/quadro/:id` | O mês como grade: semanas × vagas do funil. Arrastar, trocar e ver quem saiu do lugar. |
| `/importar/:id` | Sobe o PDF de temas ou de roteiros, mostra o que entendeu e grava depois da conferência. |
| `/diretorio` | O funil, os objetivos, a matriz de cruzamento e o testador do classificador. |
| `/configuracoes` | Conexão, diretório, cópia de segurança, tema, dados de exemplo. |
| **`/c/:token`** | **O cliente.** Cronograma do mês, sem login. |
| **`/c/:token/:conteudo`** | **O cliente.** Roteiro, explicação e os botões de aprovar ou pedir ajuste. |

As duas últimas são a razão do sistema existir. Tudo o mais serve para
alimentá-las.

## As duas camadas de cada conteúdo

**Fase** responde *para quem* o conteúdo fala — fundo, meio ou topo, na lógica
do Funil Invertido, em que a semana começa pedindo ação e termina atraindo
público novo.

**Objetivo** responde *o que ele precisa provocar* — construção de autoridade,
prova social, conversão, alcance, quebra de objeção, e mais quatro.

São independentes de propósito. Dois roteiros de meio de funil podem ter
objetivos opostos, e é o **cruzamento** dos dois que orienta quem escreve.
Marcar um conteúdo como "meio de funil + construção de autoridade" faz o
sistema mostrar sozinho, sem ninguém digitar nada:

- que a combinação é natural, e por quê;
- o que aquele objetivo exige do roteiro e o que evitar;
- o que medir depois de publicar;
- o alerta de conformidade, quando a fase ou o objetivo pedem (CFM 2.336/2023).

Marcar "topo de funil + prova social" faz aparecer o cartão vermelho de
combinação em conflito, explicando que depoimento pressupõe conhecer a marca.

## De onde vem essa inteligência

De [`Diretórios/`](Diret%C3%B3rios), na raiz do repositório — não de um modelo
de linguagem. Toda frase que o sistema exibe está escrita em JSON, revisada por
quem entende do negócio, e pode ser corrigida à mão.

| Arquivo | O que é |
|---|---|
| `01-guia-estrategico.md` | A leitura humana do Funil Invertido. |
| `02-taxonomia-classificacao.json` | As três fases: sinais, palavras-chave, regras de desempate. |
| `03-exemplos-classificados.md` | Exemplos com raciocínio explícito, incluindo os casos híbridos. |
| `04-objetivos-conteudo.json` | Os nove objetivos e a leitura de cada par fase × objetivo. |

Os dois JSON viram um módulo do navegador:

```bash
node .claude/gerar-diretorio.js
```

O gerador existe porque o servidor entrega apenas `Sistema/`, e uma tela que
depende de rede para explicar a estratégia abre pela metade no celular do
cliente. Editar `Diretórios/` e rodar o comando mantém os dois lados idênticos.

Quem preferir não passar por deploy sobe o JSON em **Configurações →
Diretório**: a versão enviada fica no banco e passa por cima do arquivo, e
apagar devolve o sistema a um estado conhecido.

### O classificador

Cola-se um tema e ele sugere a fase — por **contagem de sinais**, e devolvendo
quais palavras encontrou junto com o palpite. Quem discorda pode conferir de
onde saiu a sugestão. Quando não encontra sinal nenhum, ele **não responde**:
um classificador que sempre chuta ensina a equipe a confiar em palpite.

Acerta os onze exemplos de referência de `03-exemplos-classificados.md`,
inclusive os dois casos híbridos. O testador vive em `/diretorio` — use-o para
calibrar a taxonomia com temas reais antes de confiar nela.

## O roteiro

O recorte é livre: **seção**, **fala**, **frase curta**, **bloco livre**,
**gancho**, **chamada para ação** e **orientação de gravação** convivem no mesmo
roteiro, e quem escreve decide enquanto escreve.

Por baixo é uma lista plana: a seção é um marcador, não um nível de árvore.
Arrastar item entre níveis é a operação mais difícil que existe em toque, e
esta ferramenta é usada no celular — o modelo é honesto sobre o que a interface
consegue editar (`lib/roteiro.js`).

O sistema estima a duração de fala enquanto se digita (150 palavras/minuto, e a
tela diz que é estimativa) e avisa quando há dois CTAs, quando falta gancho ou
quando um bloco passa de 45 segundos.

### Colar o roteiro inteiro

Montar bloco a bloco é bom para ESCREVER e péssimo para RECEBER. A roteirista
manda o roteiro pronto num bloco de texto, e transformar isso em nove blocos à
mão é digitação que o sistema faz sozinho.

**Colar roteiro**, no topo da seção, aceita o texto como ele chega:

```
ROTEIRO FLACIDEZ NA FACE

* Você emagreceu e percebeu que seu rosto ficou mais caído?
* Isso é mais comum do que parece.
* Eu sou a Dra. Laiz e te aguardo pra uma avaliação!
```

Os dois formatos que a roteirista usa funcionam igual: marcador `-` com linha em
branco entre os itens, ou `*` coladinho. Cada marcador — ou cada parágrafo, se
não houver marcador — vira um bloco.

A tipagem sai de três regras, e só três:

| Vira | Quando |
|---|---|
| **gancho** | é a primeira fala |
| **chamada para ação** | é a última fala *e* pede algo (`agende`, `te aguardo`, `chama no direct`…) |
| **frase curta** | está no meio, tem até 58 caracteres, não tem vírgula e termina em pontuação |

O resto fica como **fala**. Os três limites da frase curta é que tornam a regra
segura: "Isso é mais comum do que parece." entra, "Por isso, a avaliação
individualizada é fundamental para definir o melhor plano" não. Se o documento
trouxer rótulos explícitos (`Gancho:`, `CTA:`, `[câmera]`), eles têm prioridade.

A prévia mostra o que foi entendido, bloco a bloco, **antes** de gravar. Com
roteiro já existente aparecem duas saídas: substituir ou acrescentar ao fim.

O menu de cada bloco (`⋯`) troca o tipo, duplica logo abaixo do original e
exclui com desfazer. Ele fecha sozinho quando o botão sai da tela — é o mesmo
comportamento dos outros menus do estúdio, e evita um popover flutuando solto
sem relação com o que o abriu.

## O link do cliente

Em **Cliente → Link do cliente**: ver o endereço, copiar, e personalizar.

Por padrão o link é o token aleatório de dez caracteres — não adivinhável, que
é o ponto. Um apelido legível é adivinhável por construção, e este link abre o
cronograma inteiro. Por isso a tela sugere o meio-termo: nome do cliente mais
um sufixo tirado do próprio token (`dra-fernanda-k7mq`), legível o bastante
para caber num e-mail e imprevisível o bastante para não ser chutado.

O aviso na tela não tenta MEDIR se um endereço é adivinhável — isso não é
mensurável a partir do texto. Ele checa uma coisa exata: o endereço termina com
o sufixo aleatório que geramos? E diz exatamente isso.

**O token continua valendo sempre**, em paralelo. Apagar o apelido não quebra
nenhum link já enviado.

## Mover conteúdo de lugar

Em **Cliente → Quadro do mês** o mês aparece como grade: linhas são semanas,
colunas são as três vagas do Funil Invertido. Arraste um conteúdo para outra
vaga e ele se move; se a vaga já estiver ocupada, os dois **trocam de lugar**.
Na lista semanal o mesmo gesto vale, arrastando um cartão sobre outro.

**As colunas são POSIÇÃO, não fase.** Um conteúdo de fundo marcado na sexta
aparece na coluna do fim de semana, com o chip laranja no meio dos magenta.
Agrupar por fase deixaria a tela mais arrumada e esconderia exatamente o que
ela existe para mostrar.

**No toque, segure antes de arrastar.** Arrastar e rolar a página são o mesmo
gesto com o dedo; o arraste só começa depois de ~320ms parado. Antes disso a
página rola normalmente. Quem preferir não arrastar tem o botão de troca em
cada cartão: seleciona um, seleciona outro, e os dois invertem — que é também
a saída para quem usa leitor de tela.

Toda movimentação sai com **desfazer** no aviso.

**O quadro abre no mês corrente**, não no mês do último conteúdo cadastrado —
com pauta importada até 2027, abrir no fim do cronograma é abrir no lugar
errado. E o mês visitado sobrevive a cada troca: mover um conteúdo em outubro
não devolve ninguém para agosto.

**A rolagem também volta para onde estava.** Descer até a terceira semana,
abrir um roteiro e voltar devolvia a pessoa ao topo. A posição é lida no
instante da saída e reposta quando a tela tem altura para isso. Fica em
memória: recarregar a página começa do topo, que é o gesto de quem quer
recomeçar.

### Quem saiu do lugar, e quem ocupou o lugar dele

Cada conteúdo guarda `data_original` — onde ele nasceu. Ela não muda ao
arrastar, e é a diferença entre ela e a data atual que revela o deslocamento.
Tudo o mais é **derivado**: *"quem me substituiu"* é simplesmente quem está
hoje na minha data de origem.

Gravar um campo `trocado_com` seria o caminho óbvio e mentiria na segunda
troca — se A troca com B e depois com C, o ponteiro de B fica apontando para
quem não está mais lá. A derivação acerta inclusive em rodízio de três, que
nenhum par de ponteiros descreve.

O selo diz uma coisa diferente em cada caso, porque os três significam coisas
diferentes: *trocado com X* (os dois se moveram, um para o lugar do outro),
*saiu de tal dia — no lugar dele: X* (eu saí e alguém ocupou), *movido de tal
dia* (eu saí e a vaga ficou livre).

Quando a posição nova contraria a fase, o aviso passa de âmbar para vermelho:
remanejar agenda é trabalho normal, quebrar a estratégia do dia não é.

**"Fixar aqui"** encerra o assunto — passa a considerar a posição atual como a
de origem e apaga o aviso. Sem isso, um remanejamento deliberado ficaria
marcado como exceção para sempre. Editar a data pela ficha do conteúdo já faz
isso sozinho: pela ficha é remanejamento deliberado, arrastando é troca.

**O cliente não vê nada disso.** Ele enxerga a data e a fase, como sempre.
Rotatividade de produção não é assunto de quem recebe.

A legenda da tela dele deixou de citar dias por causa disto. Ela dizia "Fundo:
segunda e terça", o que era verdade enquanto o cronograma era fixo e virou uma
promessa desmentida pela própria tela assim que a equipe passou a remanejar. Hoje
ela descreve o PAPEL de cada fase; a data verdadeira já está no cartão de cada
conteúdo.

## Importar do PDF

A social mídia escreve os temas do mês num documento. Em **Cliente → Importar**
o PDF é lido *no navegador*, vira conteúdo, e o arquivo é descartado — nada de
upload, nada de storage. Um PDF por mês por cliente vira megabytes que ninguém
pesquisa; o mesmo texto em linha de banco é filtrável, editável e aparece no
celular do cliente.

### Temas

O documento precisa ter as seções `TOPO DE FUNIL`, `MEIO DE FUNIL` e
`FUNDO DE FUNIL`, cada uma com uma linha `Objetivo: …` e a lista de temas.
Subtítulos curtos entre os temas (`Hormônios`, `Terapias injetáveis`) viram o
eixo temático de cada um.

**A numeração é opcional.** O documento antigo numerava (`1. "…"`) e o novo não;
os dois funcionam. Sem numeração, tema é o que sobra depois de descartar
cabeçalho, rodapé, eixo, objetivo, nota e continuação de linha — com dois
cortes contra sobra de diagramação: menos de 15 caracteres não é tema, e
terminar em dois-pontos é abertura de lista.

**O cabeçalho de seção é comparado por semelhança, não letra a letra.** O PDF do
Canva traz a própria tabela de caracteres errada nos títulos de display:
`TOPO DE FUNIL` chega como `Toao de Funil`. O dado está errado dentro do
arquivo e nenhum leitor conserta — então a regra é "linha curta, contém funil, e
a primeira palavra parece topo/meio/fundo".

O importador lê também o **formato** de cada fase, nos dois jeitos que o
documento já escreveu: numa linha só (`● Reel 1 — TOPO: identificação…`) ou com
o formato acima do nome da fase, como faz a página de estratégia do documento
novo. Isso não é adivinhado: está escrito lá.

O `Objetivo:` de cada seção é traduzido para um dos nove objetivos do
diretório ("transformar interesse em intenção de consulta" → conversão direta),
e o seletor fica ao lado para corrigir.

**Agendamento.** O que estiver marcado é distribuído pelo Funil Invertido:
fundo na segunda, meio na quarta, topo na sexta; a semana seguinte recebe os
próximos de cada fase. Tudo entra como **rascunho** — o cliente só vê depois
que você liberar o mês.

O padrão é marcar quatro semanas, e não os oitenta temas. Um documento desses é
banco de temas do trimestre, não pauta de uma semana: marcar tudo encheria oito
meses de cronograma num clique, e desmarcar setenta é mais trabalho que marcar
mais alguns. Os atalhos `1 / 2 / 4 / 8 semanas / tudo / nada` estão logo acima
da lista.

### Roteiros

O formato é o que a social mídia já escreve, sem pedir nada em troca:

```
*ROTEIRO FLACIDEZ NA FACE*

- Você emagreceu e percebeu que seu rosto ficou mais 'caído'?

- Isso é mais comum do que parece.

- Quando perdemos peso, não eliminamos apenas gordura corporal…

- Eu sou a Dra. Laiz Lourenço e te aguardo pra uma avaliação!
```

**Onde um roteiro começa.** Uma linha que anuncia título abre um roteiro novo:
`*ROTEIRO X*`, `ROTEIRO: x`, ou qualquer linha curta em CAIXA ALTA sem
pontuação final. Um título que repita o tema cadastrado também serve. Sem esse
corte não há como saber onde um roteiro termina e o outro começa.

**Cada marcador é uma fala.** `-`, `•`, `1.` — um bloco por marcador, nunca
juntados. É o recorte que quem escreveu já fez à mão, e desfazê-lo seria
desperdiçar trabalho.

**Tipagem sem rótulo.** Duas regras, só duas: a **primeira** fala vira gancho
(o roteiro abre pelo que segura quem está passando, e sem isso todo roteiro
importado dispararia o aviso de "sem gancho"), e a **última** vira chamada para
ação *se* pedir alguma coisa — "agende", "te aguardo", "chama no direct". O
resto fica como fala. Chutar "frase curta" pelo comprimento acertaria metade
das vezes, o que numa importação de oitenta é metade errada; trocar o tipo é um
clique no editor.

Se o documento usar rótulos, eles também valem:
`Gancho:` `Fala:` `Frase:` `Seção:` `CTA:` `Orientação:` e `[entre colchetes]`.

**A quem o roteiro pertence.** O título costuma ser apelido — "FLACIDEZ NA
FACE" — e não o título longo do tema. Então a ligação tenta o apelido *e* a
primeira fala, que é onde as palavras do tema aparecem. Cada roteiro mostra a
**certeza** (alta, média, baixa) e, acima de tudo, um **seletor** com todos os
conteúdos do cliente: quando o cálculo erra ou não acha nada, a ligação é feita
à mão ali mesmo. É isso que torna a importação confiável com documento livre.

Importar de novo o mesmo documento **substitui** os blocos daquele conteúdo em
vez de duplicá-los.

**Roteiro que chega antes do tema.** Acontece: a social mídia escreve o roteiro
assim que a ideia aparece, sem esperar o cronograma do mês fechar. O seletor tem
a opção *criar conteúdo novo com este título* — e ele nasce com a fase que o
classificador sugere a partir do próprio texto, o objetivo natural daquela fase
e a próxima vaga livre dela na semana, respeitando o Funil Invertido. Os três
campos ficam à vista para corrigir antes de gravar.

## Ponte com o 5K9 Gestor

O Gestor é onde um cliente novo aparece primeiro — ele é cadastrado no dia em
que assina. **Clientes → Trazer do Gestor** lê a cartela do estúdio e copia quem
ainda não está aqui. Sem isso o nome é digitado de novo, e nome digitado duas
vezes vira "Instituto Dr Tigre" num sistema e "Instituto Dr. Tigre" no outro.

Vem só **nome, empresa e cor** dos clientes e **nome e papel** dos integrantes
ativos. Nada de documento, contato, chave pix, nota ou qualquer valor.

Para ligar: rode [`db/migracao-cartela.sql`](../5K9%20Gestor/Sistema/db/migracao-cartela.sql)
no SQL Editor do projeto Supabase **do Gestor**. As credenciais dele já estão em
`Sistema/lib/gestor.js` — são as mesmas do repositório do Gestor.

A lista de integrantes fica guardada neste navegador e alimenta o campo
**responsável** do conteúdo. O responsável é gravado como **nome**, não como
referência: o time vive em outro projeto Supabase, chave estrangeira entre
projetos não existe — e o histórico deve continuar dizendo quem fez depois que a
pessoa sair da equipe.

**Isto copia, não sincroniza.** Não há gatilho nem fila: um cliente renomeado no
Gestor continua com o nome antigo aqui até alguém importar de novo. É
deliberado — este sistema manda link para gente de fora, e um nome que muda
sozinho num cronograma já publicado é pior que um nome desatualizado.

**A decisão que precisa ser consciente:** a função do lado do Gestor é liberada
para o papel `anon`, então quem tiver a chave pública daquele projeto consegue
listar os nomes dos clientes do estúdio. Não existe meio-termo técnico —
qualquer chave que o navegador envie é pública, e "proteger com uma senha no
código" seria teatro. A escolha real é entre expor a lista de nomes ou exigir um
segundo login. O cabeçalho do `migracao-cartela.sql` explica como fechar, se um
dia isso mudar.

### Quando o PDF não abre

PDF escaneado é imagem: não tem camada de texto e não há OCR aqui. A tela diz
isso e oferece **colar o texto**, que funciona sempre e aceita o mesmo formato.

## Aprovação

O cliente aprova ou pede ajuste na própria tela, e o status volta para o painel
sem ninguém transcrever nada. `rascunho` é o único estado invisível a ele — é o
que permite montar o mês com calma e liberar de uma vez.

O painel abre pelos **pedidos de ajuste sem resposta**, acima da lista de
clientes. Um pedido que fica dias parado é a falha mais cara desta ferramenta,
porque ela existe para tirar essa conversa do WhatsApp — e uma conversa que
ninguém responde volta para o WhatsApp.

## Modo local × Supabase

Enquanto `Sistema/lib/supabase-config.js` estiver vazio, o sistema roda em
**modo local**: tudo é gravado no `localStorage` deste navegador. Serve para
montar e conferir a interface, inclusive a visão do cliente.

**Não mande o link do cliente em modo local.** O endereço `/c/<token>` só abre
neste mesmo navegador; para qualquer outra pessoa ele aparece como "link não
disponível". A topnav mostra o selo âmbar o tempo todo por causa disso.

### Ligar o banco

Este sistema **não tem projeto Supabase próprio**: ele mora dentro do projeto do
5K9 Forms, com as tabelas em prefixo `vz_`.

1. Abra o projeto Supabase do **5K9 Forms**.
2. Rode [`Sistema/db/schema.sql`](Sistema/db/schema.sql) no SQL Editor. Ele só
   cria tabelas `vz_` e não encosta em nada do Forms.
3. Em *Settings → API*, copie *Project URL* e a chave `anon`.
4. Cole as duas em `Sistema/lib/supabase-config.js`.

Não é preciso criar usuário: a equipe entra com o mesmo login do Forms.

## Decisões que valem saber

**O projeto Supabase é dividido, e é o do Forms.** O plano gratuito limita
projetos por organização, e a cota já está com o Forms e o Gestor. Dividir não
tem contrapartida técnica — o Postgres não fica mais lento por ter mais tabelas
— e tem uma operacional que é justo dizer: um backup por `pg_dump` passa a levar
os dois sistemas juntos. Escolhemos o Forms e não o Gestor porque o Forms já tem
superfície pública (o formulário que o cliente preenche), então dividir o banco
com este sistema não muda a natureza do risco dele. O Gestor é dinheiro e não
tem nenhuma tela aberta ao público; abrir uma lá seria trocar a garantia mais
forte que ele tem por economia.

**O cliente não lê tabela nenhuma.** RLS decide o que cada *linha* permite, não
o que a consulta pediu: liberar `vz_clientes` para o papel anônimo liberaria a
tabela inteira, e a chave `anon` é pública por natureza. Em vez disso, o
anônimo só pode chamar duas funções `security definer` que recebem o token e já
devolvem a resposta recortada — sem rascunhos e sem a anotação interna sobre o
cliente. Quem tem o link vê o próprio cronograma e nada além dele; quem não tem
não descobre nem que a tabela existe.

**A semana é identificada pela data da segunda-feira, não por número ISO.**
Ninguém sabe de cor o que é "semana 33", e a virada de ano tem regras que
produzem exatamente um bug por ano, sempre na semana em que ninguém está
olhando. Uma data ordena sozinha, imprime legível e não tem caso especial.

**Datas são string `AAAA-MM-DD`, nunca `Date`.** `new Date('2026-08-13')` é
lido como UTC e, em fuso negativo, volta como 12/08 às 21h — um conteúdo
marcado para segunda apareceria no domingo, ou seja, na semana anterior. E a
semana é a unidade de leitura desta ferramenta inteira (`lib/formato.js`).

**A visão mensal inclui as semanas que só encostam no mês.** Recortar a semana
para caber na grade do mês esconderia os conteúdos dos dias 1 e 2 quando o mês
começa numa quarta. Semanas vazias também aparecem: uma semana sem nada
programado é a informação mais importante que este sistema tem para dar, e ela
só existe se ocupar lugar na tela.

**Os alertas ficam calados quando está tudo certo.** Um painel que sempre tem
algo escrito na caixa de aviso ensina a ignorar a caixa de aviso.

**A tela do cliente nasce pequena.** O CSS dela é escrito em `min-width` — o
contrário do resto do estúdio, e anotado onde acontece. As outras telas são de
trabalho, e trabalho acontece na mesa; esta não.

**A tela do cliente não parece um sistema.** Sem topnav, sem trocador de
ferramenta, sem avatar, sem link para o painel. Nada ali sugere que existe um
sistema por trás para explorar — porque não existe, para ele.

**Os blocos do roteiro são editáveis no lugar.** Todo o resto do estúdio edita
em painel lateral, e está certo para formulários de campos independentes.
Escrever roteiro é ler o bloco anterior enquanto se escreve o próximo, e um
painel que cobre metade da tela esconde exatamente o que precisa ser lido.

**O nome interno continua "visualizador", e é de propósito.** A ferramenta se
chamava 5K9 Client Visualizer e virou **Chronos** em 15/08/2026. Trocamos tudo
que uma pessoa lê — produto, aba, login, domínio, documentação. Ficaram como
estavam: o prefixo `vz_` das tabelas, as chaves `5k9_visualizador_*` do
localStorage, o prefixo `.vz-` do CSS e o arquivo `pages/visualizador.css`.
Renomear qualquer um deles custa migração de banco ou um diff que atravessa o
sistema inteiro, e nenhum aparece para quem usa. Um nome interno herdado é mais
barato que uma migração feita por estética.

**O leitor de PDF é nosso, e cabe em 250 linhas.** O pdf.js resolve o caso
geral e pesa um megabyte que viria de CDN — e a regra da casa sobre CDN já
custou caro uma vez. O problema aqui é menor que o caso geral: documento de
texto feito no Google Docs, que só precisa ser lido. Duas armadilhas que
consumiram tempo e estão anotadas no código: a fonte com subconjunto embaralha
os códigos (sem a tabela `ToUnicode`, "Pensando" chega como "3HQVDQGR"), e o
`DecompressionStream` do navegador falha o fluxo inteiro por causa do `\n`
antes de `endstream` — o que parece, na tela, um PDF sem texto.

**Metade das telas não está na topnav, então elas têm rastro.** Cronograma,
roteiro e importação são telas às quais se chega por dentro — clicando num
pedido de ajuste no painel, por exemplo. O sublinhado da topnav diz em que
seção você está, não como voltar. O rastro (`Clientes / Instituto Dr. Tigre /
…`) mostra a hierarquia inteira com cada degrau clicável, e é o único elemento
de navegação do sistema que sabe de onde a pessoa veio.

**Nada é gerado por modelo de linguagem.** É a mesma regra do 5K9 Forms, onde a
tela de análise diz abertamente o que ela não calcula em vez de exibir número
inventado. Toda explicação sai de `Diretórios/`, e a sugestão de fase mostra os
sinais que encontrou.

## Estrutura

```
Sistema/
  index.html          entrada única; carrega tokens antes de tudo
  app.js              roteador SPA — casa padrão, e não alcança /c/
  store.js            escolhe o adaptador e expõe as quatro coleções
  theme.js            claro/escuro (mesma chave do Forms: 5k9_theme)
  db/
    schema.sql        rodar uma vez, no projeto Supabase do Forms
    local.js          adaptador localStorage
    remoto.js         adaptador Supabase (mapa de tabelas vz_)
  lib/
    diretorio-dados.js  GERADO a partir de Diretórios/ — não editar à mão
    diretorio.js        fases, objetivos, leitura do par, classificador
    roteiro.js          o modelo de blocos e as contas dele
    cronograma.js       semanas, cobertura, alertas de estratégia
    arrastar.js         arrastar e soltar com pointer events (mouse e toque)
    pdf.js              PDF → texto, por fonte, sem dependência externa
    gestor.js           ponte de leitura com o 5K9 Gestor (cartela)
    importar.js         os dois parsers: temas e roteiros
    pecas.js            HTML compartilhado entre a tela interna e a do cliente
    formato.js          datas, semanas, duração, escape
    rotas.js  ui.js  ferramentas.js  ancorar.js
  components/
    topnav.js  pageshell.js  drawer.js  campos.js  menu.js  toast.js  trocador.js
  pages/
    visualizador.css  vocabulário .vz- compartilhado
    painel.js  cronograma.js  quadro.js  roteiro.js  importar.js
    diretorio.js  configuracoes.js  login.js
    cliente.js        a tela pública — mobile-first, cabeçalho próprio
  ds/                 design system entregue pelo estúdio — não editar
  tokens.css          camada base (dark-first)
  tokens-bridge.css   traduz os nomes semânticos para os tokens da marca
```

Nenhum componente novo usa cor literal: tudo é `var(--token)`. É o que faz o
tema claro funcionar sem ninguém revisar.
