const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

// สร้าง Supabase Client สำหรับฝั่งหลังบ้าน
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
