-- 004_production_and_finished.sql: Production batches and finished stock schema (D1, D3, D4)
-- Engines: InnoDB, Charset: utf8mb4

-- 1. Production batches table
CREATE TABLE IF NOT EXISTS production_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_no VARCHAR(50) NOT NULL UNIQUE,
  spec_id INT NOT NULL,
  rolls INT NOT NULL,
  film_mg BIGINT NOT NULL,
  liquid_mg BIGINT NOT NULL,
  waste_mg BIGINT NOT NULL DEFAULT 0,
  expected_film_mg BIGINT NOT NULL,
  expected_liquid_mg BIGINT NOT NULL,
  expected_dry_adhesive_mg BIGINT NOT NULL,
  expected_net_tape_mg BIGINT NOT NULL,
  expected_cores INT NOT NULL,
  diff_mg BIGINT NOT NULL DEFAULT 0,
  note TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_production_batches_spec (spec_id),
  INDEX idx_production_batches_created_at (created_at),
  CONSTRAINT chk_batches_rolls CHECK (rolls > 0),
  CONSTRAINT chk_batches_film_mg CHECK (film_mg > 0),
  CONSTRAINT chk_batches_liquid_mg CHECK (liquid_mg > 0),
  CONSTRAINT chk_batches_waste_mg CHECK (waste_mg >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Finished stock table
CREATE TABLE IF NOT EXISTS finished_stock (
  spec_id INT PRIMARY KEY,
  on_hand_rolls INT NOT NULL DEFAULT 0,
  reserved_rolls INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE RESTRICT,
  CONSTRAINT chk_finished_on_hand CHECK (on_hand_rolls >= 0),
  CONSTRAINT chk_finished_reserved CHECK (reserved_rolls >= 0 AND reserved_rolls <= on_hand_rolls)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Finished stock append-only ledger
CREATE TABLE IF NOT EXISTS finished_txns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  spec_id INT NOT NULL,
  kind ENUM(
    'production',
    'reserve',
    'release',
    'dispatch',
    'correction_reversal',
    'correction_replacement'
  ) NOT NULL,
  rolls INT NOT NULL,
  ref_type VARCHAR(50) NULL,
  ref_id INT NULL,
  corrects_txn_id INT NULL,
  note TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE RESTRICT,
  FOREIGN KEY (corrects_txn_id) REFERENCES finished_txns(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_finished_txns_spec (spec_id),
  INDEX idx_finished_txns_kind (kind),
  INDEX idx_finished_txns_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Trigger: Prevent UPDATE on finished_txns (D8 append-only invariant)
DROP TRIGGER IF EXISTS trg_finished_txns_prevent_update;
CREATE TRIGGER trg_finished_txns_prevent_update
BEFORE UPDATE ON finished_txns
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Operation rejected: finished_txns is an append-only ledger and cannot be updated.';
END;

-- 5. Trigger: Prevent DELETE on finished_txns (D8 append-only invariant)
DROP TRIGGER IF EXISTS trg_finished_txns_prevent_delete;
CREATE TRIGGER trg_finished_txns_prevent_delete
BEFORE DELETE ON finished_txns
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Operation rejected: finished_txns is an append-only ledger and cannot be deleted.';
END;
