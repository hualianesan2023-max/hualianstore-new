-- =====================================================
-- Inbound Records (รับเครื่องเข้าคลัง) Tables & Migration
-- Run this script in Supabase SQL Editor
-- =====================================================

-- 1. ตารางหลัก: inbound_records (บันทึกใบรับเข้าเครื่องจักร)
CREATE TABLE IF NOT EXISTS inbound_records (
    id                VARCHAR(50) PRIMARY KEY, -- เช่น RC6911-001
    date              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    display_date      VARCHAR(50),
    supplier          TEXT NOT NULL DEFAULT 'โรงงานนำเข้า HUALIAN',
    ref_doc_no        TEXT DEFAULT '-',
    receiver          TEXT DEFAULT 'ผู้ดูแลระบบ',
    notes             TEXT,
    total_items       INTEGER NOT NULL DEFAULT 0,
    total_units       NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_cost_value  NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    items             JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_inbound_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inbound_records_updated_at ON inbound_records;
CREATE TRIGGER trg_update_inbound_records_updated_at
  BEFORE UPDATE ON inbound_records
  FOR EACH ROW EXECUTE FUNCTION update_inbound_updated_at_column();

-- 2. ตารางย่อย: inbound_items (รายการเครื่องจักรในแต่ละใบรับเข้า)
CREATE TABLE IF NOT EXISTS inbound_items (
    id                SERIAL PRIMARY KEY,
    voucher_id        VARCHAR(50) NOT NULL REFERENCES inbound_records(id) ON DELETE CASCADE,
    product_id        VARCHAR(50),
    barcode           VARCHAR(100),
    name              VARCHAR(255) NOT NULL,
    category          VARCHAR(100),
    unit              VARCHAR(50) DEFAULT 'เครื่อง',
    location          VARCHAR(100) NOT NULL DEFAULT 'โกดังใหญ่',
    quantity          NUMERIC(12, 2) NOT NULL DEFAULT 1,
    cost_price        NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sell_price        NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost        NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    serial_no         TEXT,
    note              TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing for fast search & reporting
CREATE INDEX IF NOT EXISTS idx_inbound_records_date ON inbound_records(date DESC);
CREATE INDEX IF NOT EXISTS idx_inbound_records_supplier ON inbound_records(supplier);
CREATE INDEX IF NOT EXISTS idx_inbound_records_ref_doc_no ON inbound_records(ref_doc_no);
CREATE INDEX IF NOT EXISTS idx_inbound_items_voucher_id ON inbound_items(voucher_id);
CREATE INDEX IF NOT EXISTS idx_inbound_items_product_id ON inbound_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inbound_items_location ON inbound_items(location);

-- 3. Row Level Security (RLS)
ALTER TABLE inbound_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for inbound_records" ON inbound_records;
CREATE POLICY "Allow all for inbound_records" ON inbound_records
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for inbound_items" ON inbound_items;
CREATE POLICY "Allow all for inbound_items" ON inbound_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Realtime Replication (เพื่อให้ทุกเครื่องอัปเดตแบบเรียลไทม์)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inbound_records;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
