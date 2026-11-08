-- ═══════════════════════════════════════════════════════════════════════════
-- PRIORIDADE NOS PEDIDOS
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
-- deploy: o formulário e a janela do pedido gravam esta coluna.
--
-- Os mesmos quatro níveis da demanda (db/migracao-prioridade.sql):
-- urgente | alta | normal | baixa, ou vazio ("ninguém disse").
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_pedidos add column if not exists prioridade text;
alter table vz_pedidos drop constraint if exists vz_pedidos_prioridade_check;
alter table vz_pedidos add constraint vz_pedidos_prioridade_check
    check (prioridade is null or prioridade in ('urgente', 'alta', 'normal', 'baixa'));

-- ── Conferência ───────────────────────────────────────────────────────────
-- select prioridade, count(*) from vz_pedidos group by 1;
