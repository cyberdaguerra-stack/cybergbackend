/**
 * CYBER G × NETFACIL — MySQL Database Init
 * Run: npm run db:init
 */
import 'dotenv/config'
import { query } from './pool.js'
import pool from './pool.js'

const TABLES = [
  // Users
  `CREATE TABLE IF NOT EXISTS users (
    id             INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome           VARCHAR(120)    NOT NULL,
    email          VARCHAR(180)    NOT NULL UNIQUE,
    password_hash  TEXT            NOT NULL,
    role           ENUM('admin_geral','admin','funcionario') NOT NULL DEFAULT 'funcionario',
    status         ENUM('activo','inactivo','suspenso')      NOT NULL DEFAULT 'activo',
    ultimo_acesso  DATETIME,
    criado_em      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_em DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email  (email),
    INDEX idx_role   (role),
    INDEX idx_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Cash flow categories
  `CREATE TABLE IF NOT EXISTS categorias_caixa (
    id        INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome      VARCHAR(80)  NOT NULL UNIQUE,
    tipo      ENUM('entrada','saida') NOT NULL,
    cor       VARCHAR(20),
    criado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Cash flow
  `CREATE TABLE IF NOT EXISTS fluxo_caixa (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tipo            ENUM('entrada','saida') NOT NULL,
    descricao       VARCHAR(255)    NOT NULL,
    valor           DECIMAL(14,2)   NOT NULL CHECK (valor > 0),
    categoria_id    INT UNSIGNED    REFERENCES categorias_caixa(id),
    data_tx         DATE            NOT NULL,
    hora_tx         TIME            NOT NULL DEFAULT '00:00:00',
    observacoes     TEXT,
    criado_por      INT UNSIGNED    REFERENCES users(id),
    criado_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_data    (data_tx),
    INDEX idx_tipo    (tipo),
    INDEX idx_cat     (categoria_id),
    INDEX idx_criador (criado_por)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Service categories
  `CREATE TABLE IF NOT EXISTS categorias_servico (
    id        INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome      VARCHAR(80)  NOT NULL UNIQUE,
    criado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Services
  `CREATE TABLE IF NOT EXISTS servicos (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
    nome            VARCHAR(160)    NOT NULL,
    descricao       TEXT,
    preco_mensal    DECIMAL(14,2)   NOT NULL,
    categoria_id    INT UNSIGNED    REFERENCES categorias_servico(id),
    status          ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    criado_por      INT UNSIGNED    REFERENCES users(id),
    criado_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_em  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_cat    (categoria_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Reports
  `CREATE TABLE IF NOT EXISTS relatorios (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tipo            ENUM('semanal','mensal') NOT NULL,
    periodo_inicio  DATE            NOT NULL,
    periodo_fim     DATE            NOT NULL,
    total_entradas  DECIMAL(14,2)   NOT NULL DEFAULT 0,
    total_saidas    DECIMAL(14,2)   NOT NULL DEFAULT 0,
    gerado_por      INT UNSIGNED    REFERENCES users(id),
    ficheiro_url    TEXT,
    criado_em       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tipo    (tipo),
    INDEX idx_periodo (periodo_inicio, periodo_fim)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Audit log
  `CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED,
    accao      VARCHAR(80)      NOT NULL,
    tabela     VARCHAR(60),
    registo_id INT UNSIGNED,
    payload    JSON,
    criado_em  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_data (criado_em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
]

async function init() {
  console.log('🚀  Initialising Cyber G MySQL database...')
  try {
    for (const sql of TABLES) {
      const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || '?'
      await query(sql)
      console.log(`   ✓ ${tableName}`)
    }
    console.log('✅  All tables created successfully.')
  } catch (err) {
    console.error('❌  Init failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

init()
