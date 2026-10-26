-- 003_materials_ledger.sql: Material stock ledger and idempotency keys (D1, D8)
-- Engines: InnoDB, Charset: utf8mb4

-- 1. Material transactions append-only ledger
CREATE TABLE IF NOT EXISTS material_txns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  material_id INT NOT NULL,
  kind ENUM(
    'receipt',
    'production_issue',
    'damage',
    'correction_reversal',
    'correction_replacement'
  ) NOT NULL,
  qty BIGINT NOT NULL,
  ref_type VARCHAR(50) NULL,
  ref_id INT NULL,
  corrects_txn_id INT NULL,
  note TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT,
  FOREIGN KEY (corrects_txn_id) REFERENCES material_txns(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_material_txns_mat_id (material_id),
  INDEX idx_material_txns_kind (kind),
  INDEX idx_material_txns_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Idempotency keys for network retry deduplication
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(64) NOT NULL,
  user_id INT NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_json MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_idempotency (user_id, idempotency_key),
  INDEX idx_idempotency_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Trigger: Prevent UPDATE on material_txns (D8 append-only invariant)
DROP TRIGGER IF EXISTS trg_material_txns_prevent_update;
CREATE TRIGGER trg_material_txns_prevent_update
BEFORE UPDATE ON material_txns
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Operation rejected: material_txns is an append-only ledger and cannot be updated.';
END;

-- 4. Trigger: Prevent DELETE on material_txns (D8 append-only invariant)
DROP TRIGGER IF EXISTS trg_material_txns_prevent_delete;
CREATE TRIGGER trg_material_txns_prevent_delete
BEFORE DELETE ON material_txns
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Operation rejected: material_txns is an append-only ledger and cannot be deleted.';
END;
