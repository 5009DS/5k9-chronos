-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDOS, DECISÕES E EQUIPE — a memória do que o cliente pediu.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez. RODE ANTES DO
-- DEPLOY: a tela de Pedidos lê estas tabelas. As outras telas continuam de pé
-- sem elas (o quadro e a demanda tratam a ausência como "nenhum pedido").
--
-- ── POR QUE EXISTE ────────────────────────────────────────────────────────
-- O que o cliente pede vive no grupo do WhatsApp, quase sempre em áudio, e a
-- resposta é um "pode deixar" na hora. O pedido vale para aquela peça e volta
-- na seguinte — e cada pessoa da equipe lembra de uma parte. Aqui o pedido
-- vira uma linha com responsável, prazo e estado, e só fecha quando o cliente
-- CONFIRMA que viu.
--
--   vz_equipe     quem pode ser marcado num pedido, com o email dos avisos
--   vz_pedidos    o que o cliente pediu, de quem é, até quando, em que pé está
--   vz_decisoes   regras permanentes do cliente ("capa nunca repete foto") —
--                 aparecem no topo de toda demanda dele
--
-- ── SÓ A EQUIPE ───────────────────────────────────────────────────────────
-- Nenhuma função pública lê estas tabelas, e o RLS só deixa entrar quem tem
-- sessão. O cliente não vê os pedidos nem as decisões.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists vz_equipe (
    id         text primary key default gen_random_uuid()::text,
    nome       text not null,
    email      text,
    ativo      boolean not null default true,
    criado_em  timestamptz not null default now()
);

create table if not exists vz_pedidos (
    id            text primary key default gen_random_uuid()::text,
    cliente_id    text not null references vz_clientes(id) on delete cascade,
    texto         text not null,                       -- o pedido, em uma frase
    detalhe       text,                                -- a mensagem original, colada do grupo
    quem_pediu    text,
    pedido_em     date not null default current_date,  -- quando o cliente pediu
    -- O responsável é o id da equipe, e não o nome como em vz_conteudos: o
    -- aviso por email precisa chegar a uma pessoa, e nome não tem endereço.
    responsavel_id text references vz_equipe(id) on delete set null,
    prazo         date,
    status        text not null default 'novo',        -- novo | fazendo | entregue | confirmado
    -- A demanda que atende o pedido, quando ele virou peça.
    conteudo_id   text references vz_conteudos(id) on delete set null,
    criado_por    text,
    concluido_em  timestamptz,
    criado_em     timestamptz not null default now()
);

create index if not exists vz_pedidos_cliente on vz_pedidos (cliente_id);
create index if not exists vz_pedidos_responsavel on vz_pedidos (responsavel_id) where status <> 'confirmado';

create table if not exists vz_decisoes (
    id          text primary key default gen_random_uuid()::text,
    cliente_id  text not null references vz_clientes(id) on delete cascade,
    texto       text not null,
    ativa       boolean not null default true,
    criado_por  text,
    criado_em   timestamptz not null default now()
);

create index if not exists vz_decisoes_cliente on vz_decisoes (cliente_id);

alter table vz_equipe   enable row level security;
alter table vz_pedidos  enable row level security;
alter table vz_decisoes enable row level security;

drop policy if exists "vz_equipe: somente autenticado"   on vz_equipe;
drop policy if exists "vz_pedidos: somente autenticado"  on vz_pedidos;
drop policy if exists "vz_decisoes: somente autenticado" on vz_decisoes;

create policy "vz_equipe: somente autenticado" on vz_equipe
    for all to authenticated using (true) with check (true);
create policy "vz_pedidos: somente autenticado" on vz_pedidos
    for all to authenticated using (true) with check (true);
create policy "vz_decisoes: somente autenticado" on vz_decisoes
    for all to authenticated using (true) with check (true);

-- ── Conferência ───────────────────────────────────────────────────────────
-- select count(*) from vz_equipe;  -- 0 numa instalação nova: a equipe é
-- cadastrada pela própria tela de Pedidos, botão "Equipe".
