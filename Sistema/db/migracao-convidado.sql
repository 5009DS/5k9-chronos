-- ═══════════════════════════════════════════════════════════════════════════
-- LINK DE CONVIDADO — uma demanda aberta para quem não tem login
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-drive.sql. RODE ANTES DO DEPLOY: o sistema novo grava
-- a coluna ao criar um convite.
--
-- Para o freelancer que vai editar UMA peça: ele recebe um endereço secreto
-- (/d/<token>) e vê aquela demanda, só para leitura — título, cliente, data,
-- formato, etapa, intenção, roteiro e o Drive. Nada além dela: nem outras
-- demandas, nem a anotação interna, nem a conversa com o cliente.
--
-- ── COMO O LINK DO CLIENTE (vz_visualizacao), E POR QUÊ ───────────────────
-- Mesmo desenho: o anônimo não lê tabela nenhuma; ele só pergunta "o que
-- existe para ESTE token", a uma função security definer que devolve a
-- resposta já recortada. Token de 10 caracteres de um alfabeto de 31
-- (store.js, gerarToken) — não é adivinhável.
--
-- Desativar é apagar o token: o link para de responder na hora. Gerar outro é
-- trocar o token — o antigo morre junto.
--
-- ── O TOKEN NÃO PODE VAZAR PELO LINK DO CLIENTE ───────────────────────────
-- vz_visualizacao entrega cada conteúdo inteiro, menos o que ela recorta. Sem
-- o recorte de convite_token, o cliente leria o token no navegador e abriria o
-- link de convidado — que mostra o Drive. A função abaixo é a de
-- db/migracao-drive.sql com uma única diferença: `- 'convite_token'`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_conteudos add column if not exists convite_token text;
create unique index if not exists vz_conteudos_convite_idx on vz_conteudos(convite_token)
    where convite_token is not null;

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
                (to_jsonb(i) - 'nota' - 'banco_em' - 'drive_url' - 'convite_token')
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

create or replace function vz_convidado(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
    select case when co.id is null then null else jsonb_build_object(
        'conteudo', jsonb_build_object(
            'id',        co.id,
            'titulo',    co.titulo,
            'tema',      co.tema,
            'fase',      co.fase,
            'objetivo',  co.objetivo,
            'formato',   co.formato,
            'data',      co.data,
            'intencao',  co.intencao,
            'etiquetas', to_jsonb(coalesce(co.etiquetas, '{}')),
            'drive_url', co.drive_url),
        'cliente', cl.nome,
        'blocos', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'id', b.id, 'tipo', b.tipo, 'titulo', b.titulo,
                       'texto', b.texto, 'ordem', b.ordem, 'criado_em', b.criado_em)
                   order by b.ordem, b.criado_em)
              from vz_blocos b where b.conteudo_id = co.id), '[]'::jsonb)
    ) end
      from vz_conteudos co
      join vz_clientes cl on cl.id = co.cliente_id
     -- Token curto demais não é token: protege contra ''/null casando algo.
     where length(coalesce(p_token, '')) >= 8
       and co.convite_token = p_token
     limit 1;
$$;

grant execute on function vz_convidado(text) to anon;

-- ── Conferência ───────────────────────────────────────────────────────────
-- 1) O cliente NÃO pode receber o token (troque TOKEN pelo de um cliente):
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.conteudos[*].convite_token');
-- 2) Um convite criado no sistema responde (troque pelo final do link /d/…):
-- select vz_convidado('CONVITE');
