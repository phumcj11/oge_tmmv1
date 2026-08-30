# Prompt สร้างระบบ Ofero TMM System (ฉบับเต็ม)

> คัดลอกข้อความด้านล่างนี้ทั้งหมดไปเป็น prompt เริ่มต้นให้ AI สร้างระบบใหม่

---

สร้างระบบเว็บแอปพลิเคชันชื่อ **"Ofero TMM System"** — ระบบบริหารงาน Trade Marketing Manager สำหรับแบรนด์รถจักรยานยนต์ไฟฟ้า Ofero (ขายผ่านดีลเลอร์ ~115 ร้านทั่วไทย) ใช้ภาษาไทยทั้งระบบ

## 1. เทคโนโลยี (ข้อบังคับ — เน้นเรียบง่าย ไม่พึ่ง framework หนัก)
- **Backend:** Node.js + Express + better-sqlite3 (ฐานข้อมูล SQLite ไฟล์เดียว, ใช้ WAL mode)
- **Frontend:** Single-Page App แบบ vanilla JavaScript ล้วน (ไม่ใช้ React/Vue) — โครงสร้าง `public/index.html`, `public/app.js`, `public/styles.css`, `public/login.html`, `public/login.js`
- **Auth:** เขียนเองด้วย Node `crypto` (scrypt hash + random token session ใน cookie) ไม่ใช้ไลบรารี auth ภายนอก
- **อัปโหลดไฟล์:** multer (เก็บลงโฟลเดอร์ `uploads/`, จำกัด 15MB, อยู่หลัง auth gate)
- **แผนที่:** Leaflet + Leaflet.markercluster (เก็บไฟล์ไว้ใน `public/vendor/` ไม่พึ่ง CDN ตอนรัน), tile จาก OpenStreetMap
- **ฟอนต์:** Noto Sans Thai (Google Fonts)
- **จัดการโปรเซส:** pm2 (ชื่อแอป `ofero-tmm`, port 4173)

## 2. แบรนด์/ดีไซน์ (Ofero CI)
- สีหลัก: **ดำ (#111) + เขียวมะนาว (#6FD749)** + เขียวเข้ม accent (#2E9E1E)
- โมเดิร์น มน (border-radius ~16px), เงานุ่ม, การ์ดสะอาด
- โลโก้ Ofero บนแถบ nav สีดำ
- Responsive รองรับมือถือ (โดยเฉพาะหน้าพนักงาน)

## 3. ระบบสิทธิ์ผู้ใช้ (4 role)
- **admin:** จัดการทุกอย่าง + จัดการผู้ใช้
- **editor:** แก้ข้อมูลได้ แต่ไม่จัดการผู้ใช้
- **viewer:** ดูอย่างเดียว (POST/PUT/DELETE ถูกบล็อก)
- **staff (พนักงานหน้างาน):** เห็นเฉพาะ "งานของฉัน" บนมือถือ ส่งงานได้เฉพาะกิจกรรมที่ได้รับมอบหมาย
- มี user เริ่มต้น `admin / ofero1234` ตอน seed ครั้งแรก
- ทุกหน้าอยู่หลัง login (ยกเว้นหน้า login + assets)

## 4. โมดูลทั้งหมด

### 4.1 Dashboard
ภาพรวม: ยอด sell-in รวม, ดีลเลอร์ active, ยอดค้างชำระ, การ์ด Timeline กิจกรรม, สรุป POSM

### 4.2 Dealer (ดีลเลอร์) — มี 5 แท็บย่อย
- **รายชื่อ:** ตารางค้นหา/กรอง tier, sell-in, ค้างชำระ, PO, ปุ่มดู 360°, เพิ่ม/ลบ, export CSV
- **แผนที่:** Leaflet ปักหมุดดีลเลอร์ทุกร้านที่มีพิกัด แบบ marker clustering, กรองตามภาค/tier, คลิกหมุด → popup รายละเอียด (sell-in/ค้างชำระ/PO/เบอร์) + ปุ่มดู 360° + ลิงก์ Google Maps
- **ภาพรวม:** สถิติรวมของดีลเลอร์
- **แบ่งตามภาค:** แผนที่ประเทศไทยแบบ choropliteh/SVG หรือสรุปรายภาค (province→region mapping)
- **AI Insights:** วิเคราะห์แบบ rule-based (ร้านเสี่ยง=ค้างชำระ>sell-in, ค้างชำระสูง, ศักยภาพสูง, ยังไม่มี tier, เงียบ)
- **Dealer 360° (popup):** รวมทุกอย่างของร้านเดียว — KPI (sell-in/sell-out/ค้างชำระ/ความพร้อมร้าน/กิจกรรม), กิจกรรมของร้าน, sell-out รายรุ่น, มาตรฐานร้าน (readiness+funnel), ฟอร์มโปรไฟล์ (tier/เซลล์/เบอร์/LINE/เครดิต), และ **ตัวแก้พิกัด** (แผนที่ย่อลากหมุดได้ + วางลิงก์ Google Maps แล้ว parse lat/lon อัตโนมัติ, ตรวจขอบเขตไทย)

### 4.3 Project (โครงการ/แคมเปญ) — ชั้นครอบ Event
- โครงการ = แผนงานที่มีหลายกิจกรรมย่อยข้างใน (มีชื่อ/เป้า/งบ/ช่วงเวลา/สถานะ/สี/ร้านหลัก)
- การ์ดโครงการแสดง rollup: ความคืบหน้า (กิจกรรมเสร็จ/ทั้งหมด), KPI รวม (sell-out/lead/test), งบที่ใช้รวม (รวมอัตโนมัติจากกิจกรรมข้างใน)
- **ผูกกิจกรรมหลายอันทีเดียว (bulk assign):** หน้าเลือกกิจกรรมพร้อม checkbox + ค้นหา + เลือกทั้งหมด
- ตัวกรองโครงการใน Event Hub, ปุ่ม "เปิดกิจกรรม" กรองไปที่ Event Hub

### 4.4 Event Hub (กิจกรรม) — มี 6 มุมมอง
เก็บข้อมูลตามฟอร์ม "กิจกรรม ARM" ของ Lark: แผนก, ชื่อกิจกรรม, ร้าน/สาขา, ลูกค้า, ช่วงเวลา, ประเภท (activation/training/testride/other), ระดับร้าน A/B, เป้าหมาย, ผู้รับผิดชอบ, บัญชีธนาคาร, **งบ (budget_lines), เตรียมสต็อก (stock_prep), Action Plan (ก่อน/ระหว่าง/หลังงาน), Manpower (ทีมงาน)** เก็บเป็น JSON, และ **เป้าหมาย vs ผลจริง** (sell-out/lead/test ride/training)
- **ตาราง:** รายการกิจกรรม + KPI เป้า vs ผล
- **ปฏิทิน:** ปักกิจกรรมตามวัน
- **Gantt:** แท่งไทม์ไลน์ จัดกลุ่มได้ทั้งตามร้านหรือตามโครงการ, เส้นวันนี้, งานเลยกำหนดกรอบแดง, รองรับวันที่ทั้งแบบ ISO และไทย ("19 ก.ย. 69" = พ.ศ.)
- **Board (Kanban):** ลากการ์ดข้ามคอลัมน์สถานะ (drag-drop) แบบ Notion, แสดง % ความพร้อม Action Plan
- **Performance:** Funnel รวม, ต้นทุน/Lead, ต้นทุน/ปิดการขาย, coverage
- **ติดตามทีม:** ตารางสถานะการส่งงานของพนักงานทุกคน (มอบหมายให้ใคร, สถานะส่งงาน, เตรียมงานกี่%, ผลจริง, จำนวนรูป)
- **ตัวแก้กิจกรรม (editor):** ฟอร์มเต็มพร้อม Action Plan/Manpower แบบตารางแก้ได้, มอบหมายพนักงาน (checkbox), checklist เตรียมงาน, และ **แนบรูป/ไฟล์หน้างาน** (อัปโหลด thumbnail grid + ลบ)

### 4.5 POSM
- รายการ POSM (ใช้ซ้ำ/สิ้นเปลือง), จำนวน, สภาพ, สถานะ (ในคลัง/เบิกออก/ซ่อม)
- **มาตรฐานร้าน A/B** (std_a/std_b) ต่อรายการ + ปุ่มโหลดชุดมาตรฐานตามแผน
- เบิก-คืน (checkout/checkin) ผูกกับกิจกรรม, แจ้งเตือนสต็อกต่ำ + เกินกำหนดคืน

### 4.6 Sell-out
บันทึกยอดขายออก + สต็อกคงเหลือ รายดีลเลอร์/เดือน/รุ่น

### 4.7 มาตรฐานร้าน (Store Audit)
Checklist 7 ข้อ (รถตรงมาตรฐาน, ป้ายครบ, รถสะอาด, อนุญาตนั่ง/ทดลองขับ, ผู้รับผิดชอบผ่านอบรม, คอนเทนต์ออนไลน์ตามแผน, ติดตามลูกค้า) → คำนวณ % ความพร้อม + funnel (lead/test/quote/sold + conversion)

### 4.8 งานพนักงานหน้างาน (staff — มือถือ)
- login แล้วเห็นหน้า "งานของฉัน" ทันที (ซ่อนเมนูอื่น)
- เห็นเฉพาะกิจกรรมที่ถูกมอบหมาย → แตะเปิดหน้าส่งงาน:
  - ✅ Checklist เตรียมงาน (ติ๊กทีละขั้น + progress bar)
  - 📸 ถ่าย/แนบรูปหน้างาน
  - 📊 กรอกผลจริง (sell-out/lead/test/training เทียบเป้า)
  - 🚦 เปลี่ยนสถานะงาน
- ระบบตรวจสิทธิ์ฝั่ง server: staff แก้ได้เฉพาะงานตัวเอง (เข้างานคนอื่น/สร้างกิจกรรม/จัดการผู้ใช้ = 403)

### 4.9 จัดการผู้ใช้ (admin เท่านั้น)
เพิ่ม/แก้/ลบผู้ใช้ + ตั้งสิทธิ์ + ตั้งรหัสใหม่, กันลบ admin คนสุดท้าย

## 5. โครงสร้างข้อมูล (ตาราง SQLite หลัก)
`dealers` (code, name, province, lat, lon, phone, line, tier, sellin, retail, profit, units, po, outstanding, sales_rep, credit), `products`, `projects` (name, goal, owner, dealer_code, start/end_date, status, budget, color), `events` (~40 ฟิลด์ รวม project_id, assignees, prep JSON, action_plan/manpower/budget_lines JSON, targets), `posm` + `posm_moves`, `sellout`, `store_audit`, `attachments` (event_id, filename, uploaded_by...), `users`, `sessions`, `meta`
- Seed ข้อมูลตั้งต้นจาก `seed-data.json` ตอนฐานว่าง; migration แบบ `PRAGMA table_info` + `ALTER TABLE ADD COLUMN`

## 6. บริบทธุรกิจ (ใส่เป็นข้อมูลอ้างอิง)
- Ofero มี 8-9 รุ่น: Ledo 3 Lit (13,900), Galaxy 3 Lit (15,900, best seller 2 ล้อ), Magical, Stareer, Gemini (22,900, best seller 3 ล้อ), Gemini Max, Leader, Leader Max
- โครงสร้างราคา: ต้นทุน = ราคาที่ดีลเลอร์ซื้อ (= sell-in ของเรา), กำไร = กำไรดีลเลอร์
- อ้างอิงมาตรฐานร้าน A (SR)/B ตามแผน retail support (จำนวนรถ, POSM, ป้ายข้อมูล 7 หมวด, KPI)

## 7. Deployment
- รันบน VPS แยกของตัวเอง (Ubuntu + Node 20 + pm2 + **Nginx reverse proxy** + Let's Encrypt SSL)
- Nginx proxy :443 → 127.0.0.1:4173, ตั้ง `client_max_body_size 20M` รองรับอัปโหลดรูป
- Source บน GitHub, deploy ด้วยสคริปต์ที่แตะเฉพาะโปรเจกต์นี้ (git pull + npm install + pm2 restart) ไม่ยุ่ง global config

## 8. ข้อกำหนดพิเศษ
- ภาษาไทยทั้งระบบ, เงินแสดงแบบมีคอมม่า
- เก็บรหัสผ่านแบบ hash เท่านั้น, session ใน httpOnly cookie
- ทุก endpoint ที่เขียนข้อมูลต้องเช็คสิทธิ์ role
- โค้ดสะอาด อ่านง่าย คอมเมนต์ภาษาไทยได้
