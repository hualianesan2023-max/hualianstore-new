require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  console.log('Fetching customers...');
  const { data, error } = await supabase.from('customers').select('*').limit(5);
  console.log('Customers in database:', data);
  console.log('Error:', error);
}

check();
