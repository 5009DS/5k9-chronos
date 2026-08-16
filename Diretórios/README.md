# Como usar este pacote

Este diretório é a **fonte do conhecimento estratégico** do 5K9
Chronos. Não é documentação de apoio: é o que o sistema lê para explicar
cada conteúdo ao cliente, avisar quando uma combinação está em conflito e
sugerir a fase de um tema.

| Arquivo | Para quem | O que é |
|---|---|---|
| `01-guia-estrategico.md` | pessoas | A leitura humana do Funil Invertido. Cole no Notion/Trello para consulta da equipe. |
| `02-taxonomia-classificacao.json` | máquina | As três fases: sinais, palavras-chave, regras de desempate. |
| `03-exemplos-classificados.md` | pessoas e IA | Exemplos com raciocínio explícito, incluindo os casos híbridos. |
| `04-objetivos-conteudo.json` | máquina | Os nove objetivos e a leitura de cada par fase × objetivo. |

## As duas camadas

A **fase** responde *para quem* o conteúdo fala. O **objetivo** responde *o que
ele precisa provocar*. São independentes: dois roteiros de meio de funil podem
ter objetivos opostos — um constrói autoridade técnica, outro quebra uma
objeção de preço.

Sem a segunda camada, "meio de funil" é um rótulo grande demais para orientar
quem escreve. Com ela, o sistema consegue dizer em uma frase o que aquele
roteiro precisa entregar — e é isso que aparece na tela do cliente.

## Depois de editar

Os dois JSON viram um módulo do navegador. **Toda edição precisa ser
propagada:**

```bash
node .claude/gerar-diretorio.js
```

Isso reescreve `Sistema/lib/diretorio-dados.js`. O gerador valida o JSON antes
de escrever, então um arquivo quebrado vira erro ali — com nome e posição — em
vez de um módulo que o navegador recusa no meio do carregamento.

**Alternativa sem deploy:** suba o JSON em *Configurações → Diretório
estratégico* dentro do sistema. A versão enviada fica no banco e passa por cima
do arquivo; apagar devolve o sistema ao arquivo, que é um estado conhecido. É
o caminho para ajustar a estratégia entre um deploy e outro.

## Conferir antes de confiar

A tela `/diretorio` do sistema tem um testador: cole um tema e veja o que a
taxonomia responde, com as palavras que ela encontrou. Depois de mexer nas
`palavras_chave`, passe os exemplos de `03-exemplos-classificados.md` por ele —
se algum deixar de bater, a mudança teve efeito colateral.

## Usar a taxonomia fora do sistema

Os arquivos continuam servindo para colar em prompt de uma ferramenta de IA:

```
Você é um classificador de conteúdo para redes sociais de uma clínica de saúde.
Use a taxonomia abaixo para classificar cada tema/roteiro em: fundo, meio ou topo.

TAXONOMIA:
[colar conteúdo de 02-taxonomia-classificacao.json]

EXEMPLOS DE REFERÊNCIA:
[colar conteúdo de 03-exemplos-classificados.md]

Para cada tema recebido, responda com:
- fase (fundo | meio | topo)
- justificativa (1 frase)
- compliance_flag (se aplicável, segundo a taxonomia)

TEMA A CLASSIFICAR: "{tema}"
```

Para pedir também o objetivo, acrescente `04-objetivos-conteudo.json` e peça o
campo `objetivo` com o id correspondente.

## Onde isso aparece no produto

- **Cartão de leitura** (a caixa colorida no roteiro): vem de
  `objetivos[].por_fase[fase]` — `leitura` define a cor, `nota` define o texto.
- **"O que este objetivo pede deste roteiro"**: vem de `explicacao`,
  `por_que_funciona`, `o_roteiro_precisa_ter`, `evitar` e `como_medir`.
- **Aviso de conformidade**: vem de `compliance_flag` na fase e de `compliance`
  no objetivo. São dois campos porque são duas responsabilidades diferentes na
  revisão jurídica.
- **Ordem do seletor de objetivo**: os naturais para aquela fase aparecem
  primeiro, os em conflito por último. A lista ensina enquanto a pessoa escolhe.
- **Alertas da semana**: `posicao_cronograma` de cada fase é o que faz o sistema
  avisar que um conteúdo de fundo está marcado num sábado.
