-- ═══════════════════════════════════════════════════════════════════════════
-- A CONTA MASTER ENTRA PELO GOOGLE
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez. Depois de
-- db/migracao-login-google.sql.
--
-- O gancho da lista de convidados só deixava nascer conta de quem está na
-- Equipe. A conta do estúdio (5009business@gmail.com) não está, de
-- propósito: ela não é uma pessoa para ser marcada em pedido nem para
-- receber os avisos da equipe. Então ela entra aqui, por nome.
--
-- A mesma lista existe em lib/supabase-config.js (CONTAS_MASTER) e em
-- api/_avisos.js. Trocar o email exige trocar nos três.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.vz_antes_de_criar_usuario(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
    if v_email in ('5009business@gmail.com') then
        return '{}'::jsonb;
    end if;

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

grant execute on function public.vz_antes_de_criar_usuario(jsonb) to supabase_auth_admin;
revoke execute on function public.vz_antes_de_criar_usuario(jsonb) from authenticated, anon, public;

-- ── Conferência ───────────────────────────────────────────────────────────
-- select vz_antes_de_criar_usuario('{"user":{"email":"5009business@gmail.com"}}');  → {}
-- select vz_antes_de_criar_usuario('{"user":{"email":"estranho@gmail.com"}}');      → erro 403
