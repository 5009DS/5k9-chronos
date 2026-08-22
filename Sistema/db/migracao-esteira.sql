-- ═══════════════════════════════════════════════════════════════════════════
-- A ESTEIRA DE PRODUÇÃO — uma etapa de cada vez
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-aprovado-etiquetas.sql.
--
-- ── O QUE MUDA ────────────────────────────────────────────────────────────
-- A aprovação punha DUAS etiquetas: "roteiro aprovado" e "a gravar". Elas
-- dizem a mesma coisa em dois tempos, e como nada as tirava depois, o cartão
-- passou a acumular estágios contraditórios — uma peça gravada continuava
-- anunciando que estava a gravar.
--
-- As sete etiquetas de produção viraram ETAPAS: a peça está em uma de cada
-- vez. Aprovar passa a colocá-la em "a gravar", que por vir depois de "roteiro
-- aprovado" na esteira já diz que o roteiro passou. Que ele foi aprovado não
-- se perde: está no `status` do conteúdo, que é onde a conversa com o cliente
-- mora.
--
-- A ordem completa vive em lib/etiquetas.js:
--   roteiro em aprovação → roteiro aprovado → a gravar → gravado →
--   em edição → gravação aguardando aprovação → publicado
--   (e "revisão", que sai do caminho feliz e volta para "em edição")
--
-- Aqui o banco só precisa saber de uma delas: a que a aprovação escreve. As
-- outras são escritas pela equipe, com sessão, direto na tabela.
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
               -- Sai qualquer ETAPA da esteira, entra "a gravar". As paralelas
               -- ("aguardando data", "aguardando material") e as etiquetas que
               -- a equipe inventou continuam onde estão: elas descrevem
               -- pendência, não estágio.
               etiquetas = case
                   when p_tipo = 'aprovado' and not v_gravado then (
                       select array(
                           select e from unnest(coalesce(etiquetas, '{}')) e
                            where lower(trim(e)) not in (
                                'roteiro em aprovação', 'roteiro aprovado', 'a gravar',
                                'gravado', 'em edição', 'gravação aguardando aprovação',
                                'revisão', 'publicado'
                            )
                       ) || array['a gravar']
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

-- ── Limpeza de quem já acumulou ───────────────────────────────────────────
-- Conteúdos que ficaram com "roteiro aprovado" E "a gravar" ao mesmo tempo,
-- pela regra antiga. Fica só a etapa mais avançada.
update vz_conteudos
   set etiquetas = (
       select array(select e from unnest(etiquetas) e
                     where lower(trim(e)) <> 'roteiro aprovado')
   )
 where etiquetas @> array['roteiro aprovado']
   and etiquetas && array['a gravar', 'gravado', 'em edição',
                          'gravação aguardando aprovação', 'publicado'];
