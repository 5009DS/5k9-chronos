-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 CHRONOS — apelido no link do cliente.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms (o mesmo do schema.sql).
-- Em banco novo não é preciso: o schema.sql já cria a coluna.
--
-- Antes:  chronos.5k9.studio/c/k7mqp3xz9a
-- Depois: chronos.5k9.studio/c/dra-fernanda-k7mq
--
-- ── O QUE ISTO TROCA ──────────────────────────────────────────────────────
-- O token de dez caracteres aleatórios não é adivinhável. Um apelido legível
-- é — e esse link abre o cronograma inteiro do cliente. Por isso:
--
--   · o apelido é OPCIONAL e nasce vazio;
--   · o token continua valendo em paralelo, sempre. Apagar o apelido não
--     quebra nada que já foi mandado;
--   · a interface sugere um sufixo de quatro caracteres do próprio token
--     ("dra-fernanda-k7mq"), que é legível e continua imprevisível.
--
-- A decisão de usar apelido puro é de quem escolhe, e a tela avisa antes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_clientes add column if not exists apelido text;

-- Único, mas permitindo vários nulos: a maioria dos clientes não terá apelido,
-- e um `unique` comum já aceita nulos repetidos no Postgres. O índice parcial
-- deixa isso explícito e evita varrer linhas que não interessam.
create unique index if not exists vz_clientes_apelido_idx
    on vz_clientes(apelido) where apelido is not null;

-- ── As duas funções passam a aceitar apelido OU token ─────────────────────
-- Um parâmetro só, resolvido pelos dois caminhos: o app manda o que estiver na
-- URL e não precisa saber qual dos dois é.

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
        'conteudos', coalesce((select jsonb_agg(to_jsonb(i)) from itens i), '[]'::jsonb),
        'blocos', coalesce((
            select jsonb_agg(to_jsonb(b))
              from vz_blocos b where b.conteudo_id in (select id from itens)), '[]'::jsonb),
        'retornos', coalesce((
            select jsonb_agg(to_jsonb(r))
              from vz_retornos r where r.conteudo_id in (select id from itens)), '[]'::jsonb),
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

create or replace function vz_registrar_retorno(
    p_token    text,
    p_conteudo text,
    p_tipo     text,
    p_texto    text default null,
    p_autor    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text;
    v_retorno jsonb;
begin
    if p_tipo not in ('aprovado', 'ajuste') then
        raise exception 'Tipo de retorno inválido.';
    end if;

    select co.id into v_id
      from vz_conteudos co
      join vz_clientes cl on cl.id = co.cliente_id
     where co.id = p_conteudo
       and (cl.token = p_token or cl.apelido = p_token)
       and cl.ativo is true
       and co.status <> 'rascunho';

    if v_id is null then
        raise exception 'Este link não está mais válido para este conteúdo.';
    end if;

    insert into vz_retornos (conteudo_id, tipo, texto, autor)
         values (v_id, p_tipo,
                 nullif(trim(coalesce(p_texto, '')), ''),
                 nullif(trim(coalesce(p_autor, '')), ''))
      returning to_jsonb(vz_retornos.*) into v_retorno;

    update vz_conteudos
       set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end
     where id = v_id;

    return v_retorno;
end;
$$;

revoke all on function vz_visualizacao(text)                              from anon, public;
revoke all on function vz_registrar_retorno(text, text, text, text, text) from anon, public;
grant execute on function vz_visualizacao(text)                              to anon, authenticated;
grant execute on function vz_registrar_retorno(text, text, text, text, text) to anon, authenticated;
