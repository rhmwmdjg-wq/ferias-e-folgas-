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
  destinatarios       JSONB DEFAULT '[]'::jsonb,
  token               TEXT UNIQUE,
  "criadoEm"          TEXT
);

-- Garante a coluna em bancos já existentes (suporta vários destinatários)
ALTER TABLE oficios ADD COLUMN IF NOT EXISTS destinatarios JSONB DEFAULT '[]'::jsonb;

-- Habilitar RLS (Row Level Security) e permitir acesso total
ALTER TABLE oficios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em oficios" ON oficios;
CREATE POLICY "Permitir tudo em oficios" ON oficios
  FOR ALL USING (true) WITH CHECK (true);

-- Criar Índices para Busca Rápida e Sequência
CREATE INDEX IF NOT EXISTS idx_oficios_ano_num ON oficios(ano, numero);
CREATE INDEX IF NOT EXISTS idx_oficios_token ON oficios(token);
CREATE INDEX IF NOT EXISTS idx_oficios_codigo ON oficios(codigo);

-- ============================================================
-- CADASTRO DE DESTINATÁRIOS (Nome + Cargo + Órgão/Secretaria)
-- ============================================================
CREATE TABLE IF NOT EXISTS destinatarios (
  id      TEXT PRIMARY KEY,
  nome    TEXT NOT NULL,
  cargo   TEXT,
  orgao   TEXT
);

ALTER TABLE destinatarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em destinatarios" ON destinatarios;
CREATE POLICY "Permitir tudo em destinatarios" ON destinatarios
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- CADASTRO DE EMISSORES / ASSINANTES (Nome + Cargo)
-- ============================================================
CREATE TABLE IF NOT EXISTS emissores (
  id    TEXT PRIMARY KEY,
  nome  TEXT NOT NULL,
  cargo TEXT
);

ALTER TABLE emissores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir tudo em emissores" ON emissores;
CREATE POLICY "Permitir tudo em emissores" ON emissores
  FOR ALL USING (true) WITH CHECK (true);
