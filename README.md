# HUALIAN POS & Store Management System

ระบบจัดการการขายหน้าร้าน (POS), สินค้า, ใบเสนอราคา, งานซ่อม (นัดซ่อมลูกค้า & เครื่องซ่อมหน้าร้าน) และรายงาน พร้อมเชื่อมต่อฐานข้อมูล Supabase

---

## 🚀 วิธีการนำขึ้น GitHub และ Deploy บน Netlify

### ขั้นตอนที่ 1: อัปโหลดโค้ดขึ้น GitHub
1. สร้าง Repository ใหม่บน GitHub (เช่น `pos-store-management`)
2. เปิด Terminal ในโฟลเดอร์นี้ แล้วรันคำสั่ง:
```bash
git init
git add .
git commit -m "Initial commit for Netlify deployment"
git branch -M main
git remote add origin <URL_REPOSITORY_ของท่าน>
git push -u origin main
```

---

### ขั้นตอนที่ 2: Deploy บน Netlify
1. เข้าสู่ระบบ [Netlify](https://app.netlify.com/)
2. กด **Add new site** > **Import an existing project**
3. เลือก **GitHub** และเลือก Repository ที่สร้างไว้
4. ตั้งค่า Build Settings:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
5. เพิ่ม **Environment variables** (ในแท็บ Environment variables หรือ Site configuration > Environment variables):
   - `VITE_SUPABASE_URL` = `https://sonywgdxrhgqqmmogtjn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvbnl3Z2R4cmhncXFtbW9ndGpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTEyNzIsImV4cCI6MjA5NTk2NzI3Mn0.m2dOAsiPSLTVwjWeMlqaXgTJQpvK9OXSl52FQPuFeH0`
6. กด **Deploy Site**

---

## 🗄️ การตั้งค่าฐานข้อมูล Supabase
รัน SQL Script ใน Supabase SQL Editor:
1. `database_schema.sql` (โครงสร้างตารางหลัก)
2. `repair_tables.sql` (ตารางงานซ่อม `customer_repairs` และ `shop_repairs`)

---

## 💻 สำหรับการรันในเครื่อง (Local Development)
```bash
npm install
npm run dev
```
เปิดบราวเซอร์ที่: `http://localhost:5173/`

