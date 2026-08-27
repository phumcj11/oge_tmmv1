// SQLite data layer for the Ofero TMM system
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tmm.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dealers (
      code TEXT PRIMARY KEY, name TEXT, tax TEXT, province TEXT, address TEXT,
      lat REAL, lon REAL, phone TEXT, line TEXT, tier TEXT,
      sellin INTEGER, retail INTEGER, profit INTEGER, units INTEGER, po INTEGER, outstanding INTEGER
    );
    CREATE TABLE IF NOT EXISTS products (
      model TEXT PRIMARY KEY, cost INTEGER, price INTEGER, margin INTEGER, profit INTEGER,
      units INTEGER, sellin INTEGER, dealer_profit INTEGER
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, dealer_code TEXT, dealer_name TEXT, province TEXT,
      week INTEGER, event_date TEXT, phase TEXT, status TEXT, budget INTEGER,
      leads INTEGER, sales_units INTEGER
    );
    CREATE TABLE IF NOT EXISTS posm (
      code TEXT PRIMARY KEY, name TEXT, type TEXT, qty INTEGER,
      condition TEXT, location TEXT, status TEXT,
      min_stock INTEGER DEFAULT 0, unit_value INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS posm_moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      posm_code TEXT, event_id INTEGER, dest TEXT, qty INTEGER,
      date_out TEXT, due_date TEXT, date_back TEXT, person TEXT, note TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY, name TEXT, salt TEXT, hash TEXT,
      role TEXT DEFAULT 'viewer', created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, username TEXT, expires INTEGER
    );
    CREATE TABLE IF NOT EXISTS sellout (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_code TEXT, dealer_name TEXT, ym TEXT, model TEXT,
      sold INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, note TEXT, updated_at TEXT,
      UNIQUE(dealer_code, ym, model)
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER, filename TEXT, original TEXT, mime TEXT, size INTEGER,
      uploaded_by TEXT, note TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS store_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_code TEXT, dealer_name TEXT, ym TEXT, tier TEXT,
      checklist TEXT,
      lead INTEGER DEFAULT 0, test_ride INTEGER DEFAULT 0, quote INTEGER DEFAULT 0, sold INTEGER DEFAULT 0,
      note TEXT, updated_at TEXT,
      UNIQUE(dealer_code, ym)
    );
  `);
  // migrate older DBs that predate the new posm columns
  const cols = db.prepare("PRAGMA table_info(posm)").all().map(c => c.name);
  if (!cols.includes('min_stock')) db.exec('ALTER TABLE posm ADD COLUMN min_stock INTEGER DEFAULT 0');
  if (!cols.includes('unit_value')) db.exec('ALTER TABLE posm ADD COLUMN unit_value INTEGER DEFAULT 0');
  if (!cols.includes('std_a')) db.exec('ALTER TABLE posm ADD COLUMN std_a INTEGER DEFAULT 0');
  if (!cols.includes('std_b')) db.exec('ALTER TABLE posm ADD COLUMN std_b INTEGER DEFAULT 0');
  // events: retail-plan fields (event type, store tier, test rides)
  const ecols = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
  if (!ecols.includes('type')) db.exec("ALTER TABLE events ADD COLUMN type TEXT DEFAULT 'activation'");
  if (!ecols.includes('tier')) db.exec("ALTER TABLE events ADD COLUMN tier TEXT DEFAULT ''");
  if (!ecols.includes('test_ride')) db.exec('ALTER TABLE events ADD COLUMN test_ride INTEGER DEFAULT 0');
  // events: Lark "กิจกรรม ARM" form fields + target/actual tracking
  const eAdd = {
    dept: "TEXT DEFAULT ''", activity_name: "TEXT DEFAULT ''", company: "TEXT DEFAULT ''",
    branch: "TEXT DEFAULT ''", customer_name: "TEXT DEFAULT ''", customer_phone: "TEXT DEFAULT ''",
    start_date: "TEXT DEFAULT ''", end_date: "TEXT DEFAULT ''", duration_days: "INTEGER DEFAULT 1",
    goal: "TEXT DEFAULT ''", owner: "TEXT DEFAULT ''", support_team: "TEXT DEFAULT ''",
    bank: "TEXT DEFAULT ''", bank_account: "TEXT DEFAULT ''",
    budget_lines: "TEXT DEFAULT '[]'", stock_prep: "TEXT DEFAULT '[]'",
    action_plan: "TEXT DEFAULT '[]'", manpower: "TEXT DEFAULT '[]'",
    target_sellout: "INTEGER DEFAULT 0", target_lead: "INTEGER DEFAULT 0",
    target_testride: "INTEGER DEFAULT 0", target_training: "INTEGER DEFAULT 0",
    act_training: "INTEGER DEFAULT 0",
    assignees: "TEXT DEFAULT ''", prep: "TEXT DEFAULT '[]'",
  };
  for (const [c, def] of Object.entries(eAdd))
    if (!ecols.includes(c)) db.exec(`ALTER TABLE events ADD COLUMN ${c} ${def}`);
  // dealers: TMM profile fields
  const dcols = db.prepare("PRAGMA table_info(dealers)").all().map(c => c.name);
  if (!dcols.includes('sales_rep')) db.exec("ALTER TABLE dealers ADD COLUMN sales_rep TEXT DEFAULT ''");
  if (!dcols.includes('credit')) db.exec("ALTER TABLE dealers ADD COLUMN credit TEXT DEFAULT ''");
  // create a default admin on first run (persists across data reseeds)
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('ofero1234', salt, 64).toString('hex');
    db.prepare('INSERT INTO users (username,name,salt,hash,role,created_at) VALUES (?,?,?,?,?,?)')
      .run('admin', 'ผู้ดูแลระบบ', salt, hash, 'admin', new Date().toISOString());
    console.log('>> สร้าง user เริ่มต้น: admin / ofero1234  — กรุณาเปลี่ยนรหัสหลัง login ครั้งแรก');
  }
}

function seed() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dealers').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM events').run();
    db.prepare('DELETE FROM posm').run();
    const di = db.prepare(`INSERT INTO dealers (code,name,tax,province,address,lat,lon,phone,line,tier,sellin,retail,profit,units,po,outstanding)
      VALUES (@code,@name,@tax,@province,@address,@lat,@lon,@phone,@line,@tier,@sellin,@retail,@profit,@units,@po,@outstanding)`);
    data.dealers.forEach(d => di.run(d));
    const pi = db.prepare(`INSERT INTO products (model,cost,price,margin,profit,units,sellin,dealer_profit)
      VALUES (@model,@cost,@price,@margin,@profit,@units,@sellin,@dealer_profit)`);
    data.products.forEach(p => pi.run(p));
    const ei = db.prepare(`INSERT INTO events (id,dealer_code,dealer_name,province,week,event_date,phase,status,budget,leads,sales_units)
      VALUES (@id,@dealer_code,@dealer_name,@province,@week,@event_date,@phase,@status,@budget,@leads,@sales_units)`);
    data.events.forEach(e => ei.run(e));
    db.prepare('DELETE FROM posm_moves').run();
    const mi = db.prepare(`INSERT INTO posm (code,name,type,qty,condition,location,status,min_stock,unit_value)
      VALUES (@code,@name,@type,@qty,@condition,@location,@status,@min_stock,@unit_value)`);
    data.posm.forEach(m => mi.run(m));
    const meta = db.prepare('INSERT OR REPLACE INTO meta (key,value) VALUES (?,?)');
    meta.run('region_sellin', JSON.stringify(data.region_sellin));
    meta.run('month_sellin', JSON.stringify(data.month_sellin));
  });
  tx();
  console.log('Seeded:', data.dealers.length, 'dealers,', data.products.length, 'products,',
              data.events.length, 'events,', data.posm.length, 'posm items');
}

init();
// seed if empty, or when run with --seed
const empty = db.prepare('SELECT COUNT(*) c FROM dealers').get().c === 0;
if (process.argv.includes('--seed') || empty) seed();

module.exports = db;
