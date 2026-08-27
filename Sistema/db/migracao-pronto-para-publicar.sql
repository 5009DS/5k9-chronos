-- ═══════════════════════════════════════════════════════════════════════════
-- "PRONTO PARA PUBLICAR" CHEGA À TELA DO CLIENTE
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-esteira-carrossel.sql.
--
-- ── O DEGRAU QUE FALTAVA NO FIM ───────────────────────────────────────────
-- Entre "o cliente aprovou a gravação/a arte" e "está no ar" existe um estado
-- que o sistema não sabia dizer: a peça está pronta, finalizada, e só espera a
-- data. Sem ele havia duas saídas ruins — marcar publicado, que é mentira até
-- o post existir, ou deixar em "aguardando aprovação", que continua pedindo
-- alguma coisa a quem já respondeu.
--
-- A etiqueta vale nas duas esteiras: vídeo montado e carrossel diagramado
-- chegam ao mesmo lugar. Ela vem acompanhada de um status de mesmo nome, que
-- não precisa de migração (a coluna é texto livre).
--
-- ── POR QUE O BANCO PRECISA SABER ─────────────────────────────────────────
--   1. A lista do que o cliente pode ver mora dentro de vz_visualizacao, e é
--      ela quem manda: etiqueta fora dali é cortada no servidor. Sem esta
--      migração, a peça pronta chega no celular dele sem dizer que está
--      pronta — que é justamente o recado.
--
--   2. A aprovação do cliente troca a etapa da peça, e a lista de etapas que
--      ela remove é escrita à mão. Sem a nova ali, aprovar deixaria a peça com
--      duas etapas ao mesmo tempo — a contradição que a conferência acusa.
--
-- As duas funções abaixo são as de db/schema.sql com as listas trocadas, e
-- nada mais. Foram copiadas de lá, não reescritas.
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
                (to_jsonb(i) - 'nota' - 'banco_em')
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

-- ═══════════════════════════════════════════════════════════════════════════
-- A APROVAÇÃO TIRA A ETAPA NOVA JUNTO COM AS OUTRAS
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
begin
    if p_tipo not in ('aprovado', 'ajuste') then
        raise exception 'Tipo de retorno inválido.';
    end if;

    -- A checagem é a junção: o conteúdo precisa pertencer ao cliente DAQUELE
    -- token. Sem ela, quem tivesse um link válido poderia aprovar o conteúdo
    -- de qualquer outro cliente mandando o id na mão.
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

    -- Gravado fecha o pedido de MUDANÇA; aprovar continua valendo, porque
    -- "concordo" nunca precisa ser barrado. Esconder o botão na tela é
    -- decoração — quem tem o link e o console chama a função direto. Ver
    -- db/migracao-gravado.sql.
    if p_tipo = 'ajuste' and exists (
        select 1 from vz_conteudos co, unnest(coalesce(co.etiquetas, '{}')) e
         where co.id = v_id and lower(trim(e)) = 'gravado'
    ) then
        raise exception 'Este conteúdo já foi gravado — o roteiro não muda mais. Fale com a equipe se precisar de algo.';
    end if;

    -- `to_jsonb(vz_retornos.*)` e não `to_jsonb(vz_retornos)`: a segunda forma
    -- depende de o nome da tabela estar visível como variável de linha, o que
    -- muda entre versões do Postgres. Com `.*` é a linha inteira, sempre.
    -- O bloco precisa ser DESTE conteúdo: sem a checagem, quem tivesse um
    -- link válido penduraria comentário no roteiro de outro cliente.
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

    -- Só o retorno sobre o conteúdo INTEIRO move o status dele. "Esta fala
    -- ficou boa" é o fim de um assunto, não a aprovação da peça — e o
    -- cronograma da equipe não pode passar a dizer "aprovado" por causa disso.
    if v_bloco is null then
        update vz_conteudos
           set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end,
               -- A aprovação empurra a produção: tira "roteiro em aprovação",
               -- põe "roteiro aprovado" e "a gravar". Nunca numa peça já
               -- gravada — devolver "a gravar" ali mandaria gravar de novo o
               -- que está pronto. Ver db/migracao-aprovado-etiquetas.sql.
               etiquetas = case
                   when p_tipo = 'aprovado' and not exists (
                       select 1 from unnest(coalesce(etiquetas, '{}')) g
                        where lower(trim(g)) = 'gravado'
                   ) then (
                       -- Sai qualquer ETAPA da esteira, entra a de gravar.
                       -- As paralelas e as etiquetas livres ficam onde
                       -- estão. Ver db/migracao-esteira.sql.
                       select array(
                           select e from unnest(coalesce(etiquetas, '{}')) e
                            where lower(trim(e)) not in (
                                'roteiro em desenvolvimento',
                                'roteiro em aprovação', 'roteiro aprovado',
                                'a gravar', 'gravado', 'em edição', 'gravação aguardando aprovação',
                                'a diagramar', 'arte pronta', 'arte aguardando aprovação',
                                'revisão', 'pronto para publicar', 'publicado'
                            )
                       -- A etapa que entra depende da esteira da peça, e quem
                       -- decide é o campo `formato`. O mesmo padrão vive em
                       -- lib/etiquetas.js (esteiraDe); se um dia mudar, muda nos
                       -- dois — este é o lado que vale para o cliente.
                       ) || array[
                           case when formato ~* 'carro?ss?el|carousel|est[áa]tico|imagem|foto|arte|infogr[áa]fico'
                                then 'a diagramar' else 'a gravar' end
                       ]
                   )
                   else etiquetas
               end
         where id = v_id;
    end if;

    return v_retorno;
end;
$$;

-- ── Conferência ───────────────────────────────────────────────────────────
-- Troque pelo token de um cliente e veja as etiquetas que atravessam:
-- select jsonb_path_query_array(vz_visualizacao('TOKEN'), '$.conteudos[*].etiquetas');
