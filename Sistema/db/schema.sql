-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 CHRONOS — schema do banco.
--
-- Rode UMA VEZ no SQL Editor do projeto Supabase que JÁ HOSPEDA O 5K9 FORMS.
--
-- ── Por que dentro do projeto do Forms, e não num projeto novo ─────────────
-- O plano gratuito do Supabase limita quantos projetos a organização pode ter,
-- e o estúdio já usa a cota com o Forms e o Gestor. Criar um terceiro banco
-- para guardar algumas centenas de linhas custaria uma assinatura mensal.
--
-- Dividir o projeto não tem contrapartida técnica: o Postgres não fica mais
-- lento por ter mais tabelas, e o RLS isola cada uma independentemente. Tem
-- uma contrapartida operacional, e é honesto dizer qual: um `pg_dump` de
-- backup e uma eventual restauração passam a levar os dois sistemas juntos.
--
-- ESCOLHEMOS O FORMS E NÃO O GESTOR de propósito. O Forms já tem superfície
-- pública (o formulário que o cliente preenche), então dividir o banco com
-- este sistema não muda a natureza do risco dele. O Gestor é dinheiro e não
-- tem nenhuma tela aberta ao público — colocar uma porta anônima naquele
-- projeto seria trocar a garantia mais forte que ele tem por economia.
--
-- ── O prefixo vz_ ─────────────────────────────────────────────────────────
-- Toda tabela daqui começa com `vz_`. Não é enfeite: o Forms já tem uma
-- tabela `clientes`, e são outros clientes. Sem o prefixo, este arquivo
-- destruiria a base do outro sistema na primeira execução.
--
-- ── A decisão que estrutura o resto do arquivo ────────────────────────────
-- O cliente abre /c/<token> no celular e vê o cronograma dele, sem login.
--
-- A saída NÃO foi liberar as tabelas para o papel anônimo. RLS decide o que
-- cada LINHA permite, não o que a consulta pediu: uma política que liberasse
-- `vz_clientes` para anônimo liberaria a tabela inteira, e a chave `anon` é
-- pública por natureza — vai no código do navegador e qualquer pessoa a lê no
-- DevTools. Em cinco minutos alguém teria a lista de todos os clientes do
-- estúdio com os respectivos tokens.
--
-- Em vez disso, o anônimo não tem acesso a tabela nenhuma. Ele só pode CHAMAR
-- duas funções, ambas `security definer`, que recebem o token e já devolvem a
-- resposta recortada:
--
--     vz_visualizacao(p_token)        → o cronograma daquele cliente, sem rascunho
--     vz_registrar_retorno(p_token,…) → grava aprovação ou pedido de ajuste
--
-- Quem tem o link vê o próprio cronograma e nada além dele. Quem não tem, não
-- consegue nem descobrir que a tabela existe.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- Ids como TEXT, não uuid: os dados de exemplo usam ids legíveis fixos
-- ("ex-cli-1") e o app sempre manda um id. O default aqui é cinto de segurança.

-- ── Clientes ──────────────────────────────────────────────────────────────
-- `token` é o segredo do link público. Único, e com índice — é por ele que
-- toda visita de cliente entra no banco.
create table if not exists vz_clientes (
    id         text primary key default gen_random_uuid()::text,
    nome       text not null,
    empresa    text,
    token      text not null unique,
    -- Apelido opcional para o link (ver db/migracao-apelido.sql). Legível e,
    -- por isso mesmo, adivinhável — o token continua valendo em paralelo.
    apelido    text,
    contato    text,
    -- Quem aprova, e para onde vai o aviso de "ajustamos o que você pediu".
    -- Dois campos porque são duas coisas: `contato` é texto livre e diz com
    -- quem falar; `email` é endereço e precisa ser um só. Ver
    -- db/migracao-conversa.sql.
    email      text,
    cor        text,
    -- Uma frase da estratégia daquele cliente, mostrada no topo do cronograma
    -- dele. Dá contexto ao que ele está vendo.
    proposito  text,
    ativo      boolean not null default true,
    nota       text,
    criado_em  timestamptz not null default now()
);

create index if not exists vz_clientes_token_idx on vz_clientes(token);
-- Único permitindo vários nulos: a maioria dos clientes não terá apelido.
create unique index if not exists vz_clientes_apelido_idx
    on vz_clientes(apelido) where apelido is not null;

-- ── Conteúdos ─────────────────────────────────────────────────────────────
-- Um item do cronograma. `data` é a data de publicação prevista, e é ela que
-- define em que semana e em que dia o conteúdo aparece.
--
-- `fase` e `objetivo` são as duas camadas do diretório (ver lib/diretorio.js).
-- Ficam como texto solto, sem foreign key para uma tabela de taxonomia, de
-- propósito: a taxonomia é conhecimento versionado em arquivo, não cadastro.
-- Amarrá-la ao banco significaria migração toda vez que a estratégia evoluir.
--
-- `status` percorre: rascunho → em_revisao → aprovado | ajuste → publicado.
-- RASCUNHO É O ÚNICO ESTADO INVISÍVEL AO CLIENTE. É o que permite montar o
-- mês inteiro com calma e liberar quando estiver pronto.
create table if not exists vz_conteudos (
    id          text primary key default gen_random_uuid()::text,
    cliente_id  text not null references vz_clientes(id) on delete cascade,
    titulo      text not null default 'Sem título',
    tema        text,
    fase        text,                                  -- fundo | meio | topo
    objetivo    text,                                  -- id em 04-objetivos-conteudo.json
    formato     text,                                  -- reels, carrossel, story…
    canal       text,
    data        date not null default current_date,
    -- Onde o conteúdo NASCEU. Nasce igual a `data` e não muda ao arrastar: é a
    -- diferença entre as duas que revela que ele saiu do lugar, e é por ela que
    -- o sistema descobre quem está ocupando a posição original dele. Ver
    -- db/migracao-posicao.sql para o raciocínio inteiro.
    data_original date,
    status      text not null default 'rascunho',      -- rascunho | em_revisao | aprovado | ajuste | publicado
    -- O que a equipe quer que ESTE conteúdo faça, em uma frase. Complementa a
    -- explicação automática do objetivo, não a substitui.
    intencao    text,
    -- Nome de quem faz, trazido do 5K9 Gestor pela ponte de cartela. É TEXT e
    -- não referência porque o time vive em outro projeto Supabase — e porque o
    -- histórico deve continuar dizendo quem fez depois que a pessoa sair.
    responsavel text,
    nota        text,
    -- Estado INTERNO, livre, que o sistema não interpreta: "a gravar",
    -- "aguardando data", "esperando imagem do cliente". Texto livre e sem
    -- cadastro de propósito — `status` é a conversa com o cliente e cada valor
    -- dele vira regra em código; etiqueta é da equipe e muda sem migração.
    -- Ver db/migracao-etiquetas.sql. NÃO sai na resposta do link público.
    etiquetas   text[],
    -- Quando o conteúdo saiu do cronograma para o banco de temas. Nulo é o
    -- normal. A `data` continua ali: é ela que permite devolver o conteúdo ao
    -- lugar de onde saiu. Ver db/migracao-banco-temas.sql.
    banco_em    timestamptz,
    -- Marcação manual de revisão jurídica. O sistema já avisa sozinho quando a
    -- fase ou o objetivo pedem atenção (CFM 2.336/2023); esta coluna é a
    -- confirmação humana de que a revisão aconteceu.
    revisado    boolean not null default false,
    criado_em   timestamptz not null default now()
);

create index if not exists vz_conteudos_cliente_idx on vz_conteudos(cliente_id);
create index if not exists vz_conteudos_data_idx    on vz_conteudos(data);

-- ── Blocos do roteiro ─────────────────────────────────────────────────────
-- Lista PLANA, ordenada por `ordem`. Seção é um marcador na mesma lista, não
-- um nível de árvore — o porquê está em lib/roteiro.js, e resume-se a: mover
-- item entre níveis com o dedo é a operação mais difícil que existe em toque.
create table if not exists vz_blocos (
    id           text primary key default gen_random_uuid()::text,
    conteudo_id  text not null references vz_conteudos(id) on delete cascade,
    tipo         text not null default 'fala',   -- gancho|fala|frase|secao|bloco|cta|nota
    titulo       text,
    texto        text,
    ordem        integer not null default 0,
    criado_em    timestamptz not null default now()
);

create index if not exists vz_blocos_conteudo_idx on vz_blocos(conteudo_id, ordem);

-- ── A conversa sobre um conteúdo ──────────────────────────────────────────
-- Nasceu como "retornos do cliente" e virou a conversa inteira: o pedido dele
-- e a resposta da equipe moram na MESMA tabela, distinguidos por `origem`.
-- Duas tabelas obrigariam a unir e reordenar em toda tela que mostrasse o
-- assunto, e a primeira que esquecesse a união mostraria metade do diálogo.
-- O raciocínio completo está em db/migracao-conversa.sql.
--
-- Nunca é apagada nem editada: é o que responde "quando foi que ele aprovou
-- isso" três meses depois.
--
-- NÃO EXISTE COLUNA DE ESTADO. Se a conversa está pendente, respondida ou
-- fechada sai da ÚLTIMA entrada dela (lib/conversa.js). Uma coluna seria uma
-- segunda verdade sobre o mesmo fato, e as duas divergiriam no primeiro
-- comentário gravado sem atualizar a flag.
create table if not exists vz_retornos (
    id           text primary key default gen_random_uuid()::text,
    conteudo_id  text not null references vz_conteudos(id) on delete cascade,
    -- cliente: aprovado | ajuste · equipe: ajustado | resposta | aprovado
    tipo         text not null,
    texto        text,
    autor        text,
    -- cliente | equipe. Gravado pela função pública como 'cliente' sempre,
    -- sem parâmetro: se o lado viesse por argumento, qualquer pessoa com o
    -- link escreveria uma "resposta da equipe" no próprio roteiro.
    origem       text not null default 'cliente',
    -- A fala a que o pedido se refere, quando o cliente apontou uma. Ver
    -- db/migracao-ajuste-por-fala.sql. `trecho` congela o texto que ele estava
    -- lendo: a equipe vai REESCREVER o bloco, e sem isso o comentário passa a
    -- apontar para uma frase que não existe mais.
    bloco_id     text references vz_blocos(id) on delete set null,
    trecho       text,
    criado_em    timestamptz not null default now()
);

create index if not exists vz_retornos_conteudo_idx on vz_retornos(conteudo_id, criado_em desc);
-- Em ordem crescente: toda tela que abre um roteiro pergunta "o que já foi
-- dito sobre este bloco, na ordem em que foi dito".
create index if not exists vz_retornos_bloco_idx
    on vz_retornos(bloco_id, criado_em) where bloco_id is not null;

-- ── Diretório enviado pela interface ──────────────────────────────────────
-- Uma linha só (id = 'atual'). O diretório de verdade é o arquivo gerado em
-- Sistema/lib/diretorio-dados.js; esta tabela guarda a SOBREPOSIÇÃO enviada em
-- Configurações, para a estratégia poder evoluir sem passar por deploy. Apagar
-- a linha devolve o sistema ao arquivo, que é um estado conhecido.
--
-- `criado_em` e não `enviado_em`: o adaptador remoto ordena TODA coleção por
-- `criado_em`, e uma tabela que foge do nome quebra o `listar()` genérico com
-- um erro que só aparece na primeira vez que alguém abre Configurações.
create table if not exists vz_diretorio (
    id         text primary key default 'atual',
    pacote     jsonb not null,
    criado_em  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — a equipe entra com sessão; o cliente não entra, só pergunta.
--
-- "Somente autenticado" aqui significa qualquer usuário do projeto — os
-- mesmos logins do 5K9 Forms, já que o projeto é o mesmo. É o comportamento
-- desejado: é a mesma equipe. Se um dia for preciso separar quem vê o quê,
-- o lugar é aqui, trocando `using (true)` por uma checagem de papel.
-- ═══════════════════════════════════════════════════════════════════════════
alter table vz_clientes  enable row level security;
alter table vz_conteudos enable row level security;
alter table vz_blocos    enable row level security;
alter table vz_retornos  enable row level security;
alter table vz_diretorio enable row level security;

drop policy if exists "vz_clientes: somente autenticado"  on vz_clientes;
drop policy if exists "vz_conteudos: somente autenticado" on vz_conteudos;
drop policy if exists "vz_blocos: somente autenticado"    on vz_blocos;
drop policy if exists "vz_retornos: somente autenticado"  on vz_retornos;
drop policy if exists "vz_diretorio: somente autenticado" on vz_diretorio;

create policy "vz_clientes: somente autenticado" on vz_clientes
    for all to authenticated using (true) with check (true);
create policy "vz_conteudos: somente autenticado" on vz_conteudos
    for all to authenticated using (true) with check (true);
create policy "vz_blocos: somente autenticado" on vz_blocos
    for all to authenticated using (true) with check (true);
create policy "vz_retornos: somente autenticado" on vz_retornos
    for all to authenticated using (true) with check (true);
create policy "vz_diretorio: somente autenticado" on vz_diretorio
    for all to authenticated using (true) with check (true);

-- Nenhuma política para `anon`, e isso é intencional: sem política, RLS nega.
-- O acesso do cliente acontece pelas duas funções abaixo.

-- ═══════════════════════════════════════════════════════════════════════════
-- A PORTA DO CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════

-- `security definer` faz a função rodar com os privilégios de quem a criou,
-- passando por cima do RLS — por isso ela precisa fazer a checagem que o RLS
-- faria. Ela faz: filtra por token, exige cliente ativo e corta rascunhos.
--
-- `set search_path = public` é obrigatório em função definer. Sem isso, quem
-- consegue criar um schema no caminho de busca pode plantar uma tabela
-- `vz_clientes` falsa e a função passa a ler dela com privilégio elevado.
create or replace function vz_visualizacao(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    with c as (
        select * from vz_clientes
         where (token = p_token or apelido = p_token) and ativo is true
    ), itens as (
        select co.* from vz_conteudos co
          join c on co.cliente_id = c.id
         where co.status <> 'rascunho'
           -- O banco de temas é gaveta da equipe: conteúdo guardado não está
           -- programado, e mostrá-lo com data viraria promessa que ninguém fez.
           and co.banco_em is null
    )
    select case when not exists (select 1 from c) then null else jsonb_build_object(
        'cliente', (select to_jsonb(c) - 'nota' from c),
        -- `- 'nota' - 'etiquetas'`: as duas são anotação interna do estúdio e
        -- iam inteiras para o navegador do cliente. Mesmo motivo do recorte da
        -- nota do cadastro, logo abaixo.
        'conteudos', coalesce((
            select jsonb_agg(
                (to_jsonb(i) - 'nota' - 'banco_em')
                -- Só as etiquetas de PRODUÇÃO passam. O texto livre é recado da
                -- equipe para a equipe e fica deste lado. A mesma lista existe
                -- em lib/etiquetas.js; quem manda é esta.
                -- Ver db/migracao-etiquetas-cliente.sql.
                || jsonb_build_object('etiquetas', coalesce(to_jsonb(array(
                       select e from unnest(coalesce(i.etiquetas, '{}')) e
                        where lower(trim(e)) = any (array[
                            'roteiro em aprovação', 'roteiro aprovado', 'a gravar',
                            'gravado', 'em edição', 'aguardando data', 'aguardando material'
                        ])
                   )), '[]'::jsonb))
            ) from itens i), '[]'::jsonb),
        'blocos', coalesce((
            select jsonb_agg(to_jsonb(b))
              from vz_blocos b where b.conteudo_id in (select id from itens)), '[]'::jsonb),
        'retornos', coalesce((
            select jsonb_agg(to_jsonb(r))
              from vz_retornos r where r.conteudo_id in (select id from itens)), '[]'::jsonb),
        -- O diretório vigente viaja junto. A tela do cliente é feita de
        -- explicação estratégica, e ela precisa ser a MESMA que a equipe
        -- publicou — não a que estava embutida no código no dia do deploy.
        -- Numa ida só: quem abre isso está no celular, em rede de operadora, e
        -- uma segunda requisição é meio segundo de tela pela metade.
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

-- `- 'nota'` acima: a nota do cliente é anotação interna do estúdio ("paga
-- atrasado", "prefere falar por áudio"). Sai do objeto antes de ir para o
-- navegador dele. Segurança que depende de a interface não desenhar o campo é
-- segurança que dura até a próxima tela.

-- Grava o retorno e move o status do conteúdo junto. As duas coisas na mesma
-- função porque separá-las abriria a janela em que o cliente aprovou e o
-- painel ainda mostra "em revisão".
create or replace function vz_registrar_retorno(
    p_token    text,
    p_conteudo text,
    p_tipo     text,
    p_texto    text default null,
    p_autor    text default null,
    p_bloco    text default null,
    p_trecho   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text;
    v_bloco text;
    v_retorno jsonb;
begin
    if p_tipo not in ('aprovado', 'ajuste') then
        raise exception 'Tipo de retorno inválido.';
    end if;

    -- A checagem é a junção: o conteúdo precisa pertencer ao cliente DAQUELE
    -- token. Sem ela, quem tivesse um link válido poderia aprovar o conteúdo
    -- de qualquer outro cliente mandando o id na mão.
    select co.id into v_id
      from vz_conteudos co
      join vz_clientes cl on cl.id = co.cliente_id
     where co.id = p_conteudo
       and (cl.token = p_token or cl.apelido = p_token)
       and cl.ativo is true
       and co.status <> 'rascunho'
       and co.banco_em is null;

    if v_id is null then
        raise exception 'Este link não está mais válido para este conteúdo.';
    end if;

    -- Gravado fecha o pedido de MUDANÇA; aprovar continua valendo, porque
    -- "concordo" nunca precisa ser barrado. Esconder o botão na tela é
    -- decoração — quem tem o link e o console chama a função direto. Ver
    -- db/migracao-gravado.sql.
    if p_tipo = 'ajuste' and exists (
        select 1 from vz_conteudos co, unnest(coalesce(co.etiquetas, '{}')) e
         where co.id = v_id and lower(trim(e)) = 'gravado'
    ) then
        raise exception 'Este conteúdo já foi gravado — o roteiro não muda mais. Fale com a equipe se precisar de algo.';
    end if;

    -- `to_jsonb(vz_retornos.*)` e não `to_jsonb(vz_retornos)`: a segunda forma
    -- depende de o nome da tabela estar visível como variável de linha, o que
    -- muda entre versões do Postgres. Com `.*` é a linha inteira, sempre.
    -- O bloco precisa ser DESTE conteúdo: sem a checagem, quem tivesse um
    -- link válido penduraria comentário no roteiro de outro cliente.
    if p_bloco is not null then
        select b.id into v_bloco
          from vz_blocos b
         where b.id = p_bloco and b.conteudo_id = v_id;
    end if;

    insert into vz_retornos (conteudo_id, tipo, texto, autor, bloco_id, trecho, origem)
         values (v_id, p_tipo,
                 nullif(trim(coalesce(p_texto, '')), ''),
                 nullif(trim(coalesce(p_autor, '')), ''),
                 v_bloco,
                 nullif(trim(coalesce(p_trecho, '')), ''),
                 'cliente')
      returning to_jsonb(vz_retornos.*) into v_retorno;

    -- Só o retorno sobre o conteúdo INTEIRO move o status dele. "Esta fala
    -- ficou boa" é o fim de um assunto, não a aprovação da peça — e o
    -- cronograma da equipe não pode passar a dizer "aprovado" por causa disso.
    if v_bloco is null then
        update vz_conteudos
           set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end,
               -- A aprovação empurra a produção: tira "roteiro em aprovação",
               -- põe "roteiro aprovado" e "a gravar". Nunca numa peça já
               -- gravada — devolver "a gravar" ali mandaria gravar de novo o
               -- que está pronto. Ver db/migracao-aprovado-etiquetas.sql.
               etiquetas = case
                   when p_tipo = 'aprovado' and not exists (
                       select 1 from unnest(coalesce(etiquetas, '{}')) g
                        where lower(trim(g)) = 'gravado'
                   ) then (
                       -- Sai qualquer ETAPA da esteira, entra a de gravar.
                       -- As paralelas e as etiquetas livres ficam onde
                       -- estão. Ver db/migracao-esteira.sql.
                       select array(
                           select e from unnest(coalesce(etiquetas, '{}')) e
                            where lower(trim(e)) not in (
                                'roteiro em aprovação', 'roteiro aprovado', 'a gravar',
                                'gravado', 'em edição', 'gravação aguardando aprovação',
                                'revisão', 'publicado'
                            )
                       ) || array['a gravar']
                   )
                   else etiquetas
               end
         where id = v_id;
    end if;

    return v_retorno;
end;
$$;

-- Só estas duas funções, e nada mais deste sistema, ficam ao alcance de quem
-- não tem login.
revoke all on function vz_visualizacao(text)                              from anon, public;
revoke all on function vz_registrar_retorno(text, text, text, text, text, text, text) from anon, public;
grant execute on function vz_visualizacao(text)                              to anon, authenticated;
grant execute on function vz_registrar_retorno(text, text, text, text, text, text, text) to anon, authenticated;
