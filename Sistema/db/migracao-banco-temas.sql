-- ═══════════════════════════════════════════════════════════════════════════
-- BANCO DE TEMAS — o conteúdo que existe e ainda não tem lugar.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
--
-- ── O PROBLEMA ────────────────────────────────────────────────────────────
-- Conteúdo novo entra em datas que já têm conteúdo. A saída era apagar o que
-- estava lá — e apagar perde o título, o tema, a fase e o roteiro que já
-- tinham sido escritos. Tirar do cronograma não é a mesma coisa que descartar.
--
-- ── A DECISÃO: UMA DATA, NÃO UM BOOLEANO ──────────────────────────────────
-- `banco_em` guarda QUANDO o conteúdo saiu do cronograma. Um `no_banco
-- boolean` responderia à mesma pergunta com menos: ordenar o banco pelo que
-- saiu por último é a leitura natural de uma pilha, e "está lá desde março" é
-- informação que ninguém pensa em guardar antes de precisar dela.
--
-- Nulo é o normal: quem está no cronograma nunca passou por aqui.
--
-- A `data` NÃO é apagada. É ela que permite devolver o conteúdo ao lugar de
-- onde ele saiu, e é o palpite que o formulário de volta oferece.
--
-- ── POR QUE NÃO É UM STATUS ───────────────────────────────────────────────
-- Pelo mesmo motivo das etiquetas: `status` é a conversa com o cliente, e
-- estar no banco não é um passo dessa conversa — é ausência dela. Um conteúdo
-- pode ir para o banco vindo de rascunho ou de aprovado, e voltar para o
-- estado em que estava. Isso não cabe numa máquina de estados linear.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists banco_em timestamptz;

-- Índice parcial: as consultas do cronograma perguntam sempre pelos que NÃO
-- estão no banco, e um índice sobre a coluna inteira guardaria milhares de
-- nulos para responder isso.
create index if not exists vz_conteudos_banco_idx
    on vz_conteudos(cliente_id, banco_em) where banco_em is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- O CLIENTE NÃO VÊ O BANCO
--
-- Ele é a gaveta da equipe. Um conteúdo guardado ali não está programado, e
-- aparecer no cronograma dele com data seria pior que não aparecer: viraria
-- promessa de publicação que ninguém fez.
-- ═══════════════════════════════════════════════════════════════════════════
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
           and co.banco_em is null
    )
    select case when not exists (select 1 from c) then null else jsonb_build_object(
        'cliente', (select to_jsonb(c) - 'nota' from c),
        'conteudos', coalesce((
            select jsonb_agg(to_jsonb(i) - 'nota' - 'etiquetas' - 'banco_em') from itens i), '[]'::jsonb),
        'blocos', coalesce((
            select jsonb_agg(to_jsonb(b))
              from vz_blocos b where b.conteudo_id in (select id from itens)), '[]'::jsonb),
        'retornos', coalesce((
            select jsonb_agg(to_jsonb(r))
              from vz_retornos r where r.conteudo_id in (select id from itens)), '[]'::jsonb),
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

revoke all on function vz_visualizacao(text) from anon, public;
grant execute on function vz_visualizacao(text) to anon, authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- select count(*) filter (where banco_em is null) as no_cronograma,
--        count(*) filter (where banco_em is not null) as no_banco
--   from vz_conteudos;
