/* ═══════════════════════════════════════════════════════════════════════════
   CONEXÃO COM O BANCO

   O Visualizador NÃO tem projeto Supabase próprio: ele mora dentro do projeto
   do 5K9 Forms, com as tabelas em prefixo `vz_`. O plano gratuito limita
   quantos projetos a organização pode ter, e a cota já está com o Forms e o
   Gestor — um banco a mais custaria assinatura para guardar algumas centenas
   de linhas.

   O Forms e não o Gestor de propósito: o Forms já tem tela pública (o
   formulário que o cliente preenche), então dividir o banco com este sistema
   não muda a natureza do risco dele. O Gestor é dinheiro e não tem nenhuma
   porta aberta ao público; abrir uma lá seria trocar a garantia mais forte
   que ele tem por economia. O raciocínio inteiro está em db/schema.sql.

   Consequência prática: as chaves abaixo são AS MESMAS do 5K9 Forms, e o
   login da equipe também. Copie de `Sistema/lib/supabase-config.js` do outro
   repositório.

   Enquanto os dois campos abaixo estiverem vazios, o sistema roda em MODO
   LOCAL: tudo é gravado no localStorage deste navegador. Serve para montar e
   conferir a interface, inclusive a visão do cliente. NÃO serve para mandar o
   link: em modo local o endereço /c/<token> só abre neste mesmo navegador.

   Para ligar no banco de verdade:
     1. abra o projeto Supabase do 5K9 Forms;
     2. rode db/schema.sql no SQL Editor dele — ele só cria tabelas `vz_`,
        e não encosta em nada do Forms;
     3. cole aqui a URL e a chave `anon` do Forms (Settings → API).
   Não é preciso criar usuário: a equipe já entra com o login do Forms.

   A chave `anon` é pública por natureza — vai no código do navegador e
   qualquer pessoa a lê no DevTools. Quem protege os dados é o RLS, que nega
   tudo para quem não tem sessão, mais as duas funções `security definer` que
   atendem o cliente por token (ver db/schema.sql). É por isso que a chave
   pública estar exposta não expõe cronograma nenhum — e é por isso que
   reaproveitar a chave do Forms não enfraquece nada: ela nunca foi o que
   protegia coisa alguma.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Só o endereço do projeto, sem caminho. O painel do Supabase mostra a URL da
   API REST (…/rest/v1/) em alguns lugares, mas a biblioteca monta esse trecho
   sozinha — e monta também o de autenticação (/auth/v1). Com o caminho já
   colado aqui, o login tentaria bater em /rest/v1/auth/v1/token e falharia
   sem dizer por quê. */
/* São as MESMAS chaves do 5K9 Forms, copiadas de
   `5K9 Forms/Sistema/lib/supabase-config.js`. Não é descuido: este sistema mora
   dentro do projeto dele, nas tabelas com prefixo `vz_`. Se um dia o
   Visualizador ganhar projeto próprio, é aqui e no mapa de tabelas em
   `db/remoto.js` que a troca acontece. */
export const SUPABASE_URL  = 'https://dppgtlclpgdvxhnnulgf.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRwcGd0bGNscGdkdnhobm51bGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMzcyNjUsImV4cCI6MjEwMTgxMzI2NX0.31Z-UOk4RUYBz4WtqNYmktiocgBIryTe6bChj9DHZiA';

/** Há banco configurado? Se não, o store cai no adaptador local. */
export const CONFIGURADO = !!(SUPABASE_URL && SUPABASE_ANON);
