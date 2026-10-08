-- =====================================================================
-- Decimal stock migration: allow fractional quantities (e.g. 0.5 กิโลกรัม)
-- Safe to run multiple times. Existing integer values are preserved.
-- Run this in Supabase > SQL Editor
-- =====================================================================

-- 1) Product stock per warehouse (3 decimal places)
ALTER TABLE products ALTER COLUMN stock_office  TYPE NUMERIC(14,3) USING stock_office::NUMERIC;
ALTER TABLE products ALTER COLUMN stock_kookkai TYPE NUMERIC(14,3) USING stock_kookkai::NUMERIC;
ALTER TABLE products ALTER COLUMN stock_big     TYPE NUMERIC(14,3) USING stock_big::NUMERIC;
ALTER TABLE products ALTER COLUMN min_stock     TYPE NUMERIC(14,3) USING min_stock::NUMERIC;

-- 2) Sold quantity per bill line
ALTER TABLE sale_items ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC;

-- 3) Quotation line quantity (only if the table/column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quotation_items' AND column_name = 'quantity'
  ) THEN
    EXECUTE 'ALTER TABLE quotation_items ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC';
  END IF;
END $$;
