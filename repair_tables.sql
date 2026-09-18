-- =====================================================
-- Repair & Delivery Tables
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. นัดซ่อมลูกค้า (Customer Repair Appointments)
CREATE TABLE IF NOT EXISTS customer_repairs (
  id                TEXT PRIMARY KEY,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  customer_address  TEXT,
  province          TEXT,
  location_url      TEXT,
  appointment_date  DATE,
  machine_model     TEXT NOT NULL,
  symptoms          TEXT,
  technician        TEXT,
  status            TEXT NOT NULL DEFAULT 'รอนัดวัน',
  estimated_cost    NUMERIC(12,2),
  actual_cost       NUMERIC(12,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customer_repairs_updated_at
  BEFORE UPDATE ON customer_repairs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. เครื่องซ่อมหน้าร้าน (In-Store Repairs)
CREATE TABLE IF NOT EXISTS shop_repairs (
  id                TEXT PRIMARY KEY,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  customer_address  TEXT,
  province          TEXT,
  machine_model     TEXT NOT NULL,
  symptoms          TEXT,
  technician        TEXT,
  status            TEXT NOT NULL DEFAULT 'รอนัดวัน',
  estimated_cost    NUMERIC(12,2),
  actual_cost       NUMERIC(12,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_shop_repairs_updated_at
  BEFORE UPDATE ON shop_repairs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. รายการส่งเครื่องลูกค้า (Customer Deliveries)
CREATE TABLE IF NOT EXISTS customer_deliveries (
  id                TEXT PRIMARY KEY,
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT,
  customer_address  TEXT,
  province          TEXT,
  location_url      TEXT,
  appointment_date  DATE,
  machine_model     TEXT NOT NULL,
  symptoms          TEXT,
  technician        TEXT,
  status            TEXT NOT NULL DEFAULT 'รอนัดวัน',
  estimated_cost    NUMERIC(12,2),
  actual_cost       NUMERIC(12,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_customer_deliveries_updated_at
  BEFORE UPDATE ON customer_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migration for existing tables if needed:
ALTER TABLE customer_repairs ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE shop_repairs ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE customer_deliveries ADD COLUMN IF NOT EXISTS province TEXT;

-- Enable Row Level Security (optional but recommended)
ALTER TABLE customer_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_deliveries ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for authenticated" ON customer_repairs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON shop_repairs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for authenticated" ON customer_deliveries
  FOR ALL USING (true) WITH CHECK (true);
