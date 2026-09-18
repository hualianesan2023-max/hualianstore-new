require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  console.log('Testing quotation table inserts...');
  
  // 1. Let's try inserting the customer first
  const customerResult = await supabase.from('customers').insert({
    id: 'XL-TEST-SSP',
    name: 'บริษัท เอส เอส พี แมชชีน แอนด์ เซอร์วิส จำกัด',
    phone: '0946836111',
    address: '270/65 ซอยพระรามสามซอยสามร้อย แขวงบางโพงพาง เขตยานนาวา กรุงเทพมหานคร 10150',
    tax_id: '0105566128997'
  });
  console.log('Customer Insert Result:', customerResult.error ? customerResult.error : 'SUCCESS');

  // 2. Let's try inserting the quotation
  const quotationResult = await supabase.from('quotations').insert({
    id: 'QT6907-TEST-SSP',
    date: new Date().toISOString(),
    customer_type: 'company',
    customer_id: 'XL-TEST-SSP',
    customer_name: 'บริษัท เอส เอส พี แมชชีน แอนด์ เซอร์วิส จำกัด',
    customer_phone: '0946836111',
    customer_address: '270/65 ซอยพระรามสามซอยสามร้อย แขวงบางโพงพาง เขตยานนาวา กรุงเทพมหานคร 10150',
    customer_tax_id: '0105566128997',
    company_branch: 'สำนักงานใหญ่',
    validity_days: '30 วัน',
    delivery_days: '7 วัน',
    payment_terms: 'โอนเงินเข้าบัญชี',
    salesperson: 'ผู้ดูแลระบบ',
    discount_amount: 0,
    shipping_cost: 600,
    installation_cost: 0,
    vat_type: 'inclusive',
    subtotal: 4800,
    tax: 320.56,
    total: 5500
  });
  console.log('Quotation Insert Result:', quotationResult.error ? quotationResult.error : 'SUCCESS');

  // 3. Clean up
  await supabase.from('quotations').delete().eq('id', 'QT6907-TEST-SSP');
  await supabase.from('customers').delete().eq('id', 'XL-TEST-SSP');
}

test();
