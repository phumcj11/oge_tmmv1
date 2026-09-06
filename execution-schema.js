// Phase 3 schema — Dealer Campaign Execution & Monitoring (SOP-004). Additive.
// Called from db.js:  require('./execution-schema')(db)
module.exports = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_packs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER, dealer_code TEXT, region TEXT,
      field_owner TEXT, sent INTEGER DEFAULT 0, acknowledged INTEGER DEFAULT 0,
      note TEXT, created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT,
      UNIQUE(campaign_id, version, dealer_code)
    );
    CREATE TABLE IF NOT EXISTS opening_readiness (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER, dealer_code TEXT, activity_date TEXT,
      staff TEXT DEFAULT 'Pending', stock TEXT DEFAULT 'Pending', posm TEXT DEFAULT 'Pending',
      price TEXT DEFAULT 'Pending', testride TEXT DEFAULT 'Pending', data_capture TEXT DEFAULT 'Pending',
      overall_status TEXT DEFAULT 'Pending', decision TEXT DEFAULT 'Hold', exception_ref TEXT,
      checked_by TEXT, created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS live_kpi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, kpi_date TEXT, time_slot TEXT, kpi TEXT,
      target_pace INTEGER, actual INTEGER, achievement REAL, pace_status TEXT,
      issue TEXT, corrective TEXT, owner TEXT,
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, reported_at TEXT,
      level TEXT, category TEXT, description TEXT, immediate_control TEXT,
      reporter TEXT, notified_to TEXT, decision_at TEXT,
      response_min REAL, sla_target_min INTEGER, sla_status TEXT,
      decision TEXT, owner TEXT, due_date TEXT, status TEXT DEFAULT 'Open',
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, approval_ref TEXT, category TEXT, vendor TEXT,
      approved_budget INTEGER, committed INTEGER, actual INTEGER, remaining INTEGER, variance INTEGER,
      doc_ref TEXT, accounting_status TEXT DEFAULT 'Pending', owner TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_closes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, version INTEGER, dealer_code TEXT, activity_date TEXT,
      kpi_reconciled TEXT DEFAULT 'No', lead_validated TEXT DEFAULT 'No', stock_reconciled TEXT DEFAULT 'No',
      expense_updated TEXT DEFAULT 'No', evidence_complete TEXT DEFAULT 'No',
      open_issue_count INTEGER DEFAULT 0, overall_status TEXT DEFAULT 'Pending',
      field_owner TEXT, tmm_review TEXT, handover_note TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT,
      UNIQUE(campaign_id, dealer_code, activity_date)
    );
  `);
};
