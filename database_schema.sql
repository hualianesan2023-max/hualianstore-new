-- ====================================================================
-- PostgreSQL Database Schema & Seed Data for HUALIAN Sealing Machine POS
-- Prepared for Neon Database (Postgres)
-- ====================================================================

-- 1. DROP TABLES IF EXISTS (For clean initialization)
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. CREATE TABLE: USERS (ผู้ใช้งานระบบ)
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user', 'sale')),
    avatar VARCHAR(10)
);

-- 3. CREATE TABLE: CATEGORIES (หมวดหมู่เครื่องจักร)
CREATE TABLE categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10),
    prefix VARCHAR(10)
);

-- 4. CREATE TABLE: PRODUCTS (สินค้าเครื่องจักร)
CREATE TABLE products (
    id VARCHAR(50) PRIMARY KEY,
    barcode VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category_id VARCHAR(50) REFERENCES categories(id) ON DELETE SET NULL,
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    branch_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sell_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock_office INTEGER NOT NULL DEFAULT 0,
    stock_kookkai INTEGER NOT NULL DEFAULT 0,
    stock_big INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 10,
    image VARCHAR(10) DEFAULT '📦',
    unit VARCHAR(20) DEFAULT 'เครื่อง',
    is_popular BOOLEAN DEFAULT FALSE
);

-- 5. CREATE TABLE: CUSTOMERS (ข้อมูลลูกค้าออกใบกำกับภาษี/ลูกค้าทั่วไป)
CREATE TABLE customers (
    id VARCHAR(50) PRIMARY KEY, -- e.g. XL-00001
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    tax_id VARCHAR(20)
);

-- 6. CREATE TABLE: PROMOTIONS (คูปองและโปรโมชั่นส่วนลด)
CREATE TABLE promotions (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('percent', 'fixed')),
    value NUMERIC(12, 2) NOT NULL,
    min_purchase NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    active BOOLEAN DEFAULT TRUE
);

-- 7. CREATE TABLE: SALES (บันทึกข้อมูลการขาย)
CREATE TABLE sales (
    id VARCHAR(50) PRIMARY KEY, -- Invoice ID: IV6906-001
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    customer_id VARCHAR(50) REFERENCES customers(id) ON DELETE SET NULL,
    -- Fallback fields for general customer custom details
    customer_name VARCHAR(150) NOT NULL DEFAULT 'ลูกค้าทั่วไป',
    customer_phone VARCHAR(20) DEFAULT '-',
    customer_address TEXT DEFAULT '-',
    customer_tax_id VARCHAR(20) DEFAULT '-',
    salesperson VARCHAR(100) NOT NULL,
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'qr', 'transfer')),
    discount_code VARCHAR(50),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL,
    cash_received NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    apply_vat BOOLEAN NOT NULL DEFAULT TRUE,
    is_vat_inclusive BOOLEAN NOT NULL DEFAULT TRUE
);

-- 8. CREATE TABLE: SALE_ITEMS (รายการสินค้าในแต่ละบิลขาย)
CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id VARCHAR(50) REFERENCES sales(id) ON DELETE CASCADE,
    product_id VARCHAR(50) REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sell_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Actual selling price (Normal/Branch)
    selected_location VARCHAR(50) NOT NULL -- คลังหักสต็อก: โกดังใหญ่ / โกดังกุ๊กไก่ / ออฟฟิศ
);

-- ====================================================================
-- SEED DATA (ข้อมูลเริ่มต้นเพื่อใช้ทดสอบเชื่อมต่อ)
-- ====================================================================

-- 1. Insert Users (แอดมิน / ผู้ใช้งานทั่วไป)
INSERT INTO users (id, username, password, name, role, avatar) VALUES
('U1', 'admin', 'admin123', 'ผู้ดูแลระบบ (Admin)', 'admin', '👑'),
('U2', 'user', 'user123', 'พนักงานทั่วไป (User)', 'user', '👤'),
('U3', 'sale', 'sale123', 'พนักงานขาย (Sale)', 'sale', '💼');

-- 2. Insert Categories (28 หมวดหมู่)
INSERT INTO categories (id, name, icon, prefix) VALUES
('sealer', 'เครื่องซีลสายพาน', '📠', 'DY'),
('date_printer', 'เครื่องพิมพ์วันที่', '🖨️', 'PR'),
('hand_sealer', 'เครื่องซีลมือกด', '🎛️', 'FS'),
('foot_sealer', 'เครื่องซีลเท้าเหยียบ', '👣', 'FT'),
('film_cutter', 'เครื่องตัดฟิล์ม', '✂️', 'FC'),
('wrapping_machine', 'เครื่องห่อ', '📦', 'WR'),
('liquid_filling', 'เครื่องหยอดของเหลว', '💧', 'LF'),
('laminator', 'เครื่องเคลือบบัตร', '🪪', 'LA'),
('shrink_tunnel', 'เครื่องอบฟิล์มหด', '♨️', 'ST'),
('multi_pack', 'เครื่องแพ็คโหล', '🥫', 'MP'),
('label_shrink', 'เครื่องอบลาเบล', '🏷️', 'LT'),
('steam_tunnel', 'ตู้อบไอน้ำ', '💨', 'SD'),
('vacuum_sealer', 'เครื่องซีลสูญญากาศ', '🌀', 'VC'),
('bottle_capping', 'เครื่องปิดฝาขวด & สูญญากาศ', '🍾', 'BC'),
('foil_sealer', 'เครื่องปิดฝาฟอยล์', '💿', 'IF'),
('conveyor', 'สายพานลำเลียง', '🚛', 'CV'),
('sack_sewer', 'เครื่องจักรเย็บกระสอบ', '🧵', 'SM'),
('can_seamer', 'เครื่องปิดฝากระป๋อง', '🥫', 'CS'),
('capping_machine', 'เครื่องขันฝา', '🔩', 'CP'),
('weighing_scale', 'เครื่องชั่งน้ำหนัก', '⚖️', 'WS'),
('granule_packer', 'เครื่อง แบบเม็ด', '💊', 'TB'),
('packaging_machine', 'เครื่องบรรจุ', '🛍️', 'PK'),
('plastic_capping', 'เครื่องขันฝาพลาสติก', '🥤', 'PC'),
('labeling_machine', 'เครื่องติดฉลาก', '🏷️', 'LM'),
('screen_pack', 'เครื่องสกรีนแพค', '🎨', 'SP'),
('sticker_labeler', 'เครื่องติดสติกเกอร์', '🏷️', 'SL'),
('bubble_wrap', 'เครื่องทำบับเบิ้ลกันกระแทก', '🫧', 'BB'),
('strapping_machine', 'เครื่องรัดกล่อง', '📦', 'SR');

-- 3. Insert Products (สินค้าเครื่องซีล HUALIAN เริ่มต้น)
INSERT INTO products (id, barcode, name, category_id, cost_price, branch_price, sell_price, stock_office, stock_kookkai, stock_big, min_stock, image, unit, is_popular) VALUES
('DY-001', 'DY-001', 'FR-900S เครื่องซีลสายพาน แนวนอน', 'sealer', 3800.00, 4200.00, 4900.00, 2, 0, 5, 3, '📠', 'เครื่อง', TRUE),
('DY-002', 'DY-002', 'FR-900V เครื่องซีลสายพาน แนวตั้ง', 'sealer', 4200.00, 5000.00, 5500.00, 2, 2, 5, 2, '📠', 'เครื่อง', TRUE),
('DY-003', 'DY-003', 'FRD-1000W เครื่องซีลสายพานเติมไนโตรเจน', 'sealer', 7500.00, 8800.00, 9900.00, 1, 0, 0, 1, '📠', 'เครื่อง', FALSE),
('DY-004', 'DY-004', 'SF-150W เครื่องซีลสายพานต่อเนื่อง สเตนเลส', 'sealer', 4800.00, 5200.00, 6200.00, 0, 0, 6, 2, '📠', 'เครื่อง', TRUE),
('DY-005', 'DY-005', 'FS-300 เครื่องซีลถุงมือกด 12 นิ้ว (เหล็กหล่อ)', 'sealer', 650.00, 950.00, 950.00, 0, 0, 30, 5, '🎛️', 'เครื่อง', TRUE),
('DY-006', 'DY-006', 'PFS-200 เครื่องซีลถุงมือกด 8 นิ้ว (พลาสติก)', 'sealer', 350.00, 590.00, 590.00, 0, 0, 40, 5, '🎛️', 'เครื่อง', FALSE);

-- 4. Insert Customers (ลูกค้าออกใบกำกับภาษี)
INSERT INTO customers (id, name, address, phone, tax_id) VALUES
('XL-00001', 'สมชาย ดีเลิศ', '123/45 ถ.พหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400', '081-234-5678', '1234567890123'),
('XL-00002', 'สมศรี รักเรียน', '88/9 ม.5 ต.บางเขน อ.เมือง นนทบุรี 11000', '089-876-5432', '9876543210987'),
('XL-00003', 'สมเจตน์ ใจดี', '999 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110', '085-555-5555', '1100501234567');

-- 5. Insert Promotions
INSERT INTO promotions (id, code, name, type, value, min_purchase, active) VALUES
('p1', 'HUA10', 'ส่วนลดลูกค้าใหม่ 10%', 'percent', 10.00, 1000.00, TRUE),
('p2', 'HUASAVE', 'ลดทันที 500 บาท', 'fixed', 500.00, 5000.00, TRUE),
('p3', 'EXHIBITION', 'งานแสดงสินค้า ลด 15%', 'percent', 15.00, 10000.00, FALSE),
('p4', 'MEMBER100', 'ส่วนลดสมาชิก 100 บาท', 'fixed', 100.00, 2000.00, TRUE);
