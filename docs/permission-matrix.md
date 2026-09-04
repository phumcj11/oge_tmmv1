# Permission Matrix + Region/Area Scoping — Ofero TMM

> Phase 0 deliverable · ขยายจาก 4-role เดิม (admin/editor/viewer/staff) โดยคง base gate เดิมไว้

## Roles (เป้าหมาย)
| Role | SOP role | ขอบเขต |
|---|---|---|
| `admin` | System Administrator | ทุกอย่าง + จัดการผู้ใช้/ระบบ |
| `tmm` | Trade Marketing Manager | เจ้าของกระบวนการ: campaign/brief/scoring/readiness/version lock/monitoring/evaluation (ทั้งประเทศ) |
| `approver` | RGM / Approver | อนุมัติ campaign/budget/override/closure ตามอำนาจ |
| `area_manager` | Area Manager | ยืนยัน dealer/execution ในพื้นที่ (**scoped ตาม region/area**) |
| `area_sales` | Area Sale & Retail | เก็บ KPI/evidence/execution (**scoped**) |
| `accounting` | Accounting | ยืนยัน spend/margin/ROI, budget gate |
| `viewer` | (อ่านอย่างเดียว) | ดูตามสิทธิ์ scope |
| `staff` | Field staff | "งานของฉัน" เฉพาะที่ได้รับมอบหมาย (มือถือ) |
| `logistics` / `aftersales` / `dealer` | — | **เฟสหลัง** (stock/incident confirm / external portal) |

## Capability Matrix (ย่อ — ✔ ทำได้, S = เฉพาะพื้นที่ scope, – ไม่ได้)
| Capability | admin | tmm | approver | area_mgr | area_sales | accounting | viewer | staff |
|---|---|---|---|---|---|---|---|---|
| ดู dashboard/report | ✔ | ✔ | ✔ | S | S | ✔ | – | own |
| สร้าง/แก้ campaign + brief | ✔ | ✔ | – | – | – | – | – | – |
| **Lock version** | ✔ | ✔ | – | – | – | – | – | – |
| **Approve campaign/budget** | ✔ | – | ✔ | – | – | budget co-sign | – | – |
| Dealer scoring/tier | ✔ | ✔ | – | input S | input S | risk input | – | – |
| **Override tier** (+expiry) | ✔ | เสนอ | ✔ | – | – | – | – | – |
| Readiness check | ✔ | ✔ | – | S | S | budget/stock | – | – |
| Execution submit (opening/kpi/evidence) | ✔ | ✔ | – | S | S | – | – | own |
| Incident create/escalate | ✔ | ✔ | decide | S | S | – | – | own |
| Expense (plan/committed/actual) | ✔ | ✔ | – | S | S | **confirm** | – | – |
| ROI / financial confirm | ✔ | คำนวณ | review | – | – | **validate** | – | – |
| Review decision / closure | ✔ | ✔ | approve | input | – | financial | – | – |
| จัดการผู้ใช้/ระบบ | ✔ | – | – | – | – | – | – | – |

## Region/Area Data Scoping
- ตาราง **`user_scopes`**(username, scope_type `region`|`area`, scope_value) — 1 user มีได้หลาย scope
- `dealers` มี `region`, `area_code`, `area_owner` → ทุก query dealer/campaign/execution/evidence ที่ผู้ใช้ scoped (area_manager/area_sales/viewer พื้นที่) จะ **filter ตาม scope**
- `tmm`/`approver`/`admin`/`accounting` = เห็นทั้งประเทศ (ไม่ scoped) เว้นกำหนดเป็นอย่างอื่น
- Implementation: helper `scopeFilter(req.user)` คืนเงื่อนไข WHERE (region/area IN scopes) ใช้กับทุก list endpoint; staff ยังใช้ `isAssigned` เดิม

## หลักการบังคับสิทธิ์ (คงของเดิม + เพิ่ม)
- คง gate เดิม: auth gate, viewer read-only, staff scope allowlist, `requireAdmin`
- เพิ่ม `requireRole([...])` / `requireCapability(cap)` ต่อ route สำหรับ approve/lock/override/confirm
- ทุก write endpoint ที่สำคัญ → เขียน `audit_logs` (actor, before/after, reason, approver)
