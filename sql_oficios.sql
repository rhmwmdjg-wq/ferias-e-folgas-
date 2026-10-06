-- ============================================================
-- ATLAS SAÚDE - MÓDULO GERADOR DE OFÍCIOS
-- Copie e execute este script no SQL Editor do Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS oficios (
  id                  TEXT PRIMARY KEY,
  numero              INTEGER NOT NULL,
  ano                 INTEGER NOT NULL,
  codigo              TEXT NOT NULL,
  assunto             TEXT,
  destinatario        TEXT,
  "cargoDestinatario" TEXT,
  "orgaoDestinatario" TEXT,
  "cidadeData"        TEXT,
  texto               TEXT,
  "emissorNome"       TEXT,
  "emissorCargo"      TEXT,
  token               TEXT UNIQUE,
  "criadoEm"          TEXT
);

-- Habilitar RLS (Row Level Security) e permitir acesso total
ALTER TABLE oficios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em oficios" ON oficios;
CREATE POLICY "Permitir tudo em oficios" ON oficios
  FOR ALL USING (true) WITH CHECK (true);

-- Criar Índices para Busca Rápida e Sequência
CREATE INDEX IF NOT EXISTS idx_oficios_ano_num ON oficios(ano, numero);
CREATE INDEX IF NOT EXISTS idx_oficios_token ON oficios(token);
CREATE INDEX IF NOT EXISTS idx_oficios_codigo ON oficios(codigo);
