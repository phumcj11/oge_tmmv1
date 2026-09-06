# Ofero TMM System — ภาพรวมระบบทั้งหมด

> ระบบบริหารงาน **Trade Marketing** สำหรับแบรนด์มอเตอร์ไซค์ไฟฟ้า Ofero (ขายผ่านดีลเลอร์ ~115 ร้านทั่วไทย)
> ครอบวงจรงานทั้งหมดตั้งแต่ข้อมูลร้านค้า → วางแผนแคมเปญ → อนุมัติ → หน้างาน → วัดผล ROI → ปิดงาน
> ทำตาม **SOP 001–005** เต็มรูปแบบ · สร้างต่อยอดบน MVP เดิมแบบ additive (ไม่รื้อของเดิม)

**เชิงเทคนิค:** Node.js + Express + SQLite (better-sqlite3, WAL) · vanilla JS SPA (ไม่มี build) · auth เขียนเอง (scrypt + session cookie) · pm2 + nginx
**ขนาด:** ~39 ตาราง · 13 แท็บ · 105 API endpoints · 12 backend module · deploy บน VPS 119.59.113.86 (`/home/oge/tmm`, pm2 `ofero-tmm` :4173)

---

## กลุ่ม A — โมดูลปฏิบัติการ (ข้อมูล/หน้างานประจำวัน)

| แท็บ | ทำอะไร | ใช้ประโยชน์ |
|---|---|---|
| **📊 Dashboard** | สรุปยอด sell-in / มูลค่าค้าปลีก / กำไร Dealer / ค้างชำระ ตามรุ่น·ภาค·เดือน + แผนที่ไทย (SVG) + Top Dealer + ลูกหนี้ + timeline + POSM | เห็นภาพรวมธุรกิจทั้งเครือข่ายในหน้าเดียว |
| **🏪 Dealer** | ทะเบียน 115 ร้าน · แผนที่ Leaflet ปักหมุด+cluster · ภาพรวม · แบ่งตามภาค · **AI Insights** (rule-based หาร้านเสี่ยง/ศักยภาพสูง) · **Dealer 360°** (การเงิน/sell-out/กิจกรรม/ความพร้อม + แก้พิกัด) | รู้จักร้านทุกมุม ตัดสินใจโฟกัสร้านไหน |
| **📁 โครงการ** | จัดกลุ่มกิจกรรมหลายอันเป็นโครงการ + rollup งบ/KPI อัตโนมัติ + bulk-assign | ดูภาพรวมกิจกรรมย่อยที่เกี่ยวข้องรวมกัน |
| **🎪 Event** | กิจกรรมหน้าร้าน 6 มุมมอง (ตาราง/ปฏิทิน/**Gantt**/**Kanban**/Performance/ติดตามทีม) · เป้า vs ผลจริง · Action Plan/Manpower · แนบรูปหน้างาน | บริหารกิจกรรมภาคสนามครบวงจร |
| **📦 POSM** | คลังสื่อ ณ จุดขาย · เบิก-คืน (ผูกกิจกรรม+ผู้รับผิดชอบ+กำหนดคืน) · แจ้งเตือนของใกล้หมด/เกินกำหนด · มูลค่าสินทรัพย์ | คุมสื่อไม่ให้หาย/ขาด |
| **📈 Sell-out** | บันทึกยอดขายออก + สต็อกคงเหลือ รายเดือน/ร้าน/รุ่น | ติดตามยอดขายปลายทางจริง |
| **🏬 มาตรฐานร้าน** | Checklist 7 ข้อ → % ความพร้อม + funnel (lead→test→quote→sold) | ประเมินคุณภาพ/ความพร้อมร้าน |

---

## กลุ่ม B — วงจร Campaign ตาม SOP 001–005 (Governance lifecycle)

| แท็บ | ทำอะไร | SOP |
|---|---|---|
| **🎯 Campaign** | สร้างแคมเปญ (Campaign ID อัตโนมัติ) → Brief 6 หมวด → **ส่งขออนุมัติ → อนุมัติ (approver) → ล็อก Version → Change Request=เวอร์ชันใหม่** · Readiness Gate 7 ข้อในหน้าเดียวกัน · ทุกขั้นมี **audit** | 001/003 |
| **📊 จัดลำดับ** | ให้คะแนนร้าน 6 หมวด (ยอดขาย25/ศักยภาพ20/โอกาส15/Stock15/Execution15/เครดิต10=100) → **Tier A≥80·B≥65·C≥50·D<50·Hold** · Critical Gate=Hold · ขาดคะแนน=Missing Data · **ประวัติต่อรอบ (ไม่เขียนทับ)** · Override (+วันหมดอายุ) · อนุมัติ→sync tier เข้าทะเบียนร้าน | 002 |
| **⚙️ Execution** | หน้างานผูกกับแคมเปญ: Opening Readiness (Go/Hold) · Live KPI (pace) · **Incident** (Level→SLA+Escalation routing) · Expense (จ่ายจริงต้องมี Approval ID + accounting confirm) · Daily Close (reconcile→Complete) | 004 |
| **📈 ประเมินผล** | **ROI incremental** (Inc Units→Contribution→Net→ROI, บัญชี gate → Not Calculated/Directional/Calculated) · Funnel (Missing≠0) · เทียบร้านหลายมิติ (Insufficient Data) · Review (Repeat/Revise/Stop/Test/Hold) · Corrective Action · Closure (6 gate→ปิด campaign) | 005 |
| **🧭 TM Board** | ศูนย์ควบคุมรวมยอดทั้ง lifecycle: แคมเปญตามสถานะ · รออนุมัติ · Incident ค้าง/Critical/SLA เกิน · Action เกินกำหนด · ROI · งบแผน vs จ่ายจริง · Tier distribution + รายการที่ต้องจัดการ | Dashboard |

---

## กลุ่ม C — ระบบกลาง (Cross-cutting)

- **👤 Users & Roles (9 บทบาท):** `admin` · `tmm` · `approver`(RGM) · `area_manager` · `area_sales` · `accounting` · `viewer` · `staff` · (`logistics`/`aftersales` เผื่ออนาคต)
- **🌏 Region/Area Scoping:** ผู้ใช้ระดับพื้นที่เห็นเฉพาะ region/area ที่รับผิดชอบ (`user_scopes`) · tmm/approver/admin เห็นทั้งประเทศ
- **🔒 Audit Trail (`audit_logs`):** ทุกการอนุมัติ / เปลี่ยน tier / เปลี่ยน version / เปลี่ยนงบ / ปิดงาน — บันทึก ใคร/เมื่อ/ค่าเดิม/ค่าใหม่/เหตุผล/ผู้อนุมัติ
- **⬆ Excel Import / ⬇ Export CSV:** นำเข้า dealers/sellout/products (preview+upsert+alias ไทย/อังกฤษ, admin-only) · ส่งออก CSV หลายจุด
- **📱 Staff Mobile:** พนักงานหน้างาน login มือถือ → "งานของฉัน" → checklist + ถ่ายรูป + กรอกผลจริง (เห็นเฉพาะงานที่ได้รับมอบหมาย)

---

## กฎธุรกิจที่ระบบบังคับจริง (SOP controls)
1. **Missing ≠ 0** — ข้อมูลขาดเป็นสถานะ Missing/Pending/Not Calculated ห้ามเติมศูนย์
2. **Version Lock** — แคมเปญที่ล็อกแล้วแก้ไม่ได้ ต้อง Change Request → เวอร์ชันใหม่
3. **Readiness Gate** — ห้ามส่งขออนุมัติ/launch ถ้า 7 gate ไม่ Ready (เว้นมี Exception)
4. **Critical Gate = Hold** ชนะคะแนนเสมอ · Tier history append-only
5. **ROI** ใช้ incremental เท่านั้น · Accounting ยืนยัน spend/margin · ไม่น่าเชื่อถือ → Not Calculated/Directional
6. **Dealer Comparison** หลายมิติ (KPI+Funnel+Evidence+Compliance) · ข้อมูลไม่ครบ = Insufficient Data (ห้ามจัดอันดับจากยอดเดียว)
7. **Incident** มี Level → SLA + Escalation routing (Critical→TMM/RGM/Aftersales)
8. **Audit trail** ทุกการเปลี่ยนสถานะสำคัญ · **RBAC + Region scoping**

---

## ประโยชน์รวม — แก้ปัญหาอะไร
1. **ติดตาม 1 แคมเปญได้ตั้งแต่แผนจนปิด** ด้วย Campaign ID / Version / Dealer ID / Action ID
2. **กันความผิดพลาด/ทุจริต:** ต้องอนุมัติก่อนทำ · แก้ของที่ล็อกไม่ได้ · ROI ไม่มั่ว · ทุกอย่าง trace ได้
3. **รู้ว่าใครต้องทำอะไร ครบกำหนดเมื่อไหร่** (TM Board + Action tracker + SLA)
4. **ตรวจสอบย้อนกลับได้ 100%** — สำคัญสำหรับงบประมาณและการอนุมัติ
5. **จัดลำดับร้าน + วัด ROI ด้วยเกณฑ์เดียว** — ตัดสินใจด้วยข้อมูล

---

## สถาปัตยกรรมไฟล์ (backend modules)
| ไฟล์ | หน้าที่ |
|---|---|
| `server.js` | Express routes เดิม (dealer/event/posm/sellout/audit/users/staff) + register โมดูลใหม่ |
| `db.js` + `*-schema.js` | schema + migration (additive `ALTER ADD COLUMN`) — lifecycle/scoring/execution/evaluation |
| `lifecycle.js` | Campaign + version lock + approval + audit + region scoping (Phase 1) |
| `scoring.js` | Dealer scoring/tier + readiness gate (Phase 2) |
| `execution.js` | Opening/Live KPI/Incident/Expense/Daily Close (Phase 3) |
| `evaluation.js` | ROI/Funnel/Comparison/Review/Learning/Closure (Phase 4) |
| `dashboard.js` | TM Control Board rollup (Phase 5) |
| `import.js` | Excel import |
| `public/*-ui.js` | Frontend แต่ละแท็บ (campaign/scoring/execution/evaluation/dashboard/import) |

เอกสารประกอบ: `docs/` (assessment · sop-system-mapping · gap-analysis · implementation-plan · permission-matrix · workflow-status)

---

## การใช้งานเบื้องต้น
1. เปิด `http://119.59.113.86/` (หลัง DNS+SSL → `https://oge.k-mkt.com`)
2. login (ค่าเริ่มต้น `admin / ofero1234` — **เปลี่ยนหลัง login**)
3. สร้าง user ตาม role + ตั้ง region scope (แท็บ ผู้ใช้)
4. วงจรงาน: **จัดลำดับ** ร้าน → สร้าง **Campaign** + Brief → ผ่าน **Readiness** → **อนุมัติ** → ล็อก → **Execution** หน้างาน → **ประเมินผล** ROI → ปิดงาน · ดูภาพรวมที่ **TM Board**
