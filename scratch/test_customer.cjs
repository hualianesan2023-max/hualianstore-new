require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  console.log('Testing customer inserts...');
  
  // Test 1: Long ID
  const test1 = await supabase.from('customers').insert({
    id: 'XL-TEST-ID-THAT-IS-VERY-LONG-MORE-THAN-20-CHARACTERS',
    name: 'Test Name',
    phone: '0812345678',
    address: 'Test Address',
    tax_id: '12345'
  });
  console.log('Test 1 (Long ID) error:', test1.error);

  // Test 2: Long Phone
  const test2 = await supabase.from('customers').insert({
    id: 'XL-TEST2',
    name: 'Test Name 2',
    phone: '0812345678-MORE-THAN-20-CHARACTERS-HERE',
    address: 'Test Address',
    tax_id: '12345'
  });
  console.log('Test 2 (Long Phone) error:', test2.error);

  // Test 3: Long Tax ID
  const test3 = await supabase.from('customers').insert({
    id: 'XL-TEST3',
    name: 'Test Name 3',
    phone: '0812345678',
    address: 'Test Address',
    tax_id: '12345-MORE-THAN-20-CHARACTERS-HERE'
  });
  console.log('Test 3 (Long Tax ID) error:', test3.error);
}

test();
