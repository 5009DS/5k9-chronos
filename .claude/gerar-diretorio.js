/* ═══════════════════════════════════════════════════════════════════════════
   Gera Sistema/lib/diretorio-dados.js a partir dos JSON de Diretórios/.

       node .claude/gerar-diretorio.js

   Existe porque o conhecimento estratégico é escrito e revisado como JSON na
   raiz do repositório (é o formato que a equipe já usava para colar em prompt
   e no Notion), mas o navegador precisa dele como módulo. Copiar à mão os
   dois lados diverge na primeira pressa — o gerador garante que o que a tela
   explica é exatamente o que está no diretório.
   ═══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'Diretórios');
const SAIDA = path.join(RAIZ, 'Sistema', 'lib', 'diretorio-dados.js');

const FONTES = [
    { arquivo: '02-taxonomia-classificacao.json', constante: 'TAXONOMIA' },
    { arquivo: '04-objetivos-conteudo.json',      constante: 'OBJETIVOS' },
];

const CABECALHO = `/* ═══════════════════════════════════════════════════════════════════════════
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

`;

let saida = CABECALHO;

for (const { arquivo, constante } of FONTES) {
    const bruto = fs.readFileSync(path.join(DIR, arquivo), 'utf8');
    // Passa por JSON.parse antes de escrever: um JSON quebrado vira erro aqui,
    // com nome de arquivo e posição, em vez de um módulo que o navegador
    // recusa em silêncio no meio do carregamento.
    JSON.parse(bruto);
    saida += `export const ${constante} = ${bruto.trim()};\n\n`;
}

fs.writeFileSync(SAIDA, saida);
console.log(`diretorio-dados.js gerado — ${saida.length} caracteres, ${FONTES.length} fontes.`);
