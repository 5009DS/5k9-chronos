-- ═══════════════════════════════════════════════════════════════════════════
-- GRAVADO FECHA O PEDIDO DE AJUSTE
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-etiquetas-cliente.sql.
--
-- Depois que o conteúdo foi gravado, mudar uma fala custa uma diária de
-- estúdio. A tela do cliente deixa de oferecer o botão — e isso não basta:
-- esconder botão é decoração, não regra. Quem tem o link e o console do
-- navegador chama a função direto.
--
-- Então a regra mora aqui. A tela e o banco dizem a mesma coisa, e é o banco
-- que decide.
--
-- APROVAR CONTINUA VALENDO. O cliente pode encerrar um assunto que ficou
-- aberto, e "concordo" nunca precisa ser barrado. O que a gravação fecha é
-- o pedido de MUDANÇA.
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
    v_gravado boolean;
    v_retorno jsonb;
begin
    if p_tipo not in ('aprovado', 'ajuste') then
        raise exception 'Tipo de retorno inválido.';
    end if;

    select co.id,
           exists (select 1 from unnest(coalesce(co.etiquetas, '{}')) e
                    where lower(trim(e)) = 'gravado')
      into v_id, v_gravado
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

    -- A mensagem é para o cliente ler: ela diz o que aconteceu e o que fazer,
    -- em vez de "operação não permitida".
    if v_gravado and p_tipo = 'ajuste' then
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

    -- Só o retorno sobre o conteúdo INTEIRO move o status dele.
    if v_bloco is null then
        update vz_conteudos
           set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end
         where id = v_id;
    end if;

    return v_retorno;
end;
$$;

revoke all on function vz_registrar_retorno(text, text, text, text, text, text, text) from anon, public;
grant execute on function vz_registrar_retorno(text, text, text, text, text, text, text) to anon, authenticated;
