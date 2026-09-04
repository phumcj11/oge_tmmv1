# SOP-to-System Mapping — Ofero TMM (SOP 001–005)

> Phase 0 deliverable · จับคู่ requirement จาก SOP docx + sample xlsx เข้ากับโมดูล/ตารางของระบบ
> คีย์ traceability ตลอดวงจร: **Campaign ID + Version + Dealer ID + Action ID**
> หมายเหตุ: ข้อมูล `SAMPLE-*` ในไฟล์ตัวอย่าง = สมมติ ห้ามนำเข้า Production

## SOP-001 — Trade Marketing Planning
**Entities (xlsx 8 sheets):** TM Calendar · Campaign Brief · Dealer Priority · Approval Record · Regional Action · Budget Tracker · Change Log · Monthly Review
**ฟิลด์สำคัญ:**
- TM Calendar: `Campaign ID, ชื่อ, วัตถุประสงค์, สินค้า/รุ่น, ภูมิภาค, Dealer Tier, วันเริ่ม/สิ้นสุด, Owner, งบแผน, สถานะงาน, สถานะอนุมัติ, KPI`
- Campaign Brief (4 หมวด): ควบคุมเอกสาร(+Version) / เป้าหมาย-ขอบเขต / กลไก-ความพร้อม / งบ-KPI-อนุมัติ
- Budget Tracker: `งบแผน/อนุมัติ/ผูกพัน/จ่ายจริง, คงเหลือ=อนุมัติ−จ่าย, Variance=จ่าย−อนุมัติ, PO Ref, สถานะชำระ`
- Change Log: `Change ID, Reference(polymorphic)+Version, เดิม/ใหม่, เหตุผล, ผลกระทบธุรกิจ/งบ/เวลา, ผู้อนุมัติ`

**Map → ระบบ:** `campaigns`(ใหม่ = TM Calendar) · `campaign_versions`(ใหม่ = Brief versioned) · `budget_lines`(ใหม่) · `change_requests`(ใหม่) · `campaign_approvals`(ใหม่) · Monthly Review = view/report · **reuse** projects (grouping), dealers.tier
**Gate/Rule:** approval-before-execution · version lock · escalation matrix 5 เหตุการณ์ · pre-publish checklist 10 ข้อ

## SOP-002 — Dealer Prioritization
**Entities (xlsx 9 sheets):** Dealer Master · Scoring Rules · Validated Data · Priority List · Allocation Plan · Dealer Action · Override Log · Monthly Review · Evidence Log
**Scoring (verbatim):** Sales 25 + Market 20 + Growth 15 + Stock/Execution readiness 15 + Execution quality 15 + Credit/Service risk 10 = **100**
**Tier:** A≥80 · B≥65 · C≥50 · D<50 · **Hold** (Critical Gate ชนะคะแนน) · subscore<6 → **"Missing Data"** (ไม่จัด tier)
**สูตรจริงในไฟล์:** total `=IF(COUNT(E:J)<6,"",SUM(E:J))` · suggested tier ตาม cut-off + Hold · final `=IF(override<>"",override,suggested)`
**Map → ระบบ:** `scoring_rules`(rule_version+weights) · `dealer_score_periods` · `dealer_scores`(**append-only ต่อรอบ = tier history**) · `tier_overrides`(+expiry+approver) · `campaign_dealers`(allocation) · **extend** dealers(+region/area/area_owner/status)
**Rule:** Missing≠0 · Critical Gate=Hold hard · Override 100% ต้องมีเหตุผล/ผู้อนุมัติ/วันหมดอายุ · **ห้ามเขียนทับคะแนนรอบเดิม** (snapshot ต่อ period)

## SOP-003 — Campaign Brief, Readiness & Approval (หัวใจ workflow)
**Entities (xlsx 10 sheets):** Campaign Request · Campaign Brief(version log) · Dealer Scope · Readiness · Budget Approval · Regional Action · Communication · Change/Issue · Evidence Log · Post Campaign
**Campaign Brief 6 หมวด:** Business · Commercial · Dealer Scope · Readiness · Financial · Measurement
**Readiness Gate 7 ข้อ:** Brief · Dealer · Budget · Stock · POSM · Execution · Risk → `overall = NotReady ถ้ามี NotReady; Pending ถ้ามี Pending; else Ready` → **บล็อก launch** เว้นมี Exception อนุมัติ
**Approval:** budget approval + campaign approval แยกกัน; ผล = Approved / Approved with Conditions / Revise / Reject → **Version Lock** → Change Request = New Version
**Classification/lead time:** Major≥30 / Regional≥21 / Local≥14 / Urgent Exception
**Map → ระบบ:** `campaigns` + `campaign_versions`(+brief_status, locked_at/by) · `campaign_dealers`(scope) · `readiness_checks`(7 gate) · `campaign_approvals` · `change_requests` · communications(เฟสหลัง) · **reuse** attachments→evidence, store_audit→readiness เค้าโครง
**Key:** composite **Campaign ID + Version** ทุก entity ลูก

## SOP-004 — Dealer Campaign Execution & Monitoring
**Entities (xlsx 10 sheets):** Execution Pack · Opening Readiness · Briefing Log · Live KPI · Dealer Visit · Stock/POSM/Test-ride Control · Incident/Escalation · Expense · Execution Evidence · Daily Close
**สถานะจริงในไฟล์:** Opening = Go/Hold/Escalate · Live KPI Pace = On Pace/Below Pace/Activity Hold · Incident = Open/In Progress/Closed (+SLA Within/Breached) · Daily Close = Complete/Pending
**Incident:** Level Critical/High/Medium/Low · SLA target (เช่น 15/60 นาที) · Response Minutes · Escalation routing (Medium→TMM; High→TMM+Approver; Critical→TMM+RGM+Aftersales)
**Map → ระบบ:** **reuse+extend** events(→ execution activity ผูก campaign_version+dealer, target vs actual), attachments(→evidence typing), store_audit(→dealer visit/opening readiness), staff mobile(→daily submit) · **ใหม่**: `execution_packs, opening_readiness, briefing_logs, live_kpi, dealer_visits, stock_posm_checks, incidents, expenses, daily_closes`
**Rule:** ห้ามเริ่มจาก Draft/ไม่มี Version · ห้ามเพิ่มส่วนลด/ของแถมนอก Brief · expense อ้าง Approval ID + แยก plan/committed/actual · Missing≠0

## SOP-005 — Post Campaign Evaluation, ROI & Learning
**Entities (xlsx 10 sheets):** Data Intake · Data Validation · KPI Results · Funnel · Dealer Comparison · Financial ROI · Evidence Validation · Review Minutes · Learning Action · Campaign Closure
**ROI (verbatim):** Incremental Units = Actual − Baseline · Incremental Contribution = Inc Units × Contribution/Unit · Net = Inc Contribution − Actual Spend · **ROI = Net ÷ Actual Spend** (Actual Spend>0)
**Funnel:** Footfall→Lead→Test Ride→Sale (อัตราแต่ละขั้น); **Missing แสดงช่องว่าง ห้ามแทน 0**
**Decision:** Repeat / Revise / Stop / Test Further / Hold
**Map → ระบบ:** **ใหม่** `data_intakes, data_validations, campaign_kpi_results, funnel_results, dealer_comparisons, roi_calculations, review_minutes, learning_actions, campaign_closures` · **reuse** sellout, Performance view(cost/lead/sale, funnel), project rollup
**Rule:** Accounting gate (ยืนยัน spend+margin) · ROI ไม่น่าเชื่อถือ → **Not Calculated/Directional** · Dealer comparison หลายมิติ (Achievement+Funnel+Evidence+Compliance) เทียบเฉพาะ version+ช่วงเดียวกัน · Insufficient Data แยกกลุ่ม

## Cross-cutting
- **Universal key:** `campaign_id` (+`version`) เชื่อมทุก entity; `dealer_id` เชื่อม dealer-level; `action_id` สำหรับ corrective/learning
- **Reference chain:** ใช้ `*_Ref` (KPI.Source Ref → Validation ID; Review.Minutes Ref; Closure.Report Ref) — map เป็น FK-by-convention
- **Audit ทุก entity:** created_by/updated_by/created_at/updated_at + `audit_logs` กลาง (approval/tier/version/budget/closure)
