# Gap Analysis — Ofero TMM vs SOP 001–005

> Phase 0 deliverable · แบ่งเป็น 4 ถัง ตาม BSA brief §16

## A) มีแล้วและใช้ได้ (reuse ตรงๆ)
| ความสามารถ | ที่มา |
|---|---|
| Auth (scrypt) + session cookie + 4-role base gate | `server.js:22-95` |
| SQLite **WAL** + additive migration pattern (`ALTER ADD COLUMN`) + `db.transaction()` | `db.js:9,72-102,115` |
| Dealer/Product/Sellout/Event master + CRUD | `server.js` |
| Event **target vs actual** (sellout/lead/testride/training) + action_plan/prep/manpower (JSON) | events schema |
| Store Audit checklist 7 ข้อ → readiness% + funnel | `server.js:534-578` |
| Staff mobile submit (งานของฉัน + ผลจริง + prep + upload) | `app.js:1569`, `server.js:289` |
| Attachments upload (ผูก event + uploaded_by) | `server.js:345` |
| Export CSV (4 จุด) + **Excel import** (dealers/sellout/products, preview+upsert+alias+admin-only) | `app.js`, `import.js` |
| Project rollup (budget/KPI จาก events) | `server.js:221-230` |
| Deploy infra (pm2/nginx/SELinux/firewalld) + **cron backup** | VPS ops |

## B) มีแล้วแต่ต้องปรับ/ต่อยอด
| ของเดิม | ต้องปรับเป็น |
|---|---|
| `projects` | เก็บเป็น grouping ทั่วไป — **Campaign แยกใหม่** (`campaigns`+`campaign_versions`); ค่อยตัดสิน migrate ตอน Phase 2 |
| `events` | ผูก `campaign_id`+`campaign_version`+`dealer_id` เป็น **execution activity spine** + created_by/updated_by |
| `store_audit` | แตกเป็น **readiness gate ต่อ campaign** (pre-launch, บล็อก) + **dealer visit/opening readiness** (execution) |
| `attachments` | เพิ่ม typing (Before/After Photo, Lead, POSM) + validation_status/validator → **Evidence Management** |
| Dealer **AI Insights** (rule-based) | ต่อยอดเป็น **dealer scoring จริง** (6 หมวด=100 + tier + gate) |
| `import.js` | ขยายรองรับ **SOP templates** (campaigns/scores/execution records) |
| Roles (4) | ขยาย role set (tmm/approver/area_manager/area_sales/accounting...) + **region/area scoping** |
| Sellout / Performance view | ป้อน **post-campaign KPI/funnel/ROI** structured |

## C) ยังไม่มี — ต้องสร้างใหม่ (greenfield, additive)
- **Governance**: `campaigns`, `campaign_versions` + **version lock**, `campaign_approvals` (approval workflow), `change_requests`, **status-transition guard**
- **Readiness**: `readiness_checks` (7 gate ที่**บล็อก launch**)
- **Prioritization**: `scoring_rules`, `dealer_score_periods`, `dealer_scores` (**append-only = tier history**), `tier_overrides` (+expiry)
- **Org/Scoping**: `regions`, `areas`, `user_scopes` (region/area data scoping) + dealers.region/area cols
- **Execution**: `execution_packs, opening_readiness, briefing_logs, live_kpi, dealer_visits, stock_posm_checks, incidents (SLA/escalation), expenses, daily_closes`
- **Evaluation**: `data_intakes, data_validations, campaign_kpi_results, funnel_results, dealer_comparisons, roi_calculations, review_minutes, learning_actions, campaign_closures`
- **Audit/ทั่วไป**: **`audit_logs`** (universal) + `created_by/updated_by` ทุกตารางธุรกรรม, `notifications`

## D) ยังไม่ควรทำใน MVP (defer)
- Dealer External Portal (Dealer login เอง)
- Email / LINE OA integration จริง (ยังไม่มี credential/requirement)
- เชื่อม Accounting/Logistics แบบ real-time (ใช้ **manual + Excel import** ไปก่อน)
- **SOP 006–009** (Budget/Expense Claim, POSM Lifecycle, Dealer Visit/Retail Audit, Data/Reporting/CI) — docx มีแล้ว แต่เลื่อนตามที่ตกลง (ออกแบบ data model ให้เผื่อได้)

## สรุปความครอบคลุม (ประมาณการ)
ระบบเดิมครอบ **~30–40%** ของ SOP 001–005 (เป็น scaffolding ด้าน master/execution/evidence/import) —
ส่วนที่เป็น **governance/lifecycle/analytics** (~60–70%) เป็น greenfield ที่จะสร้างเป็นเฟสตาม `implementation-plan.md`
