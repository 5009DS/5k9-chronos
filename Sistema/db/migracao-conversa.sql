-- ═══════════════════════════════════════════════════════════════════════════
-- CONVERSA — a resposta da equipe, e o fim do assunto.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez.
-- Depois de db/migracao-ajuste-por-fala.sql.
--
-- ── O QUE FALTAVA ─────────────────────────────────────────────────────────
-- O cliente comentava uma fala e a equipe não tinha o que fazer com aquilo.
-- Reescrever o texto do bloco resolvia o roteiro e não resolvia a CONVERSA: o
-- comentário continuava lá, com a mesma cara de pendência, e ninguém — nem a
-- equipe três dias depois, nem o cliente — conseguia dizer se aquilo tinha
-- sido tratado.
--
-- ── A DECISÃO: MESMA TABELA ───────────────────────────────────────────────
-- A resposta da equipe entra em `vz_retornos`, ao lado do pedido. Não numa
-- tabela `vz_respostas` nova.
--
-- Porque o que está sendo guardado não é "o retorno do cliente" e "a réplica
-- da equipe" — é UMA conversa, em ordem cronológica, sobre uma fala. Em duas
-- tabelas, montar essa ordem exigiria unir as duas e reordenar em toda tela
-- que mostrasse o assunto, e a primeira que esquecesse a união mostraria
-- metade do diálogo.
--
-- O que distingue os dois lados é `origem`. É uma coluna, não uma tabela.
--
-- ── O ESTADO DA CONVERSA NÃO É COLUNA ─────────────────────────────────────
-- Não existe `resolvido boolean`. O estado é a ÚLTIMA entrada:
--
--     cliente/ajuste  por último  → pendente, a bola está com a equipe
--     equipe/*        por último  → respondido, a bola está com o cliente
--     */aprovado      por último  → fechado
--
-- Uma coluna de estado seria uma segunda verdade sobre o mesmo fato, e as
-- duas divergiriam no primeiro comentário gravado sem atualizar a flag. A
-- derivação vive em lib/conversa.js e nunca pode discordar do histórico,
-- porque ela É o histórico.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── De que lado veio a entrada ────────────────────────────────────────────
-- Default 'cliente': tudo que já está gravado veio do cliente, porque até
-- agora só o cliente conseguia gravar aqui.
alter table vz_retornos add column if not exists origem text not null default 'cliente';

-- ── O e-mail de quem aprova ───────────────────────────────────────────────
-- `contato` já existe e é texto livre ("Dra. Helena (marketing)") — serve para
-- saber COM QUEM falar, não para escrever para essa pessoa. O aviso de ajuste
-- pronto precisa de um endereço, e endereço mora em campo próprio: extrair
-- e-mail de texto livre com regex funciona até o dia em que alguém escreve
-- dois, ou nenhum.
alter table vz_clientes add column if not exists email text;

-- Índice de conversa: toda tela que abre um roteiro pergunta "o que já foi
-- dito sobre este bloco, em ordem". O índice antigo só tinha bloco_id.
drop index if exists vz_retornos_bloco_idx;
create index if not exists vz_retornos_bloco_idx
    on vz_retornos(bloco_id, criado_em) where bloco_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- A PORTA DO CLIENTE, com duas mudanças
--
-- 1. `origem` é gravada como 'cliente' SEMPRE, sem parâmetro. Esta função é a
--    porta de quem não tem login: se o lado de quem fala viesse por argumento,
--    qualquer pessoa com o link poderia gravar uma "resposta da equipe" no
--    roteiro dela. Quem entra por esta porta é cliente, e ponto.
--
-- 2. APROVAR UMA FALA NÃO APROVA O CONTEÚDO. Este é o motivo de a função
--    precisar mudar agora: com o botão de "ficou bom" por fala, a versão
--    anterior colocaria o conteúdo INTEIRO em `aprovado` porque o cliente
--    gostou de uma frase. O status do conteúdo só se move quando o retorno é
--    sobre o conteúdo inteiro — isto é, quando não tem bloco.
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

    -- O conteúdo precisa pertencer ao cliente DAQUELE token. Sem a junção,
    -- quem tivesse um link válido responderia pelo conteúdo de outro cliente
    -- mandando o id na mão.
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

    -- E o bloco precisa ser DESTE conteúdo, pelo mesmo motivo.
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

    -- Só o retorno sobre o conteúdo inteiro move o status dele. "Esta fala
    -- ficou boa" é o fim de UM assunto, não a aprovação da peça — e o
    -- cronograma da equipe não pode passar a dizer "aprovado" por causa disso.
    if v_bloco is null then
        update vz_conteudos
           set status = case when p_tipo = 'aprovado' then 'aprovado' else 'ajuste' end
         where id = v_id;
    end if;

    return v_retorno;
end;
$$;

-- A assinatura não mudou, então os grants continuam valendo. Repetidos aqui
-- porque este arquivo precisa poder ser rodado num banco que ainda não tenha
-- passado pelas migrações anteriores sem deixar a porta fechada.
revoke all on function vz_registrar_retorno(text, text, text, text, text, text, text) from anon, public;
grant execute on function vz_registrar_retorno(text, text, text, text, text, text, text) to anon, authenticated;

-- ── Conferência ───────────────────────────────────────────────────────────
-- select origem, count(*) from vz_retornos group by origem;
