import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// สร้าง Supabase Client สำหรับฝั่งหน้าบ้าน (Vite React)
export const supabase = createClient(supabaseUrl, supabaseKey);
