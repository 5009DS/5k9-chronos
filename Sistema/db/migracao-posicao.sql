-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 CHRONOS — a posição de origem de cada conteúdo.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms (o mesmo do schema.sql).
-- Em banco novo não é preciso: o schema.sql já cria a coluna.
--
-- ── Para que serve ────────────────────────────────────────────────────────
-- O cronograma passou a aceitar arrastar e trocar conteúdos de lugar. Quando
-- um conteúdo de fundo vai parar na sexta, a equipe precisa enxergar duas
-- coisas: que ele saiu do lugar dele, e QUEM está ocupando o lugar dele agora.
--
-- ── Por que UMA coluna e não duas ─────────────────────────────────────────
-- A tentação é gravar também `trocado_com`, apontando para o outro conteúdo.
-- Não fizemos, por dois motivos:
--
--   · troca é simétrica e um par de ponteiros mente na segunda troca. Se A
--     troca com B e depois com C, o ponteiro de B fica apontando para um
--     conteúdo que não está mais no lugar dele;
--   · com `data_original` a resposta é DERIVADA e nunca envelhece: "quem me
--     substituiu" é simplesmente quem está hoje na minha data de origem.
--     Funciona inclusive em rodízio de três, que nenhum par de ponteiros
--     descreve.
--
-- ── Quando ela muda ───────────────────────────────────────────────────────
-- Nasce igual a `data` e NÃO muda ao arrastar — é isso que faz o deslocamento
-- ser detectável. Só é reescrita quando alguém diz explicitamente que a
-- posição nova é a certa (botão "fixar posição") ou quando a data é editada na
-- ficha do conteúdo, que é remanejamento deliberado e não troca.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists data_original date;

-- Backfill: para tudo que já existe, a posição atual É a de origem. Sem isso o
-- sistema inteiro apareceria deslocado no primeiro carregamento depois da
-- migração, e um aviso que aparece em tudo não avisa nada.
update vz_conteudos set data_original = data where data_original is null;
