# AGENTS.md — Project memory for AI agents (Antigravity)

> ไฟล์นี้คือ "ความจำของโปรเจกต์" ให้ AI agent อ่านอัตโนมัติเมื่อเปิดโฟลเดอร์นี้เป็น Workspace
> ใช้สำหรับย้ายไปทำงานต่อที่เครื่องอื่น — อัปเดตไฟล์นี้ทุกครั้งที่มีงานสำคัญเสร็จ

## ภาพรวม
ระบบ POS + จัดการคลังสินค้า/อะไหล่ สำหรับร้านขายเครื่องซีล/เครื่องแพ็ค (ภาษาไทยทั้งหมด)
ผู้ใช้สื่อสารเป็นภาษาไทย — ตอบเป็นภาษาไทย

- **Frontend:** React 19 + Vite 8 (`src/`), build เป็นไฟล์เดียวด้วย vite-plugin-singlefile
- **Backend เสริม:** Express (`api/index.cjs`, `npm run start`) — เสิร์ฟรูปอะไหล่จากเครื่อง
- **Database:** Supabase (คลาวด์) — ข้อมูลอยู่บนคลาวด์ ทุกเครื่องเห็นชุดเดียวกัน
- **ระบบเดิม:** Microsoft Access (`D:\โปรแกรมคลัง\Mydata\Store_v.mdb`) — ข้อมูลอะไหล่ถูก import มาจากที่นี่

## กฎสำคัญ (ห้ามละเมิด)
1. ระบบเดิมถือเป็น **Lv.1 baseline** — ห้ามทำโค้ด/ตารางเดิมพัง แก้แบบเพิ่มเติมเท่านั้น
2. PowerShell บนเครื่องผู้ใช้บล็อก `npm` — ต้องใช้ **`npm.cmd`** เสมอ (เช่น `npm.cmd run dev`)
3. ไฟล์ `.env` ไม่อยู่ใน zip — ต้องมีคีย์: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `PORT`
4. การเปลี่ยน schema ฐานข้อมูล: เขียนเป็นไฟล์ `.sql` ในรากโปรเจกต์ แล้วให้ผู้ใช้รันเองใน Supabase SQL Editor

## วิธีรัน
```powershell
npm.cmd install
npm.cmd run dev      # http://localhost:5173
npm.cmd run build    # ตรวจว่า build ผ่าน (exit code 1 จาก "npm notice" ไม่ใช่ error)
```

## โครงสร้างหลัก
- `src/data/store.jsx` — global state + ทุกการเรียก Supabase (ขาย, ตัดสต็อก, ลูกค้า ฯลฯ)
- `src/pages/` — POS, Products, Inventory, Quotation, Customers, Repair, ProfitLoss, Dashboard, Settings, Users
- `src/pages/Parts*.jsx` — โมดูลอะไหล่ (ใหม่): `PartsInventory` (เสร็จแล้ว), `PartsPOS`, `PartsHistory`, `PartsQuotation` (ยังไม่ได้ทำ)
- `src/components/Sidebar.jsx` — เมนู (กลุ่ม "การจัดการอะไหล่"), routes อยู่ใน `src/App.jsx`

## ฐานข้อมูล (Supabase)
- `products` — สินค้า: `id`, `barcode` (เช่น `BT-049`), `name`, `unit`, `cost_price`, `branch_price`, `sell_price`,
  สต็อกแยก 3 คลัง: `stock_office` (ออฟฟิศ), `stock_kookkai` (โกดังกุ๊กไก่), `stock_big` (โกดังใหญ่), `min_stock`
- `sales`, `sale_items`, `quotations`, `quotation_items`, `customers`, `promotions`, `users`, `categories`, `store_info`
- `customer_repairs`, `shop_repairs`, `customer_deliveries` (ดู `repair_tables.sql`)
- `parts` — อะไหล่ 795 รายการ: `part_code` (เช่น `HL-000001`, unique), `name`, `category`, `type`, `quantity`,
  `location`, `cost_price`, `dealer_price`, `sell_price`, `image_name`

## รายละเอียดที่ต้องรู้
- **รูปภาพในเครื่อง:**
  - **รูปอะไหล่ (795 รูป):** `D:\โปรแกรมคลัง\Mydata\images\<part_code>.jpg`
  - **รูปสินค้า/เครื่องจักร (278 รูป):** `D:\โปรแกรมคลัง\Mydata\moter\<barcode>.jpg` (เช่น `dy008.jpg`, `bt001.jpg`)
  - เสิร์ฟผ่าน Vite/Express ที่ `/local-parts-images/` และ `/local-product-images/`
  - มีโมดูล `src/utils/localImageProvider.jsx` พร้อมแถบปุ่ม `LocalImageToolbar` ในหน้าคลังสินค้า (Products), สต็อก (Inventory), และคลังอะไหล่ (PartsInventory)
  - รองรับทั้งการตรวจจับอัตโนมัติจากเครื่อง และปุ่มเลือกโฟลเดอร์ผ่านเบราว์เซอร์ (`<input webkitdirectory>`) ในกรณีที่ย้ายไปรันเครื่องอื่น
- **Import Excel อะไหล่จาก Access:** map คอลัมน์ `idname, name_h, type_h, chanid_h, amount_h, add_h, pic_h, para_h, para_tuwtan, para_sale`
  ต้อง dedupe ตาม `part_code` ก่อน upsert (Postgres error: "ON CONFLICT DO UPDATE command cannot affect row a second time")
- **หน้าคลังอะไหล่:** แสดงหน้าละ 15 รายการ (`ITEMS_PER_PAGE = 15`), header แบบกะทัดรัด, ชนิด/ประเภทดึงจาก DB ผ่าน `<datalist>`
- **สต็อกทศนิยม:** สินค้าบางตัวขายเป็นกิโล เช่น `BT-049` ฟิล์มสกีนแพค (กิโลกรัม), `BT-050` (แพ็ค)
  โค้ดรองรับทศนิยมแล้ว (ปัดเศษ 3 ตำแหน่งด้วย `r3()` ใน store.jsx) — ต้องรัน `decimal_stock_migration.sql` ใน Supabase ก่อน

## สถานะงาน / สิ่งที่ค้าง
- [x] หน้าคลังอะไหล่ (เพิ่ม/ลบ/แก้ไข, import Excel, แสดงรูป, แบ่งหน้า 15 รายการ)
- [x] โค้ดรองรับตัดสต็อกเป็นทศนิยม
- [x] ระบบเชื่อมรูปภาพในเครื่อง (รองรับทั้งโฟลเดอร์ `images` อะไหล่ และ `moter` สินค้า พร้อมปุ่มเลือกโฟลเดอร์ในหน้าเว็บ)
- [x] หน้าขายอะไหล่ PartsPOS (ดีไซน์และฟังก์ชันเหมือนหน้าขายเครื่อง POS: แสดงรูปอะไหล่, ราคาขาย/ตัวแทน, ตะกร้า, ลูกค้า, ตัดสต็อกจริง, ออกบิลใบเสร็จ IVS)
- [ ] **ยืนยันกับผู้ใช้ว่ารัน `decimal_stock_migration.sql` แล้วหรือยัง** แล้วทดสอบตัด BT-049 จำนวน 0.5
- [ ] หน้า PartsHistory (ประวัติการขายอะไหล่), PartsQuotation (ใบเสนอราคาอะไหล่) — ผู้ใช้ต้องการทำทีละหน้า
