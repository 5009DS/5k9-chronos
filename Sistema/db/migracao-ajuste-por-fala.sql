-- ═══════════════════════════════════════════════════════════════════════════
-- 5K9 CHRONOS — pedido de ajuste apontando para UMA fala.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms (o mesmo do schema.sql).
-- Em banco novo não é preciso: o schema.sql já cria as colunas.
--
-- ── O problema que isto resolve ───────────────────────────────────────────
-- O pedido de ajuste era do CONTEÚDO inteiro. O cliente escrevia "a frase de
-- abertura ficou agressiva" e a equipe abria um roteiro de nove blocos para
-- descobrir qual era a frase. Numa peça curta dá para adivinhar; num roteiro
-- longo, não — e a conversa volta para o WhatsApp, que é exatamente o que este
-- sistema existe para evitar.
--
-- Agora o cliente toca na fala e o pedido nasce grudado nela.
--
-- ── POR QUE GRAVAR TAMBÉM O TRECHO ────────────────────────────────────────
-- `bloco_id` sozinho não basta. A equipe vai REESCREVER aquela fala — é para
-- isso que o pedido serve — e aí o comentário passa a apontar para um texto
-- que não existe mais. "Ficou agressiva" perde o sentido quando ninguém
-- lembra o que estava escrito.
--
-- `trecho` congela o que o cliente estava lendo no momento em que reclamou. É
-- redundante por dois minutos e essencial por três meses.
--
-- `on delete set null`: apagar o bloco não apaga o pedido. O histórico da
-- conversa sobrevive ao texto que a originou — e o trecho continua lá para
-- explicar do que se tratava.
-- ═══════════════════════════════════════════════════════════════════════════

alter table vz_retornos add column if not exists bloco_id text references vz_blocos(id) on delete set null;
alter table vz_retornos add column if not exists trecho   text;

create index if not exists vz_retornos_bloco_idx on vz_retornos(bloco_id) where bloco_id is not null;

-- A assinatura muda, então a versão antiga precisa SAIR. Sem o drop, o
-- Postgres passa a ter duas funções com o mesmo nome e aridades diferentes, e
-- uma chamada com cinco argumentos continuaria caindo na antiga — que ignora
-- o bloco em silêncio.
drop function if exists vz_registrar_retorno(text, text, text, text, text);

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

    -- O bloco precisa ser DESTE conteúdo. Sem esta checagem, quem tivesse um
    -- link válido poderia pendurar um comentário no roteiro de outro cliente
    -- mandando o id na mão.
    if p_bloco is not null then
        select b.id into v_bloco
          from vz_blocos b
         where b.id = p_bloco and b.conteudo_id = v_id;
    end if;

    insert into vz_retornos (conteudo_id, tipo, texto, autor, bloco_id, trecho)
         values (v_id, p_tipo,
                 nullif(trim(coalesce(p_texto, '')), ''),
                 nullif(trim(coalesce(p_autor, '')), ''),
                 v_bloco,
                 nullif(trim(coalesce(p_trecho, '')), ''))
      returning to_jsonb(vz_retornos.*) into v_retorno;

    update vz_conteudos
       set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end
     where id = v_id;

    return v_retorno;
end;
$$;

revoke all on function vz_registrar_retorno(text, text, text, text, text, text, text) from anon, public;
grant execute on function vz_registrar_retorno(text, text, text, text, text, text, text) to anon, authenticated;
