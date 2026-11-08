-- ═══════════════════════════════════════════════════════════════════════════
-- A CONVERSA DA EQUIPE DENTRO DO PEDIDO — comentários, respostas e histórico.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
-- deploy. Depois de db/migracao-prioridade.sql.
--
-- ── UMA TABELA PARA OS COMENTÁRIOS E PARA O HISTÓRICO ─────────────────────
-- "Marianna comentou" e "Marianna mudou para Fazendo" são a mesma linha do
-- tempo, lida de cima para baixo. Em duas tabelas, toda tela que mostrasse a
-- conversa precisaria juntar as duas e reordenar. `tipo` separa os dois.
--
-- `alvo` + `alvo_id` dizem do que é a conversa. Hoje só existe 'pedido'; a
-- demanda pode ganhar a mesma conversa depois sem mexer no esquema. Por ser
-- genérico, não há chave estrangeira para o alvo: excluir um pedido deixa a
-- conversa órfã, e ela simplesmente não aparece em lugar nenhum.
--
-- `resposta_a` aponta o comentário respondido. Um nível só, como no ClickUp:
-- a resposta de uma resposta entra na mesma linha de respostas.
--
-- Esta conversa é da EQUIPE. Não tem nada a ver com vz_retornos, que é a
-- conversa com o CLIENTE, e nunca aparece no link dele.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists vz_comentarios (
    id          text primary key default gen_random_uuid()::text,
    alvo        text not null default 'pedido' check (alvo in ('pedido', 'conteudo')),
    alvo_id     text not null,
    resposta_a  text references vz_comentarios(id) on delete cascade,
    tipo        text not null default 'comentario' check (tipo in ('comentario', 'atividade')),
    texto       text not null,
    autor_email text default (auth.jwt() ->> 'email'),
    autor_nome  text,
    criado_em   timestamptz not null default now(),
    editado_em  timestamptz
);

create index if not exists vz_comentarios_alvo on vz_comentarios (alvo, alvo_id, criado_em);

alter table vz_comentarios enable row level security;
drop policy if exists "vz_comentarios: somente autenticado" on vz_comentarios;
create policy "vz_comentarios: somente autenticado" on vz_comentarios
    for all to authenticated using (true) with check (true);

-- ── Tópicos do pedido ─────────────────────────────────────────────────────
-- A mesma lista [{ id, texto, feito }] do checklist da demanda.
alter table vz_pedidos add column if not exists checklist jsonb not null default '[]'::jsonb;

-- ── Conferência ───────────────────────────────────────────────────────────
-- select count(*) from vz_comentarios;
-- select checklist from vz_pedidos limit 1;
