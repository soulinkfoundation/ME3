ALTER TABLE commerce_orders ADD COLUMN amount_due INTEGER;
ALTER TABLE commerce_orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'stripe'
  CHECK (payment_method IN ('stripe', 'manual'));

UPDATE commerce_orders
SET amount_due = amount_paid
WHERE amount_due IS NULL;
