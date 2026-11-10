  -- ═══════════════════════════════════════════════════════════════════════════
  -- LINK DE REFERÊNCIA — o vídeo ou post que serve de modelo para o conteúdo.
  --
  -- Rode no SQL Editor do projeto Supabase do 5K9 Forms, uma vez, ANTES do
  -- deploy. Aparece no topo do roteiro, ao lado do link do Drive, e como ícone
  -- no cartão do quadro.
  --
  -- Diferente do Drive, a referência NÃO é recortada da tela do cliente: é um
  -- link público (Reels, TikTok, Pinterest) e não expõe material da equipe.
  -- ═══════════════════════════════════════════════════════════════════════════
  
  alter table vz_conteudos add column if not exists referencia_url text;
