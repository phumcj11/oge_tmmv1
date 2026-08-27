// One-time (idempotent) setup: load Boss's Thaweeyont retail-support plan into the system
// as a Project + 8 phase activities with detailed action plans, prep checklists, and targets.
// Safe to re-run: matches existing events by name (won't duplicate); fills gaps without
// overwriting numbers you've already edited. Run:  node scripts/setup-thaweeyont.js
const db = require('../db');

const DEALER = 'V00016';
const d = db.prepare('SELECT * FROM dealers WHERE code=?').get(DEALER);
if (!d) { console.error('ไม่พบ dealer', DEALER); process.exit(1); }

// ---------- 1) Project (upsert by name) ----------
const PNAME = 'แผนปรับปรุงร้าน ทวียนต์ Q4';
let proj = db.prepare('SELECT * FROM projects WHERE name=?').get(PNAME);
const pfields = {
  name: PNAME, owner: 'ARM ภาคเหนือ', dealer_code: DEALER,
  goal: 'ยกทวียนต์เป็นร้าน SR ต้นแบบ OFERO ภาคเหนือ (มาตรฐาน A) + เพิ่มยอดขายอย่างยั่งยืน',
  description: 'OFERO Retail Support Program — ประเมิน/จัดระดับ A/B, สร้างร้านต้นแบบ, อบรมทีมขาย, Field Coaching, ทบทวนผล (แผน Boss v1.1)',
  start_date: '2026-09-01', end_date: '2026-12-31', status: 'active', budget: 0, color: '#6A1B9A',
};
if (proj) {
  db.prepare('UPDATE projects SET name=@name, owner=@owner, dealer_code=@dealer_code, goal=@goal, description=@description, start_date=@start_date, end_date=@end_date, color=@color WHERE id=@id')
    .run({ ...pfields, id: proj.id });
} else {
  const r = db.prepare('INSERT INTO projects (name,owner,dealer_code,goal,description,start_date,end_date,status,budget,color,created_at) VALUES (@name,@owner,@dealer_code,@goal,@description,@start_date,@end_date,@status,@budget,@color,@created_at)')
    .run({ ...pfields, created_at: new Date().toISOString() });
  proj = { id: r.lastInsertRowid };
}
const pid = proj.id;
console.log('Project:', PNAME, '(id', pid + ')');

// ---------- 2) Phase activities ----------
const ap = (phase, task) => ({ phase, task, owner: '', done: false });
const prep = (...labels) => labels.map(label => ({ label, done: false }));

const EVENTS = [
  { name: 'ประเมินร้าน & กำหนดมาตรฐาน A/B', date: '2026-09-06', type: 'other', tier: 'A', phase: 'เฟส 1 ประเมิน',
    goal: 'จัดระดับร้าน A/B + ทำ punch-list รายร้าน + เก็บ baseline',
    action_plan: [
      ap('ก่อนงาน', 'นัดหมาย ผจก.ร้าน + เตรียมแบบประเมินมาตรฐาน'),
      ap('วันงาน', 'ให้คะแนนร้านตามเกณฑ์ A/B (7 ด้าน)'),
      ap('วันงาน', 'ตรวจพื้นที่จัดแสดง / รถ / บุคลากร'),
      ap('วันงาน', 'เก็บ Baseline ยอดขายเริ่มต้น'),
      ap('หลังงาน', 'สรุประดับร้าน (A = SR / B = ไม่ใช่ SR)'),
      ap('หลังงาน', 'ทำ punch-list รายการปรับปรุงรายร้าน'),
      ap('หลังงาน', 'แต่งตั้งผู้รับผิดชอบ OFERO ประจำร้าน'),
    ],
    prep: prep('เตรียมแบบประเมิน', 'นัดหมายร้าน', 'สำรวจพื้นที่จริง') },

  { name: 'อบรมทีมขาย 7 Steps / FABE + Role-play', date: '2026-09-13', type: 'training', tier: 'A', phase: 'เฟส 2 ร้านต้นแบบ',
    goal: 'ทีมขายผ่านอบรม 100% + แนะนำรุ่นตามการใช้งานจริง', target_training: 8,
    action_plan: [
      ap('ก่อนงาน', 'เตรียมสื่อการสอน + ทดสอบก่อนอบรม (Pre-test)'),
      ap('วันงาน', 'พื้นฐานรถไฟฟ้า + ความรู้สินค้า 8 รุ่น'),
      ap('วันงาน', 'วิเคราะห์ความต้องการ + 7 Steps to Selling'),
      ap('วันงาน', 'เทคนิค FABE + การสาธิต/ทดลองขับ'),
      ap('วันงาน', 'รับมือข้อโต้แย้ง + การติดตามลูกค้า + บริการหลังการขาย'),
      ap('วันงาน', 'Role-play รายคน'),
      ap('หลังงาน', 'ประเมินผ่าน/ไม่ผ่าน + ออกใบรับรอง'),
    ],
    prep: prep('เตรียมสื่อ/ห้องอบรม', 'นัดทีมขาย', 'เตรียมแบบประเมิน') },

  { name: 'จัดร้านต้นแบบ SR + เปิดตัว', date: '2026-09-20', type: 'activation', tier: 'A', phase: 'เฟส 2 ร้านต้นแบบ',
    goal: 'ร้าน SR ต้นแบบพร้อมขาย (รถตรงมาตรฐาน 100% · ป้ายครบ ≥95%)',
    action_plan: [
      ap('ก่อนงาน', 'ผลิต + จัดส่ง POSM ครบชุดมาตรฐาน A'),
      ap('ก่อนงาน', 'เตรียมรถจัดแสดง 8-10 คัน + Demo (Ledo/Galaxy/Gemini)'),
      ap('วันงาน', 'จัดโซน OFERO แยกชัดเจน + วางรถตามสัดส่วน'),
      ap('วันงาน', 'ติดตั้ง POSM + ป้ายข้อมูลรถ 7 หมวดทุกคัน'),
      ap('วันงาน', 'วางเส้นทาง Test Ride + ฉากส่งมอบรถ'),
      ap('วันงาน', 'ถ่ายรูปหน้าร้านหลังจัดเสร็จ'),
      ap('หลังงาน', 'ตรวจ readiness ตาม KPI มาตรฐาน A'),
    ],
    prep: prep('รับของ POSM', 'ติดตั้งสื่อ/บูธ', 'จัดรถ/โซน OFERO', 'จัดร้านเสร็จ + ถ่ายรูป') },

  { name: 'Test Ride Day #1', date: '2026-10-11', type: 'testride', tier: 'A', phase: 'เฟส 3 ขยายผล',
    goal: 'สร้าง Lead + Test Ride + ปิดการขายหน้าร้าน', target_testride: 40, target_lead: 60, target_sellout: 8,
    action_plan: [
      ap('ก่อนงาน', 'โปรโมทล่วงหน้า + เปิดจองคิวทดลองขับ'),
      ap('ก่อนงาน', 'เตรียมรถ Demo (แบตเต็ม/เบรกปกติ) + ทีมหน้างาน'),
      ap('วันงาน', 'เปิดลงทะเบียน + ทดลองขับตามกติกาความปลอดภัย'),
      ap('วันงาน', 'เก็บ Lead ครบทุกราย + ปิดการขาย/รับจอง'),
      ap('หลังงาน', 'ส่ง Lead ให้เซลล์ติดตามภายใน 3 วัน'),
      ap('หลังงาน', 'สรุป KPI + ค่าใช้จ่ายจริง'),
    ],
    prep: prep('รับของ/รถ Demo', 'ติดตั้งหน้างาน', 'จัดเสร็จพร้อมเปิด') },

  { name: 'Field Coaching ARM (รอบ 1)', date: '2026-10-25', type: 'training', tier: 'A', phase: 'เฟส 3 ขยายผล',
    goal: 'เปลี่ยนการอบรมเป็นพฤติกรรมขายจริง',
    action_plan: [
      ap('วันงาน', 'ARM สังเกตการขายจริงหน้าร้าน'),
      ap('วันงาน', 'Coaching หน้างาน + แก้จุดอ่อนรายคน'),
      ap('วันงาน', 'เช็คความพร้อมรถ/สื่อ (mini-audit)'),
      ap('หลังงาน', 'ประเมิน/รับรองทักษะรายคน'),
      ap('หลังงาน', 'ติดตาม Lead หลังทดลองขับ'),
    ],
    prep: prep('นัดหมายร้าน', 'เตรียมแบบ coaching') },

  { name: 'กิจกรรมหน้าร้าน + Test Ride #2', date: '2026-11-08', type: 'activation', tier: 'A', phase: 'เฟส 3 ขยายผล',
    goal: 'กิจกรรมหน้าร้าน + Test Ride รอบ 2', target_testride: 40, target_lead: 60, target_sellout: 8,
    action_plan: [
      ap('ก่อนงาน', 'โปรโมทล่วงหน้า + เตรียม POSM/Demo'),
      ap('วันงาน', 'ติดตั้ง POSM + เปิดกิจกรรม + ทดลองขับ'),
      ap('วันงาน', 'เก็บ Lead + ปิดการขาย'),
      ap('หลังงาน', 'คืน POSM + ส่ง Lead + สรุปผล'),
    ],
    prep: prep('รับของ', 'ติดตั้งหน้างาน', 'จัดเสร็จ') },

  { name: 'Field Coaching ARM (รอบ 2)', date: '2026-11-22', type: 'training', tier: 'A', phase: 'เฟส 3 ขยายผล',
    goal: 'ตอกย้ำพฤติกรรมขาย + ปิดช่องว่าง',
    action_plan: [
      ap('วันงาน', 'ARM สังเกตการขายจริง + Coaching'),
      ap('วันงาน', 'เช็คความพร้อมรถ/สื่อ'),
      ap('หลังงาน', 'ประเมินทักษะ + ติดตาม Conversion'),
    ],
    prep: prep('นัดหมายร้าน', 'เตรียมแบบ coaching') },

  { name: 'ทบทวน KPI ไตรมาส + ปรับแผน', date: '2026-12-06', type: 'other', tier: 'A', phase: 'เฟส 4 ปรับตามข้อมูล',
    goal: 'ทบทวนผล + ปรับมาตรฐาน + ถอดโมเดลขยายสาขา',
    action_plan: [
      ap('วันงาน', 'รวบรวม Lead / Test Ride / Conversion / Sell-Out รายเดือน'),
      ap('วันงาน', 'ทบทวนสี/รุ่นที่ขายดี + ผลการดำเนินงาน'),
      ap('หลังงาน', 'ปรับมาตรฐาน/วิธีขายให้ดีขึ้น'),
      ap('หลังงาน', 'ถอดโมเดล → แผนขยายไปสาขาอื่น'),
    ],
    prep: prep('รวบรวมข้อมูล KPI', 'เตรียมสรุปผล') },
];

const nextId = () => (db.prepare('SELECT MAX(id) m FROM events').get().m || 0) + 1;
let created = 0, enriched = 0;
for (const e of EVENTS) {
  // match existing (won't duplicate): by name+dealer, else by date+dealer, else by name alone
  const cur = db.prepare('SELECT * FROM events WHERE activity_name=? AND dealer_code=?').get(e.name, DEALER)
           || db.prepare('SELECT * FROM events WHERE start_date=? AND dealer_code=?').get(e.date, DEALER)
           || db.prepare('SELECT * FROM events WHERE activity_name=?').get(e.name);
  const base = {
    dealer_code: DEALER, dealer_name: d.name, province: d.province,
    activity_name: e.name, type: e.type, tier: e.tier, phase: e.phase,
    start_date: e.date, end_date: e.date, event_date: e.date, duration_days: 1,
    goal: e.goal, project_id: pid, status: 'planned',
    action_plan: JSON.stringify(e.action_plan), prep: JSON.stringify(e.prep),
    target_sellout: e.target_sellout || 0, target_lead: e.target_lead || 0,
    target_testride: e.target_testride || 0, target_training: e.target_training || 0,
  };
  if (cur) {
    // enrich: always link project + tier/type/phase; fill blanks; don't clobber edited numbers
    const empty = v => v == null || v === '' || v === '[]' || v === 0;
    const set = {
      project_id: pid, type: e.type, tier: e.tier, phase: e.phase, activity_name: e.name,
      dealer_code: cur.dealer_code || DEALER,
      dealer_name: cur.dealer_name || d.name, province: cur.province || d.province,
      start_date: cur.start_date || e.date, end_date: cur.end_date || e.date,
      goal: cur.goal || e.goal,
      action_plan: empty(cur.action_plan) ? base.action_plan : cur.action_plan,
      prep: empty(cur.prep) ? base.prep : cur.prep,
      target_sellout: cur.target_sellout || base.target_sellout,
      target_lead: cur.target_lead || base.target_lead,
      target_testride: cur.target_testride || base.target_testride,
      target_training: cur.target_training || base.target_training,
    };
    db.prepare(`UPDATE events SET project_id=@project_id, type=@type, tier=@tier, phase=@phase, activity_name=@activity_name,
      dealer_code=@dealer_code, dealer_name=@dealer_name, province=@province, start_date=@start_date, end_date=@end_date, goal=@goal,
      action_plan=@action_plan, prep=@prep, target_sellout=@target_sellout, target_lead=@target_lead,
      target_testride=@target_testride, target_training=@target_training WHERE id=@id`).run({ ...set, id: cur.id });
    enriched++;
    console.log('  ~ enriched:', e.name);
  } else {
    const id = nextId();
    const cols = Object.keys(base);
    db.prepare(`INSERT INTO events (id,${cols.join(',')}) VALUES (@id,${cols.map(c => '@' + c).join(',')})`).run({ ...base, id });
    created++;
    console.log('  + created :', e.name);
  }
}
console.log(`\nเสร็จ: สร้างใหม่ ${created} · เติมข้อมูล ${enriched} กิจกรรม · ผูกเข้าโครงการ "${PNAME}" ทั้งหมด`);
