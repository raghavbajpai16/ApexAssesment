-- 002_specs_schema.sql: Specifications table and immutability triggers (D4, D6)
-- Engines: InnoDB, Charset: utf8mb4

-- 1. Specs table
CREATE TABLE IF NOT EXISTS specs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  name VARCHAR(100) NOT NULL,
  parent_spec_id INT NULL,
  width_mm INT NOT NULL,
  film_gsm INT NOT NULL,
  coating_gsm INT NOT NULL,
  solids_bp INT NOT NULL,
  roll_length_m INT NOT NULL,
  film_mg_per_roll BIGINT NOT NULL,
  dry_adhesive_mg_per_roll BIGINT NOT NULL,
  liquid_adhesive_mg_per_roll BIGINT NOT NULL,
  net_tape_mg_per_roll BIGINT NOT NULL,
  core_pieces_per_roll INT NOT NULL DEFAULT 1,
  locked_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_spec_id) REFERENCES specs(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_specs_code_version (code, version),
  INDEX idx_specs_code (code),
  INDEX idx_specs_locked_at (locked_at),
  CONSTRAINT chk_specs_width CHECK (width_mm > 0),
  CONSTRAINT chk_specs_film_gsm CHECK (film_gsm > 0),
  CONSTRAINT chk_specs_coating_gsm CHECK (coating_gsm > 0),
  CONSTRAINT chk_specs_solids_bp CHECK (solids_bp > 0 AND solids_bp <= 10000),
  CONSTRAINT chk_specs_roll_length CHECK (roll_length_m > 0),
  CONSTRAINT chk_specs_film_mg CHECK (film_mg_per_roll > 0),
  CONSTRAINT chk_specs_dry_mg CHECK (dry_adhesive_mg_per_roll > 0),
  CONSTRAINT chk_specs_liquid_mg CHECK (liquid_adhesive_mg_per_roll > 0),
  CONSTRAINT chk_specs_net_mg CHECK (net_tape_mg_per_roll > 0),
  CONSTRAINT chk_specs_core_pieces CHECK (core_pieces_per_roll > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Trigger: Prevent UPDATE on locked specifications (D4 immutability)
DROP TRIGGER IF EXISTS trg_specs_prevent_update_when_locked;
CREATE TRIGGER trg_specs_prevent_update_when_locked
BEFORE UPDATE ON specs
FOR EACH ROW
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Operation rejected: Cannot modify a locked specification.';
  END IF;
END;

-- 3. Trigger: Prevent DELETE on locked specifications (D4 audit integrity)
DROP TRIGGER IF EXISTS trg_specs_prevent_delete_when_locked;
CREATE TRIGGER trg_specs_prevent_delete_when_locked
BEFORE DELETE ON specs
FOR EACH ROW
BEGIN
  IF OLD.locked_at IS NOT NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Operation rejected: Cannot delete a locked specification.';
  END IF;
END;
