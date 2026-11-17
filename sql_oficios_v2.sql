-- ============================================================
-- ATLAS SAÚDE - OFÍCIOS E NOTIFICAÇÕES (versão 2)
-- Copie e execute este script no SQL Editor do Supabase (projeto do Atlas Saúde).
-- Pode ser executado mais de uma vez sem problema.
--
-- Cria a coluna "extras", onde ficam: situação, prazo de resposta, anexos, C/C,
-- registro de envios por e-mail, assinatura digital, "sem efeito" e, nas
-- notificações, tipo, prazo de manifestação e testemunhas.
-- ============================================================

ALTER TABLE oficios      ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS extras JSONB DEFAULT '{}'::jsonb;

-- Garante a coluna de vários destinatários também nas notificações
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS destinatarios JSONB DEFAULT '[]'::jsonb;

-- Atualiza o cache da API para as colunas novas valerem na hora
NOTIFY pgrst, 'reload schema';
