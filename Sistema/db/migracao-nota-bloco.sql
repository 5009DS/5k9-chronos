-- ═══════════════════════════════════════════════════════════════════════════
-- ANOTAÇÃO DA EQUIPE PRESA A UMA FALA
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
-- deploy: a tela do roteiro passa a gravar `nota` nos blocos.
--
-- nota   recado da equipe sobre AQUELA fala ("trocar o exemplo", "ela pediu
--        para falar mais devagar aqui"). Fica pendurado no bloco, não é bloco.
--        Nunca vai para o cliente: a função abaixo é a de
--        db/migracao-roteiro-interno.sql com `- 'nota'` nos blocos.
--        O link do editor convidado (vz_convidado) já escolhe campo a campo e
--        não inclui a nota.
--
-- A anotação do CONTEÚDO inteiro usa a coluna que já existia
-- (vz_conteudos.nota), que a função sempre recortou.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_blocos add column if not exists nota text;

-- O tipo de bloco 'anotacao' durou um dia e saiu. Se alguém criou um, ele
-- vira uma linha ESCONDIDA: a equipe continua vendo (com o selo), o cliente não.
update vz_blocos set tipo = 'fala', escondido = true where tipo = 'anotacao';

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
            select jsonb_agg(to_jsonb(b) - 'nota')
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
-- Troque pelo token de um cliente: tem de voltar [].
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.blocos[*].nota');
