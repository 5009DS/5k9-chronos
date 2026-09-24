-- ═══════════════════════════════════════════════════════════════════════════
-- PRÉVIA DO LINK — o card que o WhatsApp mostra ao colar o link de uma demanda
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Pode rodar antes ou depois do deploy: sem esta função, o card continua o
-- genérico de sempre (api/previa.js cai no padrão quando ela não responde).
--
-- ── O QUE ELA ENTREGA, E POR QUE SÓ ISSO ──────────────────────────────────
-- O WhatsApp monta o card visitando o link SEM login. Então quem responde a
-- ele é o papel anônimo, e tudo o que esta função devolve é, na prática,
-- público para quem tem o endereço. Por isso ela devolve só o que cabe num
-- card: título, nome do cliente, data e formato. Nada de roteiro, nota,
-- etapa ou Drive.
--
-- E ela só responde a quem JÁ SABE o endereço: o apelido do endereço é o
-- próprio título ("/conteudo/set/desequilibrio-hormonal"), e o id é um uuid.
-- Não há busca por pedaço, nem listagem: uma referência, no máximo uma linha.
--
-- ── O APELIDO, DO MESMO JEITO QUE O NAVEGADOR FAZ ─────────────────────────
-- lib/formato.js (apelidoDeTexto): sem acento, minúsculo, o que não é letra
-- ou número vira hífen, sem hífen nas pontas, até 80 caracteres. O translate
-- abaixo cobre os acentos do português; o navegador usa normalize('NFD').
-- Se a regra de lá mudar, esta muda junto — senão o card some em silêncio
-- (o sistema continua abrindo a demanda normalmente).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function vz_apelido(p_texto text)
returns text
language sql
immutable
as $$
    select coalesce(nullif(
        regexp_replace(
            left(
                regexp_replace(
                    regexp_replace(
                        lower(translate(coalesce(p_texto, ''),
                            'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                            'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')),
                        '[^a-z0-9]+', '-', 'g'),
                    '(^-+|-+$)', '', 'g'),
                80),
            '-+$', ''),
        ''), 'sem-titulo');
$$;

create or replace function vz_previa(p_ref text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    with partes as (
        select split_part(p_ref, '/', 1) as a, split_part(p_ref, '/', 2) as b
    ), alvo as (
        -- "mes/apelido" ou só "apelido" ou o id cru — as três formas que o
        -- roteador aceita (lib/rotas.js, acharPorEndereco).
        select case when b = '' then null else a end as mes,
               case when b = '' then a else b end as apelido
          from partes
    )
    select jsonb_build_object(
               'titulo',  co.titulo,
               'cliente', cl.nome,
               'data',    co.data,
               'formato', co.formato)
      from vz_conteudos co
      join vz_clientes cl on cl.id = co.cliente_id
      cross join alvo
     where co.id = p_ref
        or vz_apelido(co.titulo) = alvo.apelido
     order by (co.id = p_ref) desc,
              -- o mês do endereço desempata homônimos, como no navegador
              (alvo.mes is not null and to_char(co.data, 'MM') = case alvo.mes
                    when 'jan' then '01' when 'fev' then '02' when 'mar' then '03'
                    when 'abr' then '04' when 'mai' then '05' when 'jun' then '06'
                    when 'jul' then '07' when 'ago' then '08' when 'set' then '09'
                    when 'out' then '10' when 'nov' then '11' when 'dez' then '12' end) desc,
              co.data, co.criado_em
     limit 1;
$$;

-- O card é pedido sem login.
grant execute on function vz_previa(text) to anon;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Troque pelo final do link de uma demanda (o que vem depois de /conteudo/):
-- select vz_previa('set/desequilibrio-hormonal');
