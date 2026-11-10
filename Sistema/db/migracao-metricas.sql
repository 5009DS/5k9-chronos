-- ═══════════════════════════════════════════════════════════════════════════
-- MÉTRICAS — a leitura quinzenal do Instagram de cada cliente.
--
-- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
-- deploy da página /metricas.
--
-- ── DE ONDE VÊM OS NÚMEROS ────────────────────────────────────────────────
-- Dos prints do Insights do Instagram que o Andrew manda na conversa com o
-- Claude. O Claude lê, grava UMA linha por leitura (um período) e escreve a
-- análise comparando com a leitura anterior do mesmo cliente. Não há
-- integração com a API do Instagram — de propósito: são poucos clientes, e o
-- print é o que a equipe já tem na mão.
--
-- ── POR QUE `dados` É JSON ────────────────────────────────────────────────
-- O Instagram muda os nomes e as seções do Insights com frequência, e cada
-- print mostra um recorte diferente (às vezes vem o público, às vezes não).
-- Uma coluna por número viraria uma migração por mudança do aplicativo. A
-- página lê o que existir e ignora o que faltar. O formato está em
-- pages/metricas.js (no comentário do topo).
--
-- `dias` existe porque o Insights deixa escolher 7, 14, 30 ou 90 dias: uma
-- leitura de 30 dias não se compara com uma de 14 em número bruto, e a
-- página passa a comparar média por dia quando os períodos diferem.
--
-- Só a equipe vê: o link do cliente não lê esta tabela.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists vz_metricas (
    id          text primary key default gen_random_uuid()::text,
    cliente_id  text not null references vz_clientes(id) on delete cascade,
    rede        text not null default 'instagram',
    inicio      date not null,
    fim         date not null,
    dias        int  not null,
    dados       jsonb not null default '{}'::jsonb,
    analise     text,
    criado_por  text default (auth.jwt() ->> 'email'),
    criado_em   timestamptz not null default now()
);

create index if not exists vz_metricas_cliente on vz_metricas (cliente_id, fim desc);

alter table vz_metricas enable row level security;
drop policy if exists "vz_metricas: somente autenticado" on vz_metricas;
create policy "vz_metricas: somente autenticado" on vz_metricas
    for all to authenticated using (true) with check (true);

-- ── Conferência ───────────────────────────────────────────────────────────
-- select cl.nome, m.inicio, m.fim, m.dias from vz_metricas m join vz_clientes cl on cl.id = m.cliente_id order by m.fim desc;
