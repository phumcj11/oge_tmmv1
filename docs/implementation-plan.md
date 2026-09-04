# Implementation Plan — Ofero TMM Lifecycle (SOP 001–005)

> Phase 0 deliverable · พัฒนาแบบ **additive เป็นเฟส** บนระบบเดิม · แต่ละเฟสต้องผ่านการอนุมัติแยก

## หลักการพัฒนา
- **ห้ามรื้อของเดิม** — reuse ให้มากสุด, เพิ่มด้วย `ALTER TABLE ADD COLUMN` (idempotent) + ตารางใหม่ใน `init()`
- แยกโมดูลใหม่เป็นไฟล์ register แบบ `import.js` (เช่น `campaigns.js`, `scoring.js`, `execution.js`, `evaluation.js`, `audit.js`) → `require(...)(app, db)` ใน `server.js`
- ทุกตารางธุรกรรมใหม่มี `created_at, updated_at, created_by, updated_by`; key `campaign_id/version/dealer_id/action_id`
- **Missing≠0**, transaction กับ approval/status change, audit ทุกการเปลี่ยนสำคัญ
- ทุกเฟส: **backup ก่อน deploy** (`/home/oge/ops/backup.sh`), additive migration, `pm2 restart ofero-tmm`, commit+push, รายงานผลทดสอบ

## เฟส

### Phase 0 — Documentation (เอกสารล้วน, ปลอดภัย) ← เฟสนี้
สร้าง `docs/` 6 ไฟล์ (assessment, sop-system-mapping, gap-analysis, implementation-plan, permission-matrix, workflow-status) → **หยุดให้รีวิว**

### Phase 1 — Foundation
- **DB**: `regions`, `areas`, `user_scopes`; extend `dealers`(+region/area_code/area_owner/dealer_status/data_status); `campaigns`, `campaign_versions`; `campaign_approvals`; **`audit_logs`** + เพิ่ม `created_by/updated_by` ตารางธุรกรรม
- **Backend**: audit helper (`logAudit`), campaign CRUD + status machine + **version lock**, approval endpoints, scoping helper (filter ตาม user_scopes)
- **Frontend**: แท็บ Campaign (list/create/version/approve), audit log view, role/scope ใน user admin
- **ไฟล์**: `db.js`, `server.js`, `campaigns.js`(ใหม่), `audit.js`(ใหม่), `public/app.js`/`index.html`/`styles.css`
- **Test**: role/scope, campaign transition, version lock, approval+reject, audit log บันทึกครบ

### Phase 2 — Planning & Prioritization
- TM Calendar view (จาก campaigns); **Dealer Scoring** (`scoring_rules`, `dealer_score_periods`, `dealer_scores` append-only, `tier_overrides`); Campaign Brief 6 หมวด; **Readiness Gate 7 ข้อ (บล็อก)**; `change_requests`
- **Test**: scoring/tier + Missing Data + Critical Gate=Hold, tier history append (ไม่ทับ), readiness บล็อก launch, change request→new version

### Phase 3 — Execution Control
- ผูก `events`→campaign_version+dealer; `execution_packs, opening_readiness, briefing_logs, live_kpi, dealer_visits, stock_posm_checks, incidents(SLA/escalation), expenses, daily_closes`; staff mobile ต่อยอด; evidence typing บน attachments
- **Test**: opening Go/Hold, live pace, incident SLA+escalation, expense approval-ref, daily close gate

### Phase 4 — Evaluation
- `data_intakes, data_validations, campaign_kpi_results, funnel_results, dealer_comparisons, roi_calculations, review_minutes, learning_actions, campaign_closures`
- **Test**: ROI incremental + Accounting gate + Not Calculated/Directional, funnel Missing≠0, dealer comparison หลายมิติ + Insufficient Data, corrective action tracking, closure gates

### Phase 5 — Dashboards & Integration
- Executive / TMM / Area dashboards; ขยาย Excel import → SOP templates; export reports; notifications (email/LINE ภายหลัง)

## Risks & Decisions ที่ต้องขอผู้ใช้
1. **Role model**: ขยาย `users.role` enum + `user_scopes` (แนะนำ, เบา) พอไหม vs ตาราง roles/permissions เต็ม
2. **Backfill data**: 115 dealers ต้องมี `area_code`/`area_owner` — region derive จาก province ได้ แต่ **area ยังไม่มีข้อมูล** (ขอไฟล์ mapping area/ผู้ดูแล)
3. **ROI baseline**: นิยาม baseline units + contribution/unit มาจากไหน (ต้องตกลงกับ Accounting)
4. **projects เดิม**: เก็บเป็น grouping หรือ migrate เข้า campaigns (ตัดสิน Phase 2)
5. **SOP ยัง Draft v0.1** — requirement อาจปรับ; **006–009** เลื่อน
6. **Cutover**: DNS `oge.k-mkt.com` ยังชี้เครื่องเก่า (119.59.102.235) — ต้องชี้มา 119.59.113.86 + ออก SSL

## Deployment/Docs (ตาม brief §18)
- `.env.example` (ถ้าเริ่มใช้ env), อัปเดต README/DEPLOY/CHANGELOG, `database/schema.sql` snapshot, SQL patch ต่อเฟส, seed แยกจาก production, backup ก่อน deploy, rollback plan (git reset + restore backup), cron ที่มี, folder permission
- **ห้ามนำ `SAMPLE-*` เข้า production**
