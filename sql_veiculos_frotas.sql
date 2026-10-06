-- ============================================================
-- ATLAS SAÚDE - MÓDULO CONTROLE DE FROTAS & VEÍCULOS
-- Copie e execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Criar a tabela veiculos (caso não exista)
CREATE TABLE IF NOT EXISTS veiculos (
  id            TEXT PRIMARY KEY,
  nome          TEXT NOT NULL,
  placa         TEXT,
  modelo        TEXT,
  cor           TEXT,
  renavam       TEXT,
  "notaFiscal"  TEXT,
  resolucao     TEXT,
  ficha         TEXT,
  fonte         TEXT,
  "valorCompra" NUMERIC DEFAULT 0,
  "setorAtual"   TEXT,
  "setorPertence" TEXT,
  "pdfUrl"      TEXT,
  "pdfNome"     TEXT,
  obs           TEXT,
  "criadoEm"    TEXT
);

-- 2. Adicionar colunas se a tabela já existia previamente
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS renavam TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "notaFiscal" TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS resolucao TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS ficha TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS fonte TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "valorCompra" NUMERIC DEFAULT 0;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "setorAtual" TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "setorPertence" TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "pdfNome" TEXT;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS "criadoEm" TEXT;

-- 3. Habilitar RLS (Row Level Security) e permitir acesso total
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em veiculos" ON veiculos;
CREATE POLICY "Permitir tudo em veiculos" ON veiculos
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Criar Índices de Busca
CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa);
CREATE INDEX IF NOT EXISTS idx_veiculos_renavam ON veiculos(renavam);
CREATE INDEX IF NOT EXISTS idx_veiculos_fonte ON veiculos(fonte);
CREATE INDEX IF NOT EXISTS idx_veiculos_setor_atual ON veiculos("setorAtual");
CREATE INDEX IF NOT EXISTS idx_veiculos_setor_pertence ON veiculos("setorPertence");

-- 5. Configurar Bucket no Supabase Storage para Documentos/PDFs (Bucket: documentos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Permissões de Leitura e Escrita Públicas no Storage de Documentos
DROP POLICY IF EXISTS "Permitir leitura publica em documentos" ON storage.objects;
CREATE POLICY "Permitir leitura publica em documentos" ON storage.objects
  FOR SELECT USING (bucket_id = 'documentos');

DROP POLICY IF EXISTS "Permitir upload publico em documentos" ON storage.objects;
CREATE POLICY "Permitir upload publico em documentos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documentos');

DROP POLICY IF EXISTS "Permitir delecao publica em documentos" ON storage.objects;
CREATE POLICY "Permitir delecao publica em documentos" ON storage.objects
  FOR DELETE USING (bucket_id = 'documentos');
