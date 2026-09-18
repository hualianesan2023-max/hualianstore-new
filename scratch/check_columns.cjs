require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function test() {
  console.log('Testing column insertion lengths...');
  
  // Let's test insert to customers with a long address (e.g. 50 characters)
  const test1 = await supabase.from('customers').insert({
    id: 'XL-TEST-LEN-1',
    name: 'Test Name',
    phone: '12345',
    address: 'A very long address that is definitely more than twenty characters long.',
    tax_id: '12345'
  });
  console.log('Long Address insert result:', test1.error ? test1.error.message : 'SUCCESS');

  // Let's test insert with a long phone
  const test2 = await supabase.from('customers').insert({
    id: 'XL-TEST-LEN-2',
    name: 'Test Name',
    phone: '081234567890123456789012345',
    address: 'Short',
    tax_id: '12345'
  });
  console.log('Long Phone insert result:', test2.error ? test2.error.message : 'SUCCESS');

  // Let's test insert with a long tax id
  const test3 = await supabase.from('customers').insert({
    id: 'XL-TEST-LEN-3',
    name: 'Test Name',
    phone: '12345',
    address: 'Short',
    tax_id: '01234567890123456789012345'
  });
  console.log('Long Tax ID insert result:', test3.error ? test3.error.message : 'SUCCESS');

  // Clean up if any succeeded
  await supabase.from('customers').delete().in('id', ['XL-TEST-LEN-1', 'XL-TEST-LEN-2', 'XL-TEST-LEN-3']);
}

test();
