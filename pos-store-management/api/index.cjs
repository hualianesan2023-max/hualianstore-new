const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Configure PostgreSQL connection pool for Neon or Supabase
const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for serverless database connection over SSL
  }
});

// Test connection and initialize tables if not exist
const initDb = async () => {
  let client;
  try {
    client = await pool.connect();
    console.log('Successfully connected to Postgres Database.');

    // 1. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user', 'sale')),
        avatar VARCHAR(10)
      );
    `);

    // 2. Create categories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(10),
        prefix VARCHAR(10)
      );
    `);

    // 3. Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
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
    `);

    // 4. Create customers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(20),
        address TEXT,
        tax_id VARCHAR(20)
      );
    `);

    // 5. Create promotions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id VARCHAR(50) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('percent', 'fixed')),
        value NUMERIC(12, 2) NOT NULL,
        min_purchase NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        active BOOLEAN DEFAULT TRUE
      );
    `);

    // 6. Create sales table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id VARCHAR(50) PRIMARY KEY,
        date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        customer_id VARCHAR(50) REFERENCES customers(id) ON DELETE SET NULL,
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
    `);

    // 7. Create sale_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id VARCHAR(50) REFERENCES sales(id) ON DELETE CASCADE,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE SET NULL,
        product_name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        sell_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        selected_location VARCHAR(50) NOT NULL
      );
    `);

    // 8. Create store_info table
    await client.query(`
      CREATE TABLE IF NOT EXISTS store_info (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        phone VARCHAR(100) NOT NULL,
        tax_id VARCHAR(50) NOT NULL,
        tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 7.00
      );
    `);

    // Seed default users if empty
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO users (id, username, password, name, role, avatar) VALUES
        ('U1', 'admin', '000000', 'ผู้ดูแลระบบ (Admin)', 'admin', '👑'),
        ('U2', 'user', 'user123', 'พนักงานทั่วไป (User)', 'user', '👤'),
        ('U3', 'sale', 'sale123', 'พนักงานขาย (Sale)', 'sale', '💼');
      `);
      console.log('Seeded default users.');
    }

    // Seed default store_info if empty
    const storeCount = await client.query('SELECT COUNT(*) FROM store_info');
    if (parseInt(storeCount.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO store_info (id, name, address, phone, tax_id, tax_rate)
        VALUES ('main', 'ห้างหุ้นส่วนจำกัด หัวเหรียญ อีสาน HUALIAN ESAN LTD.,PART.', 
                'สำนักงานใหญ่ : 841/7 หมู่ 5 ต.หนองจะบก อ.เมืองนครราชสีมา จ.นครราชสีมา 30000', 
                '044-002716 , 084-1844310 (บัญชี) แฟ็ก. 044-248869', 
                '0303547004494', 7.00);
      `);
      console.log('Seeded default store info.');
    }

    // Seed default categories if empty
    const catCount = await client.query('SELECT COUNT(*) FROM categories');
    if (parseInt(catCount.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO categories (id, name, icon, prefix) VALUES
        ('sealer', 'เครื่องซีลสายพาน', '📠', 'DY'),
        ('date_printer', 'เครื่องพิมพ์วันที่', '🖨️', 'PR'),
        ('hand_sealer', 'เครื่องซีลมือกด', '🎛️', 'FS'),
        ('foot_sealer', 'เครื่องซีลเท้าเหยียบ', '👣', 'FT');
      `);
      console.log('Seeded default categories.');
    }

    // Seed default products if empty
    const prodCount = await client.query('SELECT COUNT(*) FROM products');
    if (parseInt(prodCount.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO products (id, barcode, name, category_id, cost_price, branch_price, sell_price, stock_office, stock_kookkai, stock_big, min_stock, image, unit, is_popular) VALUES
        ('DY-001', 'DY-001', 'FR-900S เครื่องซีลสายพาน แนวนอน', 'sealer', 3800.00, 4200.00, 4900.00, 2, 0, 5, 3, '📠', 'เครื่อง', TRUE),
        ('DY-002', 'DY-002', 'FR-900V เครื่องซีลสายพาน แนวตั้ง', 'sealer', 4200.00, 5000.00, 5500.00, 2, 2, 5, 2, '📠', 'เครื่อง', TRUE);
      `);
      console.log('Seeded default products.');
    }

  } catch (err) {
    console.error('Error initializing database tables:', err.message);
  } finally {
    if (client) client.release();
  }
};

initDb();

// ==========================================
// MAPPERS (Db snake_case <-> React camelCase)
// ==========================================

const mapProductFromDb = (row) => ({
  id: row.id,
  barcode: row.barcode,
  name: row.name,
  category: row.category_id,
  costPrice: Number(row.cost_price || 0),
  branchPrice: Number(row.branch_price || 0),
  sellPrice: Number(row.sell_price || 0),
  stockOffice: Number(row.stock_office || 0),
  stockKookkai: Number(row.stock_kookkai || 0),
  stockBig: Number(row.stock_big || 0),
  stock: Number(row.stock_office || 0) + Number(row.stock_kookkai || 0) + Number(row.stock_big || 0),
  minStock: Number(row.min_stock || 10),
  image: row.image || '📦',
  unit: row.unit || 'เครื่อง',
  isPopular: !!row.is_popular
});

const mapCustomerFromDb = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone || '-',
  address: row.address || '-',
  taxId: row.tax_id || '-'
});

const mapPromotionFromDb = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  type: row.type,
  value: Number(row.value || 0),
  minPurchase: Number(row.min_purchase || 0),
  active: !!row.active
});

// ==========================================
// API ENDPOINTS
// ==========================================

// ─── 1. LOAD ALL INITIAL DATA ───────────────────────────────────────────
app.get('/api/init', async (req, res) => {
  try {
    const productsRes = await pool.query('SELECT * FROM products ORDER BY id ASC');
    const categoriesRes = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const customersRes = await pool.query('SELECT * FROM customers ORDER BY id ASC');
    const promotionsRes = await pool.query('SELECT * FROM promotions ORDER BY id ASC');
    const usersRes = await pool.query('SELECT * FROM users ORDER BY id ASC');
    const storeInfoRes = await pool.query('SELECT * FROM store_info WHERE id = \'main\'');
    
    // Load sales with their items
    const salesRes = await pool.query('SELECT * FROM sales ORDER BY date DESC LIMIT 500');
    const saleItemsRes = await pool.query('SELECT * FROM sale_items');

    const mappedProducts = productsRes.rows.map(mapProductFromDb);
    const mappedCustomers = customersRes.rows.map(mapCustomerFromDb);
    const mappedPromotions = promotionsRes.rows.map(mapPromotionFromDb);
    const mappedStoreInfo = storeInfoRes.rows[0] ? {
      name: storeInfoRes.rows[0].name,
      address: storeInfoRes.rows[0].address,
      phone: storeInfoRes.rows[0].phone,
      taxId: storeInfoRes.rows[0].tax_id,
      taxRate: Number(storeInfoRes.rows[0].tax_rate || 7)
    } : {};

    // Group items by sale_id
    const itemsBySaleId = saleItemsRes.rows.reduce((acc, item) => {
      if (!acc[item.sale_id]) acc[item.sale_id] = [];
      acc[item.sale_id].push({
        id: item.product_id,
        productId: item.product_id,
        name: item.product_name,
        sellPrice: Number(item.sell_price || 0),
        costPrice: Number(item.cost_price || 0),
        quantity: Number(item.quantity || 0),
        selectedLocation: item.selected_location
      });
      return acc;
    }, {});

    const mappedSales = salesRes.rows.map(sale => ({
      id: sale.id,
      date: sale.date,
      customer: sale.customer_id ? {
        id: sale.customer_id,
        name: sale.customer_name,
        phone: sale.customer_phone,
        address: sale.customer_address,
        taxId: sale.customer_tax_id
      } : {
        name: sale.customer_name,
        phone: sale.customer_phone,
        address: sale.customer_address,
        taxId: sale.customer_tax_id
      },
      employee: sale.salesperson,
      paymentMethod: sale.payment_method,
      discountCode: sale.discount_code,
      discountAmount: Number(sale.discount_amount || 0),
      subtotal: Number(sale.subtotal || 0),
      tax: Number(sale.tax || 0),
      shippingCost: Number(sale.shipping_cost || 0),
      total: Number(sale.total || 0),
      cashReceived: Number(sale.cash_received || 0),
      change: Number(sale.change || 0),
      applyVat: !!sale.apply_vat,
      isVatInclusive: !!sale.is_vat_inclusive,
      items: itemsBySaleId[sale.id] || []
    }));

    res.json({
      products: mappedProducts,
      categories: categoriesRes.rows,
      customers: mappedCustomers,
      promotions: mappedPromotions,
      users: usersRes.rows,
      storeInfo: mappedStoreInfo,
      sales: mappedSales
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to initialize system data: ' + err.message });
  }
});

// ─── 2. PRODUCTS API ─────────────────────────────────────────────────────
app.post('/api/products', async (req, res) => {
  const p = req.body;
  try {
    const query = `
      INSERT INTO products (id, barcode, name, category_id, cost_price, branch_price, sell_price, stock_office, stock_kookkai, stock_big, min_stock, image, unit, is_popular)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    const values = [
      p.id, p.barcode || p.id, p.name, p.category, 
      Number(p.costPrice || 0), Number(p.branchPrice || p.sellPrice || 0), Number(p.sellPrice || 0),
      Number(p.stockOffice || 0), Number(p.stockKookkai || 0), Number(p.stockBig || 0),
      Number(p.minStock || 10), p.image || '📦', p.unit || 'เครื่อง', p.isPopular ? true : false
    ];
    const result = await pool.query(query, values);
    res.status(201).json(mapProductFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    const query = `
      UPDATE products 
      SET barcode = $1, name = $2, category_id = $3, cost_price = $4, branch_price = $5, sell_price = $6,
          stock_office = $7, stock_kookkai = $8, stock_big = $9, min_stock = $10, image = $11, unit = $12, is_popular = $13
      WHERE id = $14
      RETURNING *
    `;
    const values = [
      p.barcode || p.id, p.name, p.category, 
      Number(p.costPrice || 0), Number(p.branchPrice || p.sellPrice || 0), Number(p.sellPrice || 0),
      Number(p.stockOffice || 0), Number(p.stockKookkai || 0), Number(p.stockBig || 0),
      Number(p.minStock || 10), p.image || '📦', p.unit || 'เครื่อง', p.isPopular ? true : false,
      id
    ];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(mapProductFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. SALES CHECKOUT API (WITH ATOMIC STOCK DEDUCTIONS) ───────────────
app.post('/api/sales', async (req, res) => {
  const s = req.body;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN'); // Start Transaction

    const customerId = s.customer?.id || null;
    const customerName = s.customer?.name || 'ลูกค้าทั่วไป';
    const customerPhone = s.customer?.phone || '-';
    const customerAddress = s.customer?.address || '-';
    const customerTaxId = s.customer?.taxId || '-';

    // 1. Insert Sale Header
    const saleQuery = `
      INSERT INTO sales (
        id, date, customer_id, customer_name, customer_phone, customer_address, customer_tax_id, 
        salesperson, payment_method, discount_code, discount_amount, subtotal, tax, shipping_cost, 
        total, cash_received, change, apply_vat, is_vat_inclusive
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;
    const saleValues = [
      s.id, s.date || new Date().toISOString(), customerId, customerName, customerPhone, customerAddress, customerTaxId,
      s.employee || 'หน้าร้าน', s.paymentMethod, s.discountCode || null, Number(s.discountAmount || 0),
      Number(s.subtotal), Number(s.tax || 0), Number(s.shippingCost || 0), Number(s.total),
      Number(s.cashReceived || 0), Number(s.change || 0), s.applyVat ? true : false, s.isVatInclusive ? true : false
    ];
    await client.query(saleQuery, saleValues);

    // 2. Insert Sale Items and deduct inventory atomically
    for (const item of s.items) {
      // Check current stock limit
      const productRes = await client.query('SELECT * FROM products WHERE id = $1', [item.productId]);
      if (productRes.rows.length === 0) {
        throw new Error(`Product not found: ${item.name}`);
      }
      
      const p = productRes.rows[0];
      const loc = item.selectedLocation;
      const qty = Number(item.quantity);

      // Check stock and set update query
      let updateStockQuery = '';
      if (loc === 'โกดังกุ๊กไก่') {
        if (p.stock_kookkai < qty) throw new Error(`Stock insufficient in กุ๊กไก่: ${p.name}`);
        updateStockQuery = 'UPDATE products SET stock_kookkai = stock_kookkai - $1 WHERE id = $2';
      } else if (loc === 'ออฟฟิศ') {
        if (p.stock_office < qty) throw new Error(`Stock insufficient in ออฟฟิศ: ${p.name}`);
        updateStockQuery = 'UPDATE products SET stock_office = stock_office - $1 WHERE id = $2';
      } else { // 'โกดังใหญ่'
        if (p.stock_big < qty) throw new Error(`Stock insufficient in โกดังใหญ่: ${p.name}`);
        updateStockQuery = 'UPDATE products SET stock_big = stock_big - $1 WHERE id = $2';
      }

      // Deduct stock in DB
      await client.query(updateStockQuery, [qty, item.productId]);

      // Insert sale item
      const itemQuery = `
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, cost_price, sell_price, selected_location)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;
      const itemValues = [
        s.id, item.productId, item.name, qty, 
        Number(item.costPrice || 0), Number(item.sellPrice || 0), loc
      ];
      await client.query(itemQuery, itemValues);
    }

    await client.query('COMMIT'); // Commit Transaction
    console.log(`Checkout sale successful: ${s.id}`);
    res.status(201).json({ success: true, saleId: s.id });

  } catch (err) {
    await client.query('ROLLBACK'); // Rollback Transaction on failure
    console.error('Error during sale checkout transaction:', err.message);
    res.status(500).json({ error: 'Failed to process checkout: ' + err.message });
  } finally {
    client.release();
  }
});

// ─── 4. CUSTOMERS API ────────────────────────────────────────────────────
app.post('/api/customers', async (req, res) => {
  const c = req.body;
  try {
    const query = `
      INSERT INTO customers (id, name, phone, address, tax_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [c.id, c.name, c.phone || '', c.address || '', c.taxId || ''];
    const result = await pool.query(query, values);
    res.status(201).json(mapCustomerFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  const c = req.body;
  try {
    const query = `
      UPDATE customers 
      SET name = $1, phone = $2, address = $3, tax_id = $4
      WHERE id = $5
      RETURNING *
    `;
    const values = [c.name, c.phone || '', c.address || '', c.taxId || '', id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(mapCustomerFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    res.json({ message: 'Customer deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. USERS API ────────────────────────────────────────────────────────
app.post('/api/users', async (req, res) => {
  const u = req.body;
  try {
    const query = `
      INSERT INTO users (id, username, password, name, role, avatar)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [u.id, u.username, u.password, u.name, u.role, u.avatar || '👤'];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const u = req.body;
  try {
    const query = `
      UPDATE users 
      SET username = $1, password = $2, name = $3, role = $4, avatar = $5
      WHERE id = $6
      RETURNING *
    `;
    const values = [u.username, u.password, u.name, u.role, u.avatar || '👤', id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. PROMOTIONS API ───────────────────────────────────────────────────
app.post('/api/promotions', async (req, res) => {
  const p = req.body;
  try {
    const query = `
      INSERT INTO promotions (id, code, name, type, value, min_purchase, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [p.id, p.code, p.name, p.type, Number(p.value), Number(p.minPurchase || 0), p.active];
    const result = await pool.query(query, values);
    res.status(201).json(mapPromotionFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/promotions/:id', async (req, res) => {
  const { id } = req.params;
  const p = req.body;
  try {
    const query = `
      UPDATE promotions 
      SET code = $1, name = $2, type = $3, value = $4, min_purchase = $5, active = $6
      WHERE id = $7
      RETURNING *
    `;
    const values = [p.code, p.name, p.type, Number(p.value), Number(p.minPurchase || 0), p.active, id];
    const result = await pool.query(query, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Promotion not found' });
    res.json(mapPromotionFromDb(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/promotions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM promotions WHERE id = $1', [id]);
    res.json({ message: 'Promotion deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. STORE INFO API ───────────────────────────────────────────────────
app.put('/api/store-info', async (req, res) => {
  const s = req.body;
  try {
    const query = `
      UPDATE store_info 
      SET name = $1, address = $2, phone = $3, tax_id = $4, tax_rate = $5
      WHERE id = 'main'
      RETURNING *
    `;
    const values = [s.name, s.address, s.phone, s.taxId, Number(s.taxRate || 7)];
    const result = await pool.query(query, values);
    const updated = result.rows[0];
    res.json({
      name: updated.name,
      address: updated.address,
      phone: updated.phone,
      taxId: updated.tax_id,
      taxRate: Number(updated.tax_rate)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SERVE PRODUCTION FRONTEND STATIC FILES (LOCAL ONLY)
// ==========================================
app.use(express.static(path.join(__dirname, '..', 'dist')));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// Start Server (If run directly via node, not on Vercel Serverless Function)
if (require.main === module || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Backend server is running on port ${PORT}`);
  });
}

// Export the app for Vercel Serverless Function
module.exports = app;
