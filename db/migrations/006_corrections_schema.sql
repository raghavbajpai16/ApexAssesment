-- 006_corrections_schema.sql
-- Administrative corrections tracking table

CREATE TABLE IF NOT EXISTS corrections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('material_receipt', 'material_damage', 'production_batch') NOT NULL,
  target_id INT NOT NULL,
  reason TEXT NOT NULL,
  approved_by VARCHAR(100) NULL,
  admin_id INT NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_corrections_admin FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
