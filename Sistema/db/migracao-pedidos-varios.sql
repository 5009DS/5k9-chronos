-- ═══════════════════════════════════════════════════════════════════════════
-- MAIS DE UMA PESSOA POR PEDIDO
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez. Depois de
-- db/migracao-pedidos.sql. RODE ANTES DO DEPLOY: o sistema novo grava a coluna.
--
-- Um pedido costuma ser de mais de um: o reel é da Marianna (roteiro) e do
-- Andrew (edição). `responsaveis` guarda a lista de ids de vz_equipe.
--
-- `responsavel_id` fica no banco, sem uso: os pedidos que já tinham um
-- responsável são copiados para a lista abaixo, e apagar a coluna não ganharia
-- nada além do risco de uma versão antiga aberta numa aba gravar nela.
--
-- Lista não tem chave estrangeira. Não faz falta: ninguém é apagado da
-- equipe, só desativado (components/pedidos.js, abrirEquipe).
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_pedidos add column if not exists responsaveis text[] not null default '{}';

update vz_pedidos
   set responsaveis = array[responsavel_id]
 where responsavel_id is not null and responsaveis = '{}';

create index if not exists vz_pedidos_responsaveis on vz_pedidos using gin (responsaveis);
