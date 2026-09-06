// Phase 4 schema — Post Campaign Evaluation, ROI & Learning (SOP-005). Additive.
// Called from db.js:  require('./evaluation-schema')(db)
module.exports = function (db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, data_set TEXT, data_owner TEXT,
      due_date TEXT, received_date TEXT, completeness REAL, sla_status TEXT,
      validation_status TEXT DEFAULT 'Pending', issue TEXT,
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS data_validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, data_set TEXT,
      source_total REAL, summary_total REAL, variance REAL, duplicate_count INTEGER,
      result TEXT DEFAULT 'Pending', validator TEXT, created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_kpi_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, kpi TEXT,
      baseline REAL, target REAL, actual REAL, achievement REAL, incremental REAL,
      result_status TEXT, data_status TEXT DEFAULT 'Pending', created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS funnel_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT,
      footfall INTEGER, qualified_lead INTEGER, test_ride INTEGER, sale INTEGER,
      f2l REAL, l2t REAL, t2s REAL, data_status TEXT DEFAULT 'Pending',
      created_at TEXT, created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS dealer_comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT, region TEXT, final_tier TEXT,
      kpi_achievement REAL, funnel_score REAL, evidence_complete REAL, compliance_score REAL,
      composite REAL, rank_group TEXT, decision TEXT, created_at TEXT, created_by TEXT,
      UNIQUE(campaign_id, dealer_code)
    );
    CREATE TABLE IF NOT EXISTS roi_calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, dealer_code TEXT,
      baseline_units REAL, actual_units REAL, incremental_units REAL,
      contribution_per_unit REAL, incremental_contribution REAL,
      approved_budget REAL, actual_spend REAL, budget_variance REAL,
      net_contribution REAL, roi REAL,
      accounting_status TEXT DEFAULT 'Pending', roi_status TEXT DEFAULT 'Not Calculated',
      assumption TEXT, created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS review_minutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, review_date TEXT, participants TEXT,
      kpi_conclusion TEXT, financial_conclusion TEXT, dealer_conclusion TEXT, key_risk TEXT,
      decision TEXT, approver TEXT, approval_status TEXT DEFAULT 'Pending', conditions TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS learning_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER, finding TEXT, cause_status TEXT, recommendation TEXT, action TEXT,
      owner TEXT, due_date TEXT, status TEXT DEFAULT 'Open', success_measure TEXT,
      evidence_ref TEXT, escalation TEXT, close_date TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_closures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER UNIQUE,
      data_validated TEXT DEFAULT 'No', financial_validated TEXT DEFAULT 'No', report_approved TEXT DEFAULT 'No',
      actions_assigned TEXT DEFAULT 'No', archive_complete TEXT DEFAULT 'No', learning_shared TEXT DEFAULT 'No',
      overall_status TEXT DEFAULT 'Pending', closed_by TEXT, close_date TEXT,
      created_at TEXT, updated_at TEXT, created_by TEXT, updated_by TEXT
    );
  `);
};
