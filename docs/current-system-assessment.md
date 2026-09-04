# Current System Assessment — Ofero TMM System

> Phase 0 deliverable · จัดทำโดยการ audit โค้ดจริง (`db.js`, `server.js`, `import.js`, `public/*`) · READ-ONLY

## 1. ภาพรวม Stack
- **Backend**: Node.js + Express, **better-sqlite3** (SQLite ไฟล์เดียว `tmm.db`, **WAL mode เปิดจริง** `db.js:9`)
- **Frontend**: Single-Page App **vanilla JavaScript** (ไม่มี build step) — `public/index.html`, `app.js`, `styles.css`, `login.html`, `import-ui.js`
- **Auth**: เขียนเองด้วย Node `crypto` — scrypt hash + session token ใน cookie (`sid`, httpOnly, sameSite=lax, **ไม่มี secure flag**), TTL 30 วัน
- **Upload**: multer (disk `uploads/`, 15MB) — และ multer memory สำหรับ Excel import
- **Process/Proxy**: pm2 (`ofero-tmm`, port 4173) + nginx reverse proxy + SELinux + firewalld (deploy บน VPS 119.59.113.86)
- **หมายเหตุ**: `PRAGMA foreign_keys` ไม่ได้เปิด → ความสัมพันธ์ระหว่างตารางเป็น convention (ไม่บังคับที่ DB)

## 2. ฐานข้อมูล — 12 ตาราง (`db.js`)
| ตาราง | คีย์/หมายเหตุ |
|---|---|
| `dealers` | PK `code`; +sellin/retail/profit/units/po/outstanding, tier, sales_rep, credit, lat/lon |
| `products` | PK `model`; cost/price/margin/profit/units/sellin/dealer_profit |
| `events` | PK `id` (app คำนวณ MAX+1); ~40 ฟิลด์ รวม target vs actual, action_plan/manpower/budget_lines/prep (JSON), assignees, project_id |
| `posm` / `posm_moves` | POSM stock + std_a/std_b; การเบิก-คืน |
| `sellout` | UNIQUE(dealer_code, ym, model); sold/stock; **มี updated_at** |
| `projects` | goal/owner/dealer_code/start/end/status/budget/color; **มี created_at** |
| `store_audit` | UNIQUE(dealer_code, ym); checklist(JSON) + lead/test_ride/quote/sold; **มี updated_at** |
| `attachments` | event_id + filename/mime/size + **uploaded_by** + created_at |
| `users` | PK username; salt/hash(scrypt)/role/**created_at**; roles = admin/editor/viewer/staff |
| `sessions` | token/username/expires |
| `meta` | key/value (region_sellin, month_sellin) |

**Audit column coverage** (ช่องว่างสำคัญ):
| | created_at | updated_at | created_by | updated_by |
|---|---|---|---|---|
| users/projects/attachments | ✔ | – | attachments เท่านั้น (`uploaded_by`) | – |
| sellout/store_audit | – | ✔ | – | – |
| อื่นๆ (dealers/products/events/posm...) | – | – | – | – |

→ **ไม่มี audit trail ที่สม่ำเสมอ, ไม่มีตาราง history/log/approval ใดๆ, ไม่มี `updated_by` เลย**

## 3. RBAC / Auth (`server.js`)
- 4 roles: **admin, editor, viewer, staff**
- ลำดับ gate: attach req.user `:34-42` → auth gate `:62-66` (public paths ผ่าน, `/api/*` ที่ไม่ login = 401) → viewer read-only `:68-72` → staff scope `:80-85` (staff เขียนได้เฉพาะ path ใน allowlist) → `requireAdmin` `:92-95` (users/import/posm-load-standard)
- per-handler: `isAssigned` (staff แก้เฉพาะงานตัวเอง), `/api/staff` จำกัด admin/editor
- **ยืนยันว่าไม่มี**: region/area scoping · approval workflow · version lock/optimistic concurrency · status-transition guard (status เป็น free-text เขียนทับได้) · actor tracking บน write (ยกเว้น attachments.uploaded_by)

## 4. โมดูล/หน้าจอที่มี (`public/app.js`, `index.html`)
- **Dashboard** (`renderDashboard :48`): KPI, sell-in ตามรุ่น/ภาค(SVG)/เดือน, top dealer, ลูกหนี้, timeline, POSM
- **Dealer** 5 subview (`:150`): รายชื่อ · แผนที่ Leaflet+cluster · ภาพรวม · แบ่งตามภาค · **AI Insights (rule-based)** + **Dealer 360°** (finance/sellout/events/audit + แก้พิกัด)
- **Projects** (`:1242`): container ครอบ events, **rollup KPI/budget**, bulk-assign, status planning/active/done/hold
- **Events** 6 view (`:507`): ตาราง/ปฏิทิน/**Kanban(drag-drop)**/**Gantt**/Performance(cost-per-lead/sale, funnel)/ติดตามทีม; editor เต็ม (action_plan/manpower/prep/assignees/attachments); status planned/confirmed/done/cancelled
- **POSM** (`:1079`): stock, เบิก/คืน, load-standard
- **Sell-out** (`:1439`): บันทึกรายเดือน/ร้าน/รุ่น
- **Store Audit** (`:1364`): checklist 7 ข้อ → readiness% + funnel (lead→test→quote→sold)
- **Staff mobile** (`:1569`): "งานของฉัน" + submit ผลจริง + prep + upload
- **Users** (`:1519`): จัดการผู้ใช้/สิทธิ์ (admin)
- **Import/Export**: export CSV (dealers/events/audit/sellout); **Excel import** (dealers/products/sellout) preview+upsert+alias+admin-only (`import.js`)

## 5. Region/Area ปัจจุบัน
- **ไม่มี** entity area/territory · region = derive จาก province ฝั่ง client (`app.js:138-148`, 77 จังหวัด→5 ภาค) ใช้แค่ dashboard/grouping · ไม่มี area manager/assignment/scoping

## 6. สรุปเชิงประเมิน
ระบบเดิม = MVP ที่แข็งแรงด้าน master data + execution (events) + evidence upload + import/export + 4-role base + WAL + additive migration pattern
แต่ **ขาดโครงสร้าง lifecycle/governance ทั้งหมด** (campaign+version+approval+readiness gate, audit trail, dealer scoring/tier history, region/area scoping, incident/SLA, ROI incremental, post-campaign review) ซึ่งเป็น greenfield ที่จะสร้างแบบ additive ต่อยอดบน pattern เดิม
