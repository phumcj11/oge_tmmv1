// Phase 2 schema — Dealer Scoring/Tier (SOP-002) + Campaign Readiness Gate (SOP-003).
// Additive; called from db.js:  require('./scoring-schema')(db)
module.exports = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scoring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_version TEXT UNIQUE, effective_date TEXT, status TEXT DEFAULT 'Draft',
      weights TEXT DEFAULT '{}', cutoffs TEXT DEFAULT '{}',
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS dealer_score_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT UNIQUE, rule_version TEXT, status TEXT DEFAULT 'Open',
      created_at TEXT, created_by TEXT, approved_at TEXT, approved_by TEXT
    );
    CREATE TABLE IF NOT EXISTS dealer_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT, dealer_code TEXT, dealer_name TEXT,
      sales INTEGER, market INTEGER, growth INTEGER, stock INTEGER, execution INTEGER, credit INTEGER,
      total INTEGER, critical_gate TEXT DEFAULT 'Pass',
      suggested_tier TEXT, override_tier TEXT, final_tier TEXT,
      approval_status TEXT DEFAULT 'Draft', reason TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT,
      UNIQUE(period, dealer_code)
    );
    CREATE TABLE IF NOT EXISTS tier_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dealer_code TEXT, period TEXT, old_tier TEXT, new_tier TEXT,
      reason TEXT, kpi_proof TEXT, approver TEXT, expiry TEXT,
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS readiness_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER,
      brief TEXT DEFAULT 'Pending', dealer TEXT DEFAULT 'Pending', budget TEXT DEFAULT 'Pending',
      stock TEXT DEFAULT 'Pending', posm TEXT DEFAULT 'Pending', execution TEXT DEFAULT 'Pending', risk TEXT DEFAULT 'Pending',
      overall_status TEXT DEFAULT 'Pending', exception_ref TEXT,
      updated_at TEXT, updated_by TEXT,
      UNIQUE(campaign_id, version)
    );
  `);
  // default active scoring rule (SOP-002 weights/cut-offs) — idempotent
  if (!db.prepare('SELECT COUNT(*) c FROM scoring_rules').get().c) {
    db.prepare(`INSERT INTO scoring_rules (rule_version,effective_date,status,weights,cutoffs,created_at,created_by)
      VALUES (?,?,?,?,?,?,?)`).run(
      'v1', new Date().toISOString().slice(0, 10), 'Active',
      JSON.stringify({ sales: 25, market: 20, growth: 15, stock: 15, execution: 15, credit: 10 }),
      JSON.stringify({ A: 80, B: 65, C: 50 }), new Date().toISOString(), 'system');
    console.log('>> scoring: seeded default rule v1 (SOP-002 weights)');
  }
};
