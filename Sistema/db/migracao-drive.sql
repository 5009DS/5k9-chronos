-- ═══════════════════════════════════════════════════════════════════════════
-- LINK DO DRIVE EM CADA CONTEÚDO
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-etapa-unica.sql. RODE ANTES DO DEPLOY: o sistema novo
-- grava a coluna, e o banco recusa gravar numa coluna que não existe.
--
-- Onde está o material bruto (vídeo gravado, pasta da arte) de cada peça. Quem
-- pega a demanda para editar abre o link ali mesmo, em vez de procurar a pasta
-- ou perguntar no grupo.
--
-- ── É DA EQUIPE, NÃO DO CLIENTE ───────────────────────────────────────────
-- A tela do cliente recebe cada conteúdo INTEIRO pela função abaixo, menos o
-- que ela recorta. Coluna nova que não fosse recortada iria parar no celular
-- dele. A função é a mesma de db/migracao-pronto-para-publicar.sql com uma
-- única diferença: `- 'drive_url'`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists drive_url text;

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
           -- O banco de temas é gaveta da equipe: conteúdo guardado não está
           -- programado, e mostrá-lo com data viraria promessa que ninguém fez.
           and co.banco_em is null
    )
    select case when not exists (select 1 from c) then null else jsonb_build_object(
        'cliente', (select to_jsonb(c) - 'nota' from c),
        -- `- 'nota' - 'etiquetas'`: as duas são anotação interna do estúdio e
        -- iam inteiras para o navegador do cliente. Mesmo motivo do recorte da
        -- nota do cadastro, logo abaixo.
        'conteudos', coalesce((
            select jsonb_agg(
                (to_jsonb(i) - 'nota' - 'banco_em' - 'drive_url')
                -- Só as etiquetas de PRODUÇÃO passam. O texto livre é recado da
                -- equipe para a equipe e fica deste lado. A mesma lista existe
                -- em lib/etiquetas.js; quem manda é esta.
                -- Ver db/migracao-etiquetas-cliente.sql.
                || jsonb_build_object('etiquetas', coalesce(to_jsonb(array(
                       select e from unnest(coalesce(i.etiquetas, '{}')) e
                        where lower(trim(e)) = any (array[
                            'roteiro em desenvolvimento',
                            'roteiro em aprovação', 'roteiro aprovado',
                            -- esteira de vídeo
                            'a gravar', 'gravado', 'em edição', 'gravação aguardando aprovação',
                            -- esteira de carrossel
                            'a diagramar', 'arte pronta', 'arte aguardando aprovação',
                            -- comuns
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
        -- O diretório vigente viaja junto. A tela do cliente é feita de
        -- explicação estratégica, e ela precisa ser a MESMA que a equipe
        -- publicou — não a que estava embutida no código no dia do deploy.
        -- Numa ida só: quem abre isso está no celular, em rede de operadora, e
        -- uma segunda requisição é meio segundo de tela pela metade.
        'diretorio', (select d.pacote from vz_diretorio d where d.id = 'atual')
    ) end;
$$;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Troque pelo token de um cliente: a chave drive_url NÃO pode aparecer.
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.conteudos[*].drive_url');
