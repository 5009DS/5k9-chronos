-- ═══════════════════════════════════════════════════════════════════════════
-- ROTEIRO COM PARTES SÓ DA EQUIPE — linha escondida e anotação interna.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
-- deploy: a tela do roteiro passa a gravar `escondido`.
--
-- escondido   a linha continua no roteiro da equipe (apagada, com o selo
--             "escondida"), mas não vai para o link do cliente.
-- 'anotacao'  um tipo novo de bloco. Não precisa de coluna: o tipo é texto.
--             Nunca vai para o cliente, esteja escondido ou não.
--
-- A função do link do cliente é a mesma de db/migracao-prioridade.sql, com
-- o filtro novo nos blocos. O link do editor convidado (/d/) continua vendo
-- tudo: ele trabalha com a equipe.
--
-- ── AO VIVO ───────────────────────────────────────────────────────────────
-- A atualização em tempo real da tela do cliente usa o Broadcast do Supabase
-- Realtime, que não precisa de tabela nem de migração. Se a tela não se
-- atualizar na hora, confira em Project Settings → Realtime se "Allow public
-- access" está ligado (a tela relê sozinha a cada 30s de qualquer jeito).
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_blocos add column if not exists escondido boolean not null default false;

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
                (to_jsonb(i) - 'nota' - 'banco_em' - 'drive_url' - 'convite_token'
                             - 'criado_por' - 'avisado_em'
                             - 'prioridade' - 'responsaveis' - 'checklist')
                || jsonb_build_object('etiquetas', coalesce(to_jsonb(array(
                       select e from unnest(coalesce(i.etiquetas, '{}')) e
                        where lower(trim(e)) = any (array[
                            'roteiro em desenvolvimento',
                            'roteiro em aprovação', 'roteiro aprovado',
                            'a gravar', 'gravado', 'em edição', 'gravação aguardando aprovação',
                            'a diagramar', 'arte pronta', 'arte aguardando aprovação',
                            'pronto para publicar', 'publicado',
                            'aguardando data', 'aguardando material'
                        ])
                   )), '[]'::jsonb))
            ) from itens i), '[]'::jsonb),
        'blocos', coalesce((
            select jsonb_agg(to_jsonb(b))
              from vz_blocos b
             where b.conteudo_id in (select id from itens)
               -- A linha escondida e a anotação interna são só da equipe.
               and b.escondido is not true
               and b.tipo <> 'anotacao'), '[]'::jsonb),
        'retornos', coalesce((
            select jsonb_agg(to_jsonb(r))
              from vz_retornos r where r.conteudo_id in (select id from itens)), '[]'::jsonb),
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

-- ── Conferência ──
-- Troque pelo token de um cliente: nenhum bloco escondido ou anotação.
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.blocos[*] ? (@.escondido == true || @.tipo == "anotacao")');
