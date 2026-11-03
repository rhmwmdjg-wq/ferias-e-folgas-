-- =====================================================================
-- Melhorias de Folgas e Banco de Horas (rodar UMA vez no Supabase:
-- painel do projeto > SQL Editor > New query > colar e clicar em Run)
-- Só ADICIONA colunas que estiverem faltando. Não apaga nem altera dados.
-- O sistema funciona mesmo sem rodar este script (ele detecta a coluna
-- ausente e grava sem ela), mas sem ele essas informações não ficam na nuvem.
-- =====================================================================

-- FOLGAS
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "refId"         jsonb;    -- créditos usados no usufruto
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "dataItems"     jsonb;    -- datas e turnos do usufruto
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "coberturaId"   text;     -- servidor substituto
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "lancadoPor"    text;     -- quem fez o lançamento
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "negativo"      boolean;
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "descPagamento" text;
ALTER TABLE public.folgas ADD COLUMN IF NOT EXISTS "solId"         text;     -- solicitação de origem

-- BANCO DE HORAS
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS "tipoLancamento" text;
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS "autorizadoPor"  text;
ALTER TABLE public.banco_horas ADD COLUMN IF NOT EXISTS "lancadoPor"     text;

-- Corrige folgas aprovadas por Solicitação que foram gravadas como 'gozo'
UPDATE public.folgas SET tipo = 'debito' WHERE tipo IN ('gozo', 'usufruto');

-- Atualiza o cache de colunas da API do Supabase
NOTIFY pgrst, 'reload schema';
