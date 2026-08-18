-- ═══════════════════════════════════════════════════════════════════════════
-- O CLIENTE PASSA A VER AS ETIQUETAS DE PRODUÇÃO
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-etiquetas.sql e db/migracao-banco-temas.sql.
--
-- ── POR QUE ELAS ESTAVAM CORTADAS ─────────────────────────────────────────
-- Etiqueta nasceu como recado da equipe para a equipe, e o corte era certo
-- para o campo INTEIRO: "refazer, ficou ruim" e "cliente não respondeu" não
-- podem aparecer no cronograma de ninguém.
--
-- ── E POR QUE PARTE DELAS PASSA ───────────────────────────────────────────
-- Sete etiquetas dizem em que pé está a produção — "a gravar", "gravado", "em
-- edição". É exatamente a pergunta que o cliente faz por WhatsApp, e escondê-la
-- da tela feita para respondê-la não protege nada.
--
-- ── A LISTA MORA AQUI, E ISSO É PROPOSITAL ────────────────────────────────
-- Ela existe também em lib/etiquetas.js, marcada com `publica: true`. Duas
-- listas é duplicação, e a duplicação é o preço de o recorte ser REAL: se o
-- filtro fosse feito na interface, a etiqueta interna continuaria viajando no
-- JSON, e "a tela não desenha" é uma garantia que dura até a próxima tela.
--
-- Quem manda é esta lista. Se as duas discordarem, o cliente vê o que ESTE
-- arquivo permite — e o que precisa ser corrigido é este arquivo.
--
-- `lower(trim(...))`: a etiqueta é digitada por gente. "A Gravar" e "a gravar "
-- são a mesma coisa para quem lê o cartão, e seria estranho que só uma delas
-- chegasse do outro lado.
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
            select jsonb_agg(
                (to_jsonb(i) - 'nota' - 'banco_em')
                || jsonb_build_object('etiquetas', coalesce(to_jsonb(array(
                       select e from unnest(coalesce(i.etiquetas, '{}')) e
                        where lower(trim(e)) = any (array[
                            'roteiro em aprovação',
                            'roteiro aprovado',
                            'a gravar',
                            'gravado',
                            'em edição',
                            'aguardando data',
                            'aguardando material'
                        ])
                   )), '[]'::jsonb))
            ) from itens i), '[]'::jsonb),
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
-- Troque pelo token de um cliente e veja o que sai:
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.conteudos[*].etiquetas');
