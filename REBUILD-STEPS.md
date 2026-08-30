# Prompt แบบแบ่ง Step — สร้าง Ofero TMM System ทีละขั้น

วิธีใช้: ป้อน **ทีละ step** ให้ AI, ทดสอบให้ผ่านก่อน แล้วค่อยป้อน step ถัดไป
(ใช้คู่กับ `REBUILD-PROMPT.md` ที่เป็นสเปกละเอียด — step ไหนไม่ชัดให้ AI อ่านสเปกข้อที่อ้างถึง)

> ก่อนเริ่ม step 1 วางสเปกเต็ม (REBUILD-PROMPT.md) ให้ AI อ่านก่อนหนึ่งครั้ง แล้วบอกว่า "เราจะสร้างทีละ step ตามนี้"

---

## Step 1 — วางแกนหลัก + Auth
```
สร้างโครงระบบ "Ofero TMM System" ด้วย Node.js + Express + better-sqlite3 (SQLite, WAL) 
เป็น Single-Page App แบบ vanilla JS ล้วน (index.html + app.js + styles.css + login.html)
ทำ: (1) โครงเซิร์ฟเวอร์ Express รันที่ port 4173 (2) ระบบ login เขียนเองด้วย Node crypto 
(scrypt hash รหัสผ่าน + session token ใน httpOnly cookie) (3) role admin/editor/viewer 
โดย viewer เขียนข้อมูลไม่ได้ (4) auth gate กันทุกหน้ายกเว้น login (5) db.js สร้างตาราง 
users/sessions + seed user admin/ofero1234 ครั้งแรก (6) หน้า shell มี nav แบรนด์ Ofero 
(ดำ #111 + เขียวมะนาว #6FD749) ฟอนต์ Noto Sans Thai ภาษาไทยทั้งระบบ
เสร็จแล้วให้ทดสอบ login/logout ก่อน
```

## Step 2 — ข้อมูล Dealer + Dashboard
```
เพิ่มตาราง dealers (code,name,province,lat,lon,phone,line,tier,sellin,retail,profit,units,
po,outstanding,sales_rep,credit) และ products, seed จาก seed-data.json 
ทำหน้า Dashboard (ภาพรวม sell-in/ค้างชำระ/ดีลเลอร์ active) 
และหน้า Dealer แท็บ "รายชื่อ" (ตารางค้นหา/กรอง tier, export CSV, เพิ่ม/ลบ)
```

## Step 3 — Dealer 360° + แท็บย่อย
```
เพิ่มในหน้า Dealer: (1) popup "Dealer 360°" รวมทุกอย่างของร้านเดียว — KPI, โปรไฟล์แก้ได้ 
(tier/เซลล์/เบอร์/LINE/เครดิต) (2) แท็บ "ภาพรวม" (3) แท็บ "แบ่งตามภาค" (province→region mapping) 
(4) แท็บ "AI Insights" แบบ rule-based (ร้านเสี่ยง=ค้างชำระ>sellin, ค้างสูง, ศักยภาพสูง, ยังไม่มี tier, เงียบ)
```

## Step 4 — Event Hub (แกน + ฟอร์ม ARM)
```
สร้างโมดูล Event (กิจกรรม) ตามฟอร์ม "กิจกรรม ARM" ของ Lark: ตาราง events ~40 ฟิลด์ รวม 
แผนก/ชื่อ/ร้าน/ลูกค้า/ช่วงเวลา/ประเภท(activation,training,testride,other)/ระดับA-B/บัญชี 
และเก็บ JSON: budget_lines, stock_prep, action_plan(ก่อน/ระหว่าง/หลังงาน), manpower 
พร้อมเป้าหมาย vs ผลจริง (sell-out/lead/test/training)
ทำมุมมอง "ตาราง" + ตัวแก้กิจกรรมฟอร์มเต็ม (Action Plan/Manpower แบบตารางแก้ได้ + template)
```

## Step 5 — Event มุมมองเพิ่ม (ปฏิทิน/Gantt/Board/Performance)
```
เพิ่มมุมมองใน Event Hub: (1) ปฏิทินรายเดือน (2) Gantt timeline (จัดกลุ่มตามร้าน, เส้นวันนี้, 
งานเลยกำหนดกรอบแดง, parse วันที่ทั้ง ISO และไทย "19 ก.ย. 69"=พ.ศ.) (3) Board Kanban 
ลากการ์ดข้ามสถานะ (drag-drop) + %ความพร้อม Action Plan (4) Performance (funnel, ต้นทุน/lead, coverage)
```

## Step 6 — POSM
```
สร้างโมดูล POSM: ตาราง posm (ใช้ซ้ำ/สิ้นเปลือง, จำนวน, สภาพ, สถานะ, มาตรฐานร้าน std_a/std_b) 
+ posm_moves (เบิก-คืนผูกกับกิจกรรม) แจ้งเตือนสต็อกต่ำ + เกินกำหนดคืน + ปุ่มโหลดชุดมาตรฐาน A/B
```

## Step 7 — Sell-out + มาตรฐานร้าน
```
เพิ่ม (1) โมดูล Sell-out: บันทึกยอดขายออก+สต็อก รายดีลเลอร์/เดือน/รุ่น 
(2) โมดูลมาตรฐานร้าน (Store Audit): checklist 7 ข้อ (รถตรงมาตรฐาน/ป้ายครบ/รถสะอาด/อนุญาตนั่ง/
ผู้รับผิดชอบผ่านอบรม/คอนเทนต์ตามแผน/ติดตามลูกค้า) → %ความพร้อม + funnel (lead/test/quote/sold+conversion)
เอา sell-out และ audit ไปโชว์ใน Dealer 360° ด้วย
```

## Step 8 — Project (ชั้นครอบ Event)
```
เพิ่มชั้น "โครงการ/แคมเปญ" ครอบ Event: ตาราง projects (ชื่อ/เป้า/งบ/ช่วงเวลา/สถานะ/สี/ร้าน) 
+ events.project_id ทำ (1) หน้าการ์ดโครงการแสดง rollup (ความคืบหน้า, KPI รวม, งบรวมอัตโนมัติ) 
(2) ผูกกิจกรรมหลายอันทีเดียว (bulk assign พร้อมค้นหา) (3) ตัวกรองโครงการใน Event Hub 
(4) selector โครงการในฟอร์มกิจกรรม (5) Gantt สลับจัดกลุ่มตามร้าน/โครงการได้
```

## Step 9 — แผนที่ Dealer + แก้พิกัด
```
เพิ่มแท็บ "แผนที่" ในหน้า Dealer ด้วย Leaflet + markercluster (เก็บไฟล์ใน public/vendor/ ไม่พึ่ง CDN, 
tile OpenStreetMap): ปักหมุดร้านที่มีพิกัด แบบ cluster, กรองภาค/tier, คลิกหมุด→popup รายละเอียด 
+ ปุ่ม 360° + ลิงก์ Google Maps 
และเพิ่มใน Dealer 360°: ตัวแก้พิกัด (แผนที่ย่อลากหมุดได้ + วางลิงก์ Google Maps แล้ว parse lat/lon, ตรวจขอบเขตไทย)
```

## Step 10 — พนักงานหน้างาน + แนบรูป + ติดตามทีม
```
เพิ่ม (1) role "staff" + ตาราง attachments + อัปโหลดรูป/ไฟล์แนบในกิจกรรม (multer 15MB, อยู่หลัง auth) 
(2) มอบหมายพนักงาน (assignees) + checklist เตรียมงาน (prep) ในฟอร์มกิจกรรม 
(3) หน้า "งานของฉัน" สำหรับ staff บนมือถือ — เห็นเฉพาะงานตัวเอง, ติ๊กเตรียมงาน, แนบรูป, 
กรอกผลจริง, เปลี่ยนสถานะ (server เช็คสิทธิ์: staff แก้ได้เฉพาะงานตัวเอง) 
(4) มุมมอง "ติดตามทีม" ใน Event Hub — ตารางสถานะการส่งงานของทุกคน
```

## Step 11 — Deploy ขึ้น VPS
```
เตรียมชุด deploy สำหรับ VPS แยกของตัวเอง: Ubuntu + Node 20 + pm2 (แอป ofero-tmm port 4173) 
+ Nginx reverse proxy (:443→127.0.0.1:4173, client_max_body_size 20M) + Let's Encrypt SSL 
ทำสคริปต์ server-setup.sh (รันครั้งเดียว) + deploy.sh (git pull+npm install+pm2 restart แบบไม่ยุ่ง global) 
+ คู่มือ
```

---

## เคล็ดลับ
- **ทดสอบทุก step** ก่อนไปต่อ (ให้ AI รันเซิร์ฟเวอร์ + ทดสอบ endpoint/หน้าจอจริง)
- ถ้า AI ทำหลุดสเปก ให้ชี้กลับไปที่ข้อใน REBUILD-PROMPT.md
- Step 1-3 คือแกน ถ้าแน่นแล้วที่เหลือต่อยอดง่าย
- แต่ละ step commit + push แยก จะได้ย้อนได้
