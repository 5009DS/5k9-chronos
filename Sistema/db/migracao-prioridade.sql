-- ═══════════════════════════════════════════════════════════════════════════
-- A DEMANDA COMO TAREFA — prioridade, quem cuida e checklist.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, DEPOIS de
-- db/migracao-login-google.sql e ANTES do deploy: a ficha nova grava estas
-- colunas.
--
-- prioridade    urgente | alta | normal | baixa, ou vazio ("ninguém disse").
-- responsaveis  ids de vz_equipe, vários por demanda. Sem chave estrangeira,
--               pelo mesmo motivo de vz_pedidos.responsaveis: ninguém é
--               apagado da equipe, só desativado. O `responsavel` antigo (um
--               nome vindo do Gestor) fica onde está.
-- checklist     [{ id, texto, feito }]. Lista dentro da demanda, e não
--               tabela: os itens não têm dono, prazo nem vida própria.
--
-- Nada disso é do cliente: a função do link dele recorta as três colunas.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists prioridade text;
alter table vz_conteudos drop constraint if exists vz_conteudos_prioridade_check;
alter table vz_conteudos add constraint vz_conteudos_prioridade_check
    check (prioridade is null or prioridade in ('urgente', 'alta', 'normal', 'baixa'));

alter table vz_conteudos add column if not exists responsaveis text[] not null default '{}';
alter table vz_conteudos add column if not exists checklist jsonb not null default '[]'::jsonb;

-- O filtro "Comigo" do quadro pergunta "quais demandas têm este id".
create index if not exists vz_conteudos_responsaveis on vz_conteudos using gin (responsaveis);

-- ═══════════════════════════════════════════════════════════════════════════
-- O CLIENTE NÃO VÊ PRIORIDADE, QUEM CUIDA NEM CHECKLIST
-- A mesma função de db/migracao-login-google.sql, com mais três recortes.
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
              from vz_blocos b where b.conteudo_id in (select id from itens)), '[]'::jsonb),
        'retornos', coalesce((
            select jsonb_agg(to_jsonb(r))
              from vz_retornos r where r.conteudo_id in (select id from itens)), '[]'::jsonb),
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

-- ── Conferência ──
-- select prioridade, responsaveis, checklist from vz_conteudos limit 5;
