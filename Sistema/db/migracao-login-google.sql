-- ═══════════════════════════════════════════════════════════════════════════
-- LOGIN PRÓPRIO COM GOOGLE, PAPÉIS E "QUEM SUBIU"
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES de
-- ligar o Google em Authentication → Providers. Depois de
-- db/migracao-pedidos-varios.sql.
--
-- ── 1. A LISTA DE CONVIDADOS (o motivo de rodar isto primeiro) ────────────
-- O banco é dividido com o 5K9 Forms, e o RLS das tabelas dos dois diz
-- "quem tem login vê". Ligar o "Entrar com Google" sem trava deixaria
-- QUALQUER conta Google do mundo criar login — e ler os clientes do Chronos
-- e as respostas do Forms.
--
-- A trava é um gancho do Supabase Auth ("Before User Created"): antes de
-- criar uma conta, o Auth pergunta a esta função se pode. Conta NOVA só nasce
-- se o email estiver na Equipe do Chronos, ativo — venha pelo Google ou por
-- email e senha. Vale para os dois porque o login com Google exige ligar
-- "Allow new users to sign up", e essa chave abre também o cadastro por email
-- e senha para qualquer um que tenha a chave pública (que é pública).
--
-- Contas que JÁ EXISTEM não passam pelo gancho: o login master e as contas
-- do Forms continuam entrando como sempre. O único efeito colateral: para
-- criar uma conta nova de email e senha no futuro (para o Forms, por
-- exemplo), cadastre o email na Equipe do Chronos antes.
--
-- Depois de rodar, ligue o gancho em:
--   Authentication → Hooks → "Before User Created" → Postgres →
--   schema public, função vz_antes_de_criar_usuario.
--
-- Quem já tem conta com o mesmo email não passa pelo gancho: o Supabase junta
-- o Google à conta que já existe.
--
-- ── 2. PAPÉIS ─────────────────────────────────────────────────────────────
-- admin   organiza o mês e manda o aviso "mês organizado" (Andrew);
-- equipe  sobe conteúdo, consulta, cuida de pedido (Marianna, João).
-- O login master (email e senha) vale como admin sem precisar estar aqui.
--
-- ── 3. QUEM SUBIU ─────────────────────────────────────────────────────────
-- `criado_por` guarda o email de quem criou o conteúdo, e o padrão vem do
-- próprio token de login: nenhuma tela precisa lembrar de preencher, e
-- ninguém assina em nome de outro. O que já existe fica sem autor.
--
-- `avisado_em` marca o conteúdo cujo aviso de "tema novo" já saiu
-- (api/avisar-temas.js). Os que já existem nascem marcados — senão o primeiro
-- aviso anunciaria o histórico inteiro.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Papéis ────────────────────────────────────────────────────────────────
alter table vz_equipe add column if not exists papel text not null default 'equipe';
alter table vz_equipe drop constraint if exists vz_equipe_papel_check;
alter table vz_equipe add constraint vz_equipe_papel_check check (papel in ('admin', 'equipe'));

update vz_equipe set papel = 'admin' where nome ilike 'andrew%';

-- ── Quem subiu ────────────────────────────────────────────────────────────
alter table vz_conteudos add column if not exists criado_por text default (auth.jwt() ->> 'email');
alter table vz_conteudos alter column criado_por set default (auth.jwt() ->> 'email');
alter table vz_conteudos add column if not exists avisado_em timestamptz;
update vz_conteudos set avisado_em = coalesce(criado_em, now()) where avisado_em is null;

-- O aviso procura "o que esta pessoa criou e ainda não foi anunciado".
create index if not exists vz_conteudos_sem_aviso
    on vz_conteudos(criado_por, criado_em) where avisado_em is null;

-- ── A lista de convidados ─────────────────────────────────────────────────
create or replace function public.vz_antes_de_criar_usuario(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
    if v_email <> '' and exists (
        select 1 from vz_equipe
         where lower(email) = v_email and ativo is true
    ) then
        return '{}'::jsonb;
    end if;

    return jsonb_build_object('error', jsonb_build_object(
        'http_code', 403,
        'message', 'Este email não está na equipe do Chronos. Peça para o Andrew cadastrar você.'));
end;
$$;

-- Só o serviço de autenticação chama o gancho; ninguém de fora.
grant execute on function public.vz_antes_de_criar_usuario(jsonb) to supabase_auth_admin;
revoke execute on function public.vz_antes_de_criar_usuario(jsonb) from authenticated, anon, public;

-- ═══════════════════════════════════════════════════════════════════════════
-- O CLIENTE NÃO VÊ QUEM SUBIU
--
-- O email de quem criou é dado da equipe. A função do link do cliente é a de
-- db/migracao-convidado.sql com mais dois recortes: criado_por e avisado_em.
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
                             - 'criado_por' - 'avisado_em')
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

-- ── Conferência ───────────────────────────────────────────────────────────
-- select nome, email, papel, ativo from vz_equipe order by nome;
-- select vz_antes_de_criar_usuario('{"user":{"email":"estranho@gmail.com"}}');
--   → deve devolver o erro 403
-- select vz_antes_de_criar_usuario(jsonb_build_object('user', jsonb_build_object('email',
--        (select email from vz_equipe where ativo and email is not null limit 1))));
--   → deve devolver {}
