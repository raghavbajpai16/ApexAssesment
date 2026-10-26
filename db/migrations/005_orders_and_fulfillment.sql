-- 005_orders_and_fulfillment.sql
-- Schema for Orders, Dispatches, and Cancellations

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  spec_id INT NOT NULL,
  input_qty VARCHAR(30) NOT NULL,
  input_unit ENUM('rolls', 'metres', 'kg') NOT NULL,
  rolls_ordered INT NOT NULL,
  rolls_dispatched INT NOT NULL DEFAULT 0,
  rolls_cancelled INT NOT NULL DEFAULT 0,
  status ENUM('pending', 'partially_dispatched', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  note TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_spec FOREIGN KEY (spec_id) REFERENCES specs (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_orders_rolls_ordered CHECK (rolls_ordered > 0),
  CONSTRAINT chk_orders_rolls_dispatched CHECK (rolls_dispatched >= 0),
  CONSTRAINT chk_orders_rolls_cancelled CHECK (rolls_cancelled >= 0),
  CONSTRAINT chk_orders_balance CHECK (rolls_dispatched + rolls_cancelled <= rolls_ordered)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dispatches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  rolls INT NOT NULL,
  note TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dispatches_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_dispatches_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_dispatches_rolls CHECK (rolls > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cancellations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  rolls_released INT NOT NULL,
  reason TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cancellations_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_cancellations_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_cancellations_rolls CHECK (rolls_released > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
