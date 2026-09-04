# Workflow & Status Model — Ofero TMM

> Phase 0 deliverable · State machines + gates + business rules ที่ระบบต้อง enforce
> หลัก: ห้ามข้ามสถานะสำคัญโดยไม่มีสิทธิ์/ข้อมูลขั้นต่ำ · ทุก transition สำคัญเขียน `audit_logs`

## 1. Campaign State Machine
```
Draft → Pending Readiness → Pending Approval → Approved (/ Approved with Conditions)
      → Locked → Ready to Launch → In Progress → Completed → Under Review → Closed
สถานะเสริม: On Hold · Cancelled · Rejected · Change Requested
```
- `Draft→Pending Readiness`: brief ครบขั้นต่ำ (Objective/Scope/Mechanic/KPI/Owner)
- `Pending Readiness→Pending Approval`: **Readiness Gate = Ready** (หรือมี Exception อนุมัติ) — ไม่งั้นบล็อก
- `Pending Approval→Approved`: โดย `approver` เท่านั้น (บันทึก decision/conditions)
- `Approved→Locked`: โดย `tmm` — **version lock** (แก้สาระสำคัญหลังนี้ต้อง Change Request → new version)
- `Locked→Ready to Launch→In Progress`: ต้องผ่าน readiness + handover
- `In Progress→Completed→Under Review→Closed`: closure gates ครบ (ดู §5)

## 2. Readiness Gate (7)
Gate: **Brief · Dealer · Budget · Stock · POSM · Execution · Risk** — แต่ละอัน = Ready / Pending / Not Ready
```
overall = Not Ready  ถ้ามี gate ใด = Not Ready
        = Pending    ถ้ามี gate ใด = Pending
        = Ready      เมื่อทุก gate = Ready
```
→ **บล็อกไม่ให้ launch/approve** เว้นมี `exception_ref` ที่อนุมัติและไม่หมดอายุ

## 3. Dealer Tier / Scoring
- Score 6 หมวด = 100 (Sales 25 / Market 20 / Growth 15 / Stock 15 / Execution 15 / Credit-Service 10)
- **Critical Gate = Hold** → tier = Hold (ชนะคะแนน)
- subscore ครบ <6 → total ว่าง, tier = **"Missing Data"** (ไม่จัด/ไม่อนุมัติ tier)
- cut-off: **A≥80 · B≥65 · C≥50 · D<50**
- `final = override ถ้ามี, ไม่งั้น suggested`; Override ต้องมี `approver + reason + kpi_proof + expiry`
- **Append-only ต่อรอบ (period)** — ห้ามเขียนทับคะแนน/ tier รอบเดิม (= tier history)

## 4. Action / Evidence / Incident
- **Action**: Open → In Progress → Blocked → Pending Validation → Closed (ทุก action มี owner + due + success_measure; ปิดต้องมี evidence + ผู้ตรวจ)
- **Evidence**: Required → Submitted → Pending Validation → Verified (หรือ Rejected / Waived[+approver]) — ทุกชิ้นระบุ campaign_id/version/dealer_id/type/ผู้ส่ง
- **Incident**: Level Critical/High/Medium/Low → Open → In Progress → Closed
  - SLA target (เช่น Critical 15 นาที, High 60) · Response Minutes = decision−reported · SLA Status = Within/Breached
  - Escalation: Medium→TMM · High→TMM+Approver · Critical→TMM+RGM+Aftersales

## 5. Closure Gates (Post-Campaign)
Campaign ปิดได้เมื่อ: Data Validated · Financial Validated (Accounting) · Report Approved · Actions Assigned · Archive Complete · Learning Shared → Overall = Closed
- **Decision (Review):** Repeat / Revise / Stop / Test Further / Hold

## 6. Business Rules (enforce ทุกจุด)
1. **Missing ≠ 0** — ข้อมูลไม่มี = Missing/Pending/Incomplete/Not Calculated (ห้ามเติมศูนย์)
2. **Approval before execution** — ห้าม launch/ก่อค่าใช้จ่ายจาก Draft ที่ยังไม่อนุมัติ
3. **Version Lock** — campaign ที่ Locked แก้สาระสำคัญไม่ได้ ต้อง Change Request → new version; เอกสารดาวน์สตรีมใช้ version เดียวกัน
4. **ROI** — incremental เท่านั้น; Actual Spend>0; Accounting ยืนยัน spend+margin; ไม่น่าเชื่อถือ → **Not Calculated / Directional** (ห้ามใช้ยอดขายรวมเป็นกำไร)
5. **Dealer Comparison** — หลายมิติ (Achievement+Funnel+Evidence+Compliance), เทียบเฉพาะ version+ช่วงเดียวกัน, Insufficient Data แยกกลุ่ม (ห้ามจัดอันดับจากยอดเดียว)
6. **Audit trail** — ทุก approval / เปลี่ยน tier / เปลี่ยน version / เปลี่ยน budget / ปิด campaign: actor + เวลา + ค่าเดิม + ค่าใหม่ + เหตุผล + ผู้อนุมัติ + evidence ref
7. **Scoping** — ผู้ใช้เห็นเฉพาะข้อมูลตาม region/area (ดู permission-matrix.md)
8. **Transition guard** — ห้ามข้ามสถานะถ้าไม่มีสิทธิ์หรือข้อมูลขั้นต่ำไม่ครบ

## 7. Status Color Convention (UI — ตาม brief §13)
เขียว = ผ่าน/เสร็จ · เหลือง = รอ/เสี่ยง · แดง = ไม่ผ่าน/เกินกำหนด/ปัญหา · เทา = ไม่มีข้อมูล/ไม่เกี่ยวข้อง · น้ำเงิน = กำลังดำเนินการ
