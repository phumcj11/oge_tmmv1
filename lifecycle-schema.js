// Phase 1 (Foundation) schema — Trade Marketing lifecycle.
// Additive only: CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN (idempotent) + region backfill.
// Called from db.js:  require('./lifecycle-schema')(db)  (after init/seed, before export)

// province -> region (ตรงกับ public/app.js PROV_REGION)
const PROV_REGION = (() => {
  const R = {
    'กรุงเทพ ปริมณฑล': ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'],
    'เหนือ': ['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์', 'ตาก', 'สุโขทัย', 'พิษณุโลก', 'เพชรบูรณ์', 'พิจิตร', 'กำแพงเพชร', 'นครสวรรค์', 'อุทัยธานี'],
    'อีสาน': ['เลย', 'หนองคาย', 'หนองบัวลำภู', 'อุดรธานี', 'บึงกาฬ', 'นครพนม', 'สกลนคร', 'มุกดาหาร', 'กาฬสินธุ์', 'ขอนแก่น', 'มหาสารคาม', 'ร้อยเอ็ด', 'ยโสธร', 'อำนาจเจริญ', 'อุบลราชธานี', 'ศรีสะเกษ', 'สุรินทร์', 'บุรีรัมย์', 'นครราชสีมา', 'ชัยภูมิ'],
    'ใต้': ['ชุมพร', 'ระนอง', 'สุราษฎร์ธานี', 'พังงา', 'ภูเก็ต', 'กระบี่', 'นครศรีธรรมราช', 'ตรัง', 'พัทลุง', 'สตูล', 'สงขลา', 'ปัตตานี', 'ยะลา', 'นราธิวาส'],
    'กลาง': ['พระนครศรีอยุธยา', 'อ่างทอง', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'สระบุรี', 'สุพรรณบุรี', 'กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์', 'สมุทรสงคราม', 'นครนายก', 'ปราจีนบุรี', 'สระแก้ว', 'ฉะเชิงเทรา', 'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด'],
  };
  const m = {}; for (const [r, ps] of Object.entries(R)) ps.forEach(p => m[p] = r); return m;
})();
const REGIONS = ['กรุงเทพ ปริมณฑล', 'กลาง', 'เหนือ', 'อีสาน', 'ใต้'];

module.exports = function (db) {
  // ---- new lifecycle tables ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      code TEXT PRIMARY KEY, name TEXT
    );
    CREATE TABLE IF NOT EXISTS areas (
      code TEXT PRIMARY KEY, name TEXT, region TEXT, area_owner TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS user_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT, scope_type TEXT, scope_value TEXT,
      UNIQUE(username, scope_type, scope_value)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity TEXT, entity_id TEXT, action TEXT,
      field TEXT, old_value TEXT, new_value TEXT,
      reason TEXT, actor TEXT, approver TEXT, evidence_ref TEXT,
      at TEXT
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT, objective TEXT, campaign_type TEXT,
      product_scope TEXT, region TEXT, tier_scope TEXT,
      start_date TEXT, end_date TEXT, owner TEXT,
      plan_budget INTEGER DEFAULT 0,
      current_version INTEGER DEFAULT 1,
      work_status TEXT DEFAULT 'Draft',
      approval_status TEXT DEFAULT 'Pending',
      kpi TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER,
      business TEXT DEFAULT '{}', commercial TEXT DEFAULT '{}',
      dealer_scope TEXT DEFAULT '{}', readiness TEXT DEFAULT '{}',
      financial TEXT DEFAULT '{}', measurement TEXT DEFAULT '{}',
      brief_status TEXT DEFAULT 'Draft',
      locked INTEGER DEFAULT 0, locked_at TEXT, locked_by TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT,
      UNIQUE(campaign_id, version)
    );
    CREATE TABLE IF NOT EXISTS campaign_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER,
      type TEXT, decision TEXT, conditions TEXT,
      approver TEXT, decided_at TEXT, doc_ref TEXT,
      created_at TEXT, created_by TEXT
    );
  `);

  // ---- additive columns on existing tables (idempotent) ----
  const hasCol = (t, c) => db.prepare('PRAGMA table_info(' + t + ')').all().some(x => x.name === c);
  const addCol = (t, c, def) => { if (!hasCol(t, c)) db.exec('ALTER TABLE ' + t + ' ADD COLUMN ' + c + ' ' + def); };

  // dealers: region/area + status (region backfilled below)
  addCol('dealers', 'region', "TEXT DEFAULT ''");
  addCol('dealers', 'area_code', "TEXT DEFAULT ''");
  addCol('dealers', 'area_owner', "TEXT DEFAULT ''");
  addCol('dealers', 'dealer_status', "TEXT DEFAULT ''");
  addCol('dealers', 'data_status', "TEXT DEFAULT ''");

  // events: link to campaign lifecycle
  addCol('events', 'campaign_id', 'INTEGER');
  addCol('events', 'campaign_version', 'INTEGER');

  // created_by / updated_by convention on transactional tables
  for (const t of ['dealers', 'events', 'projects', 'sellout', 'store_audit', 'posm', 'posm_moves', 'attachments']) {
    addCol(t, 'created_by', "TEXT DEFAULT ''");
    addCol(t, 'updated_by', "TEXT DEFAULT ''");
  }

  // ---- seed regions (idempotent) ----
  const insR = db.prepare('INSERT OR IGNORE INTO regions (code, name) VALUES (?, ?)');
  REGIONS.forEach(r => insR.run(r, r));

  // ---- backfill dealers.region from province where empty ----
  const rows = db.prepare("SELECT code, province, region FROM dealers WHERE region IS NULL OR region=''").all();
  if (rows.length) {
    const upd = db.prepare('UPDATE dealers SET region=? WHERE code=?');
    const tx = db.transaction(() => {
      for (const d of rows) {
        const reg = PROV_REGION[d.province] || '';
        if (reg) upd.run(reg, d.code);
      }
    });
    tx();
    console.log('>> lifecycle: backfilled region for', rows.length, 'dealers');
  }
};
