-- ═══════════════════════════════════════════════════════════════════════════
-- ETIQUETAS — o estado do conteúdo que o sistema NÃO conhece.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
--
-- ── O PEDIDO, E POR QUE ELE NÃO VIRA UM STATUS NOVO ───────────────────────
-- O fluxo real hoje: cria-se a demanda, escreve-se o roteiro, manda-se para a
-- médica aprovar e SÓ DEPOIS se define o dia em que aquilo vai ao ar. Faltava
-- um jeito de dizer isso na tela.
--
-- A saída óbvia seria acrescentar "a gravar" e "aguardando data" ao `status`.
-- Seria errado, e o próprio pedido explica por quê: "essa dinâmica pode mudar
-- futuramente e não quero ter que voltar atrás". Todo valor novo de `status`
-- vira regra em código — o cliente vê ou não vê, o cartão pinta de tal cor, a
-- função do banco move para tal estado. Mudar a dinâmica passaria a exigir
-- migração, deploy e revisão das telas.
--
-- `status` continua sendo o que ele sempre foi: a conversa com o CLIENTE
-- (rascunho → em revisão → aprovado/ajuste → publicado). São cinco porque a
-- tela pública depende de cada um deles.
--
-- Etiqueta é a outra metade: o estado INTERNO, que só a equipe vê e que o
-- sistema não interpreta. Texto livre, sem cadastro prévio, sem ordem, sem
-- transição válida. "a gravar", "gravado", "aguardando data", "esperando
-- imagem do cliente" — o que a equipe precisar, no dia em que precisar, sem
-- passar por aqui de novo.
--
-- ── POR QUE text[] E NÃO UMA TABELA ───────────────────────────────────────
-- Uma tabela de etiquetas pediria cadastro, id, tela de gerência e uma junção
-- em toda leitura — para guardar duas palavras. As etiquetas que existem são
-- as que estão em uso: a interface as descobre lendo os conteúdos do cliente.
-- Quando ninguém mais usa uma, ela some sozinha, que é o comportamento certo
-- para um vocabulário que muda.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists etiquetas text[];

-- Índice GIN: a busca "quais conteúdos têm a etiqueta X" é contenção de array,
-- e sem ele o Postgres varre a tabela. Barato agora, caro de lembrar depois.
create index if not exists vz_conteudos_etiquetas_idx
    on vz_conteudos using gin (etiquetas);

-- ═══════════════════════════════════════════════════════════════════════════
-- E O CLIENTE NÃO RECEBE ETIQUETA NENHUMA
--
-- Pelo mesmo motivo que ele não recebe a `nota` do cadastro: é anotação
-- interna. "esperando imagem do cliente" e "refazer, ficou ruim" são recados
-- da equipe para a equipe, e a função pública mandava o conteúdo inteiro.
--
-- Segurança que depende de a interface não desenhar o campo dura até a
-- próxima tela. O recorte é feito aqui.
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
    )
    select case when not exists (select 1 from c) then null else jsonb_build_object(
        'cliente', (select to_jsonb(c) - 'nota' from c),
        'conteudos', coalesce((
            select jsonb_agg(to_jsonb(i) - 'nota' - 'etiquetas') from itens i), '[]'::jsonb),
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
-- select unnest(etiquetas) as etiqueta, count(*) from vz_conteudos
--  where etiquetas is not null group by 1 order by 2 desc;
