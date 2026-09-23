-- ═══════════════════════════════════════════════════════════════════════════
-- ETAPA ÚNICA — a etapa decide, o status é consequência
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-pronto-para-publicar.sql.
--
-- ── O QUE MUDOU ───────────────────────────────────────────────────────────
-- A peça tinha dois vocabulários escolhidos à parte — status (a conversa com o
-- cliente) e etiquetas (a produção) — e regras de ida e volta tentando mantê-
-- los de acordo. Agora a equipe escolhe só a ETAPA, e o status sai dela
-- (lib/etiquetas.js, statusDaEtapa):
--
--   sem etapa                      rascunho
--   roteiro em desenvolvimento     desenvolvimento
--   roteiro em aprovação           em_revisao
--   roteiro aprovado               aprovado
--   a gravar … em edição, revisão  aprovado se o cliente aprovou o roteiro,
--                                  senão desenvolvimento
--   gravação/arte em aprovação     em_revisao
--   pronto para publicar           pronto
--   publicado                      publicado
--
--   "ajuste" é a única exceção: é o cliente falando, fica por cima da etapa
--   em que o pedido chegou.
--
-- A coluna `status` continua existindo: a tela do cliente e as funções abaixo
-- leem dela. Ninguém a escolhe mais à mão.
--
-- ── ESTE ARQUIVO FAZ DUAS COISAS ──────────────────────────────────────────
--   1. Corrige a aprovação do cliente. Aprovar a GRAVAÇÃO ou a ARTE final caía
--      na regra do roteiro e devolvia a peça para "a gravar". Agora vai para
--      "pronto para publicar".
--   2. Converte as peças existentes para o modelo novo (uma etapa + as
--      pendências "aguardando data/material"). Etiquetas livres vão para a
--      anotação interna, com o texto "Etiquetas antigas: …". Peça em RASCUNHO
--      continua invisível para o cliente: se tinha etapa, a etapa vai para a
--      nota e a peça fica sem etapa.
--
-- É seguro rodar duas vezes: a conversão não mexe em peça que já está certa.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ordem das etapas — o mesmo número de lib/etiquetas.js.
create or replace function vz_ordem_etapa(p_nome text)
returns numeric
language sql
immutable
as $$
    select case lower(trim(p_nome))
        when 'roteiro em desenvolvimento'      then 0.5
        when 'roteiro em aprovação'            then 1
        when 'roteiro aprovado'                then 2
        when 'a gravar'                        then 3
        when 'a diagramar'                     then 3
        when 'gravado'                         then 4
        when 'arte pronta'                     then 4
        when 'em edição'                       then 5
        when 'gravação aguardando aprovação'   then 6
        when 'arte aguardando aprovação'       then 6
        when 'revisão'                         then 6.5
        when 'pronto para publicar'            then 6.8
        when 'publicado'                       then 7
    end;
$$;

-- A etapa mais adiantada de uma lista de etiquetas, ou null.
create or replace function vz_etapa_de(p_etiquetas text[])
returns text
language sql
immutable
as $$
    select lower(trim(e)) from unnest(coalesce(p_etiquetas, '{}')) e
     where vz_ordem_etapa(e) is not null
     order by vz_ordem_etapa(e) desc
     limit 1;
$$;

-- A lista sem nenhuma etapa (ficam pendências e o resto).
create or replace function vz_sem_etapa(p_etiquetas text[])
returns text[]
language sql
immutable
as $$
    select coalesce(array(
        select e from unnest(coalesce(p_etiquetas, '{}')) e
         where vz_ordem_etapa(e) is null
    ), '{}');
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A APROVAÇÃO DO CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function vz_registrar_retorno(
    p_token    text,
    p_conteudo text,
    p_tipo     text,
    p_texto    text default null,
    p_autor    text default null,
    p_bloco    text default null,
    p_trecho   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id text;
    v_bloco text;
    v_retorno jsonb;
    v_etiquetas text[];
    v_formato text;
    v_etapa text;
    v_produzir text;
begin
    if p_tipo not in ('aprovado', 'ajuste') then
        raise exception 'Tipo de retorno inválido.';
    end if;

    -- O conteúdo precisa pertencer ao cliente DAQUELE token.
    select co.id into v_id
      from vz_conteudos co
      join vz_clientes cl on cl.id = co.cliente_id
     where co.id = p_conteudo
       and (cl.token = p_token or cl.apelido = p_token)
       and cl.ativo is true
       and co.status <> 'rascunho'
       and co.banco_em is null;

    if v_id is null then
        raise exception 'Este link não está mais válido para este conteúdo.';
    end if;

    -- Gravado fecha o pedido de MUDANÇA; aprovar continua valendo.
    if p_tipo = 'ajuste' and exists (
        select 1 from vz_conteudos co, unnest(coalesce(co.etiquetas, '{}')) e
         where co.id = v_id and lower(trim(e)) = 'gravado'
    ) then
        raise exception 'Este conteúdo já foi gravado — o roteiro não muda mais. Fale com a equipe se precisar de algo.';
    end if;

    if p_bloco is not null then
        select b.id into v_bloco
          from vz_blocos b
         where b.id = p_bloco and b.conteudo_id = v_id;
    end if;

    insert into vz_retornos (conteudo_id, tipo, texto, autor, bloco_id, trecho, origem)
         values (v_id, p_tipo,
                 nullif(trim(coalesce(p_texto, '')), ''),
                 nullif(trim(coalesce(p_autor, '')), ''),
                 v_bloco,
                 nullif(trim(coalesce(p_trecho, '')), ''),
                 'cliente')
      returning to_jsonb(vz_retornos.*) into v_retorno;

    -- Só o retorno sobre o conteúdo INTEIRO move a peça.
    if v_bloco is null then
        if p_tipo = 'ajuste' then
            -- O pedido fica por cima da etapa em que chegou.
            update vz_conteudos set status = 'ajuste' where id = v_id;
        else
            select coalesce(etiquetas, '{}'), formato into v_etiquetas, v_formato
              from vz_conteudos where id = v_id;
            v_etapa := vz_etapa_de(v_etiquetas);
            -- O mesmo padrão de lib/etiquetas.js (esteiraDe).
            v_produzir := case when v_formato ~* 'carro?ss?el|carousel|est[áa]tico|imagem|foto|arte|infogr[áa]fico'
                               then 'a diagramar' else 'a gravar' end;

            if v_etapa in ('gravação aguardando aprovação', 'arte aguardando aprovação') then
                -- Aprovou a peça final: está pronta, só falta a data.
                update vz_conteudos
                   set etiquetas = vz_sem_etapa(v_etiquetas) || array['pronto para publicar'],
                       status = 'pronto'
                 where id = v_id;
            elsif vz_ordem_etapa(v_etapa) >= 3 then
                -- Já em produção ou adiante: aprovar confirma, não empurra para trás.
                update vz_conteudos
                   set status = case v_etapa when 'pronto para publicar' then 'pronto'
                                             when 'publicado' then 'publicado'
                                             else 'aprovado' end
                 where id = v_id;
            else
                -- Aprovou o roteiro: vai para a produção.
                update vz_conteudos
                   set etiquetas = vz_sem_etapa(v_etiquetas) || array[v_produzir],
                       status = 'aprovado'
                 where id = v_id;
            end if;
        end if;
    end if;

    return v_retorno;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CONVERSÃO DAS PEÇAS EXISTENTES — o espelho de normalizarPeca()
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
    r record;
    v_etapa text;
    v_carrossel boolean;
    v_pend text[];
    v_livres text[];
    v_aprovou boolean;
    v_status text;
    v_etiquetas text[];
    v_nota text;
begin
    for r in select * from vz_conteudos loop
        v_carrossel := coalesce(r.formato, '') ~* 'carro?ss?el|carousel|est[áa]tico|imagem|foto|arte|infogr[áa]fico';
        v_etapa := vz_etapa_de(r.etiquetas);

        v_pend := coalesce(array(
            select distinct lower(trim(e)) from unnest(coalesce(r.etiquetas, '{}')) e
             where lower(trim(e)) in ('aguardando data', 'aguardando material')
        ), '{}');
        v_livres := coalesce(array(
            select e from unnest(coalesce(r.etiquetas, '{}')) e
             where vz_ordem_etapa(e) is null
               and lower(trim(e)) not in ('aguardando data', 'aguardando material')
        ), '{}');

        -- Rascunho continua invisível: a etapa vai para a nota.
        if r.status = 'rascunho' and v_etapa is not null then
            v_livres := v_livres || ('etapa antes da etapa única: ' || v_etapa);
            v_etapa := null;
        end if;

        if v_etapa is null then
            v_etapa := case r.status
                when 'desenvolvimento' then 'roteiro em desenvolvimento'
                when 'em_revisao'      then 'roteiro em aprovação'
                when 'ajuste'          then 'roteiro em aprovação'
                when 'aprovado'        then 'roteiro aprovado'
                when 'pronto'          then 'pronto para publicar'
                when 'publicado'       then 'publicado'
            end;
        end if;
        if r.status = 'publicado' then v_etapa := 'publicado'; end if;
        if r.status = 'pronto' and v_etapa is distinct from 'publicado' then v_etapa := 'pronto para publicar'; end if;

        -- Etapa da outra esteira vira a equivalente.
        if v_carrossel then
            v_etapa := case v_etapa when 'a gravar' then 'a diagramar'
                                    when 'gravado' then 'arte pronta'
                                    when 'gravação aguardando aprovação' then 'arte aguardando aprovação'
                                    else v_etapa end;
        else
            v_etapa := case v_etapa when 'a diagramar' then 'a gravar'
                                    when 'arte pronta' then 'gravado'
                                    when 'arte aguardando aprovação' then 'gravação aguardando aprovação'
                                    else v_etapa end;
        end if;

        v_aprovou := r.status in ('aprovado', 'pronto', 'publicado') or exists (
            select 1 from vz_retornos x
             where x.conteudo_id = r.id and x.bloco_id is null
               and x.tipo = 'aprovado' and coalesce(x.origem, 'cliente') = 'cliente');

        v_status := case
            when v_etapa is null                                   then 'rascunho'
            when v_etapa = 'roteiro em desenvolvimento'            then 'desenvolvimento'
            when v_etapa = 'pronto para publicar'                  then 'pronto'
            when v_etapa = 'publicado'                             then 'publicado'
            when v_etapa in ('roteiro em aprovação', 'gravação aguardando aprovação',
                             'arte aguardando aprovação')          then 'em_revisao'
            when v_etapa = 'roteiro aprovado'                      then 'aprovado'
            when v_aprovou                                         then 'aprovado'
            else 'desenvolvimento'
        end;
        -- O pedido de ajuste sobrevive quando a peça ainda está com o cliente.
        if r.status = 'ajuste' and v_status = 'em_revisao' then v_status := 'ajuste'; end if;

        v_etiquetas := case when v_etapa is null then '{}'::text[] else array[v_etapa] end || v_pend;
        v_nota := case when cardinality(v_livres) > 0
                       then concat_ws(E'\n', nullif(r.nota, ''), 'Etiquetas antigas: ' || array_to_string(v_livres, '; '))
                       else r.nota end;

        if v_status is distinct from r.status
           or v_etiquetas is distinct from coalesce(r.etiquetas, '{}')
           or v_nota is distinct from r.nota then
            update vz_conteudos
               set status = v_status, etiquetas = v_etiquetas, nota = v_nota
             where id = r.id;
        end if;
    end loop;
end;
$$;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Depois de rodar, isto deve devolver zero linhas (peças com mais de uma etapa):
-- select id, titulo, etiquetas from vz_conteudos
--  where (select count(*) from unnest(etiquetas) e where vz_ordem_etapa(e) is not null) > 1;
