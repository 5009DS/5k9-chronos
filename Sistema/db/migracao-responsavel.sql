-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 CHRONOS — quem é o responsável por cada conteúdo.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms (o mesmo do schema.sql).
-- Em banco novo não é preciso: o schema.sql já cria a coluna.
--
-- ── Por que TEXT com o nome, e não uma referência ─────────────────────────
-- O time vive no 5K9 Gestor, que é OUTRO projeto Supabase. Chave estrangeira
-- entre projetos não existe, e guardar o id de lá seria guardar um número que
-- este banco não sabe resolver.
--
-- Guardar o nome tem duas vantagens que o id não teria: o dado continua legível
-- com a ponte desligada, e continua verdadeiro quando alguém sai da equipe — o
-- histórico deve dizer quem fez, não quem ainda está.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists responsavel text;
