-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉVIA DO LINK DO CLIENTE — o card do WhatsApp para /c/<cliente>/…
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-previa.sql (usa a função vz_apelido de lá).
-- Pode rodar antes ou depois do deploy: sem esta função, o card continua o
-- genérico (api/previa.js cai no padrão quando ela não responde).
--
-- ── O QUE ELA ENTREGA ─────────────────────────────────────────────────────
-- Para o link de UMA demanda: título, tema, data, status e se ainda está sem
-- data. Para o link do cronograma: só o nome do cliente.
--
-- Nada disso é novo para quem tem o link: a própria tela do cliente
-- (vz_visualizacao) já entrega tudo isto — e muito mais — a qualquer um com o
-- mesmo endereço. Os mesmos filtros valem aqui: cliente ativo, rascunho e
-- banco de temas fora. O que o cliente não vê, o card também não mostra.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function vz_previa_cliente(p_token text, p_ref text default null)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    with cl as (
        select * from vz_clientes
         where (token = p_token or apelido = p_token) and ativo is true
         limit 1
    ), partes as (
        select split_part(coalesce(p_ref, ''), '/', 1) as a,
               split_part(coalesce(p_ref, ''), '/', 2) as b
    ), alvo as (
        -- "mes/apelido", só "apelido" ou o id cru — as formas que a tela do
        -- cliente aceita (pages/cliente.js, acharPorEndereco).
        select case when b = '' then null else a end as mes,
               case when b = '' then a else b end as apelido
          from partes
    )
    select case
        when not exists (select 1 from cl) then null
        when coalesce(p_ref, '') = '' then jsonb_build_object('cliente', (select nome from cl))
        else (
            select jsonb_build_object(
                       'cliente',  cl.nome,
                       'titulo',   co.titulo,
                       'tema',     co.tema,
                       'data',     co.data,
                       'status',   co.status,
                       'sem_data', exists (select 1 from unnest(coalesce(co.etiquetas, '{}')) e
                                            where lower(trim(e)) = 'aguardando data'))
              from vz_conteudos co
              join cl on co.cliente_id = cl.id
              cross join alvo
             where co.status <> 'rascunho'
               and co.banco_em is null
               and (co.id = p_ref or vz_apelido(co.titulo) = alvo.apelido)
             order by (co.id = p_ref) desc,
                      (alvo.mes is not null and to_char(co.data, 'MM') = case alvo.mes
                            when 'jan' then '01' when 'fev' then '02' when 'mar' then '03'
                            when 'abr' then '04' when 'mai' then '05' when 'jun' then '06'
                            when 'jul' then '07' when 'ago' then '08' when 'set' then '09'
                            when 'out' then '10' when 'nov' then '11' when 'dez' then '12' end) desc,
                      co.data, co.criado_em
             limit 1)
    end;
$$;

grant execute on function vz_previa_cliente(text, text) to anon;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Troque pelo apelido/token do cliente e pelo final do link de uma demanda:
-- select vz_previa_cliente('chronos-daniel-winter');
-- select vz_previa_cliente('chronos-daniel-winter', 'set/titulo-da-demanda');
