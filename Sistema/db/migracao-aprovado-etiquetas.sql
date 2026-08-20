-- ═══════════════════════════════════════════════════════════════════════════
-- APROVAR O ROTEIRO EMPURRA A PRODUÇÃO
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-gravado.sql.
--
-- Quando o cliente aprova, duas coisas passam a ser verdade ao mesmo tempo: o
-- roteiro está aprovado e a peça entrou na fila de gravação. Alguém da equipe
-- teria de abrir a ficha e escrever as duas etiquetas à mão — e é justamente o
-- tipo de tarefa que ninguém lembra de fazer na sexta à noite, deixando o
-- quadro dizendo "roteiro em aprovação" numa peça já liberada.
--
-- Então a aprovação mexe nas etiquetas:
--   · tira  "roteiro em aprovação"  — deixou de ser verdade neste instante;
--   · põe   "roteiro aprovado"      — passou a ser;
--   · põe   "a gravar"              — o próximo passo, que é o que a equipe
--                                     precisa enxergar no quadro.
--
-- ── O QUE ELA NÃO FAZ ─────────────────────────────────────────────────────
-- Não mexe em peça já GRAVADA. Aprovar um assunto pendente depois da gravação
-- é legítimo (ver db/migracao-gravado.sql), e devolver "a gravar" ali mandaria
-- a equipe gravar de novo o que já está pronto.
--
-- Não toca em nenhuma outra etiqueta: "aguardando material" continua valendo
-- depois da aprovação, e apagar o que a equipe escreveu seria trocar o
-- trabalho dela por um palpite nosso.
--
-- E só vale para a aprovação do CONTEÚDO INTEIRO. Encerrar a conversa de uma
-- fala não aprova roteiro nenhum.
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

    if v_bloco is null then
        update vz_conteudos
           set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end,
               -- As etiquetas só andam na APROVAÇÃO do conteúdo inteiro, e
               -- nunca numa peça já gravada.
               etiquetas = case
                   when p_tipo = 'aprovado' and not v_gravado then (
                       select array(
                           select distinct x from unnest(
                               array(select e from unnest(coalesce(etiquetas, '{}')) e
                                      where lower(trim(e)) <> 'roteiro em aprovação')
                               || array['roteiro aprovado', 'a gravar']
                           ) x
                       )
                   )
                   else etiquetas
               end
         where id = v_id;
    end if;

    return v_retorno;
end;
$$;

revoke all on function vz_registrar_retorno(text, text, text, text, text, text, text) from anon, public;
grant execute on function vz_registrar_retorno(text, text, text, text, text, text, text) to anon, authenticated;
