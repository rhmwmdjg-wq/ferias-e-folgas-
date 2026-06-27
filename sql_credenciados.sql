-- ============================================================
-- TABELAS: CREDENCIADOS, CARGOS, PONTO_MENSAL
-- Copie e execute no SQL Editor do Supabase
-- ============================================================

-- 1. CARGOS
CREATE TABLE IF NOT EXISTS cargos (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  valorHora NUMERIC DEFAULT 0
);

ALTER TABLE cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo em cargos" ON cargos
  FOR ALL USING (true) WITH CHECK (true);


-- 2. CREDENCIADOS
CREATE TABLE IF NOT EXISTS credenciados (
  id             TEXT PRIMARY KEY,
  nome           TEXT NOT NULL,
  cpf            TEXT,
  pis            TEXT,
  tel            TEXT,
  email          TEXT,
  admissao       TEXT,        -- formato YYYY-MM-DD
  lotacao        TEXT,
  endereco       TEXT,
  cargoId        TEXT,
  formaPagamento TEXT,
  chavePix       TEXT,
  banco          TEXT,
  agencia        TEXT,
  conta          TEXT,
  tipoConta      TEXT
);

ALTER TABLE credenciados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo em credenciados" ON credenciados
  FOR ALL USING (true) WITH CHECK (true);


-- 3. PONTO_MENSAL (fechamentos)
CREATE TABLE IF NOT EXISTS ponto_mensal (
  id            TEXT PRIMARY KEY,
  credenciadoId TEXT,
  mes           INTEGER,
  ano           INTEGER,
  horas         NUMERIC DEFAULT 0,
  valorHora     NUMERIC DEFAULT 0,
  valorTotal    NUMERIC DEFAULT 0,
  cargoId       TEXT,
  criadoEm      TEXT
);

ALTER TABLE ponto_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo em ponto_mensal" ON ponto_mensal
  FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- ÍNDICES (opcionais, para performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_credenciados_admissao ON credenciados(admissao);
CREATE INDEX IF NOT EXISTS idx_credenciados_cargoId  ON credenciados(cargoId);
CREATE INDEX IF NOT EXISTS idx_ponto_mensal_cred     ON ponto_mensal(credenciadoId);
CREATE INDEX IF NOT EXISTS idx_ponto_mensal_mes_ano  ON ponto_mensal(mes, ano);
