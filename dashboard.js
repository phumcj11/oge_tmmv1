// Phase 5 API — TM Control Dashboard (rollup ของทั้ง lifecycle). require('./dashboard')(app, db)
module.exports = function (app, db) {
  const SEES_ALL = ['admin', 'tmm', 'approver', 'accounting'];
  function allowedRegions(user) {
    if (!user || SEES_ALL.includes(user.role)) return null;
    const s = db.prepare("SELECT scope_value FROM user_scopes WHERE username=? AND scope_type='region'").all(user.username).map(r => r.scope_value);
    return s.length ? s : null;
  }
  const today = () => new Date().toISOString().slice(0, 10);

  app.get('/api/tm-dashboard', (req, res) => {
    const regs = allowedRegions(req.user);
    // campaign id scope
    let camps;
    if (regs) { const ph = regs.map(() => '?').join(','); camps = db.prepare(`SELECT * FROM campaigns WHERE region IN (${ph}) OR region=''`).all(...regs); }
    else camps = db.prepare('SELECT * FROM campaigns').all();
    const ids = camps.map(c => c.id);
    const inSet = ids.length ? '(' + ids.join(',') + ')' : '(0)';

    // campaign status breakdown
    const byStatus = {};
    camps.forEach(c => { byStatus[c.work_status] = (byStatus[c.work_status] || 0) + 1; });
    const count = st => camps.filter(c => c.work_status === st).length;

    // budget (plan) + expenses (actual/approved)
    const plan_budget = camps.reduce((a, c) => a + (c.plan_budget || 0), 0);
    const exp = db.prepare(`SELECT COALESCE(SUM(approved_budget),0) app, COALESCE(SUM(actual),0) act,
      COALESCE(SUM(CASE WHEN accounting_status!='Validated' THEN 1 ELSE 0 END),0) pend FROM expenses WHERE campaign_id IN ${inSet}`).get();

    // incidents
    const incRows = db.prepare(`SELECT level, status, sla_status FROM incidents WHERE campaign_id IN ${inSet}`).all();
    const incidents = {
      open: incRows.filter(i => i.status !== 'Closed').length,
      critical_high_open: incRows.filter(i => i.status !== 'Closed' && ['Critical', 'High'].includes(i.level)).length,
      sla_breached: incRows.filter(i => i.sla_status === 'SLA Breached').length,
    };

    // ROI status
    const roiRows = db.prepare(`SELECT roi_status, roi FROM roi_calculations WHERE campaign_id IN ${inSet}`).all();
    const roi = {
      calculated: roiRows.filter(r => r.roi_status === 'Calculated').length,
      directional: roiRows.filter(r => r.roi_status === 'Directional').length,
      not_calculated: roiRows.filter(r => r.roi_status === 'Not Calculated').length,
      avg: (() => { const v = roiRows.filter(r => r.roi != null).map(r => r.roi); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000 : null; })(),
    };

    // corrective actions
    const acts = db.prepare(`SELECT id,campaign_id,action,owner,due_date,status FROM learning_actions WHERE campaign_id IN ${inSet}`).all();
    const actions = {
      open: acts.filter(a => a.status !== 'Closed').length,
      overdue: acts.filter(a => a.status !== 'Closed' && a.due_date && a.due_date < today()).length,
    };

    // closures
    const closed = db.prepare(`SELECT COUNT(*) c FROM campaign_closures WHERE campaign_id IN ${inSet} AND overall_status='Closed'`).get().c;

    // latest scoring period tier distribution
    const per = db.prepare("SELECT period FROM dealer_score_periods ORDER BY period DESC LIMIT 1").get();
    let tierDist = {};
    if (per) db.prepare('SELECT final_tier, COUNT(*) c FROM dealer_scores WHERE period=? GROUP BY final_tier').all(per.period).forEach(r => { tierDist[r.final_tier || '-'] = r.c; });

    // lists
    const codeOf = id => (camps.find(c => c.id === id) || {}).code || id;
    const pendingApproval = camps.filter(c => c.work_status === 'Pending Approval').map(c => ({ code: c.code, name: c.name, region: c.region }));
    const notReady = camps.filter(c => ['Draft', 'Pending Readiness'].includes(c.work_status)).map(c => ({ code: c.code, name: c.name }));
    const openInc = db.prepare(`SELECT id,campaign_id,level,category,description,status FROM incidents WHERE campaign_id IN ${inSet} AND status!='Closed' ORDER BY CASE level WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END LIMIT 10`).all().map(i => ({ ...i, campaign: codeOf(i.campaign_id) }));
    const overdueActs = acts.filter(a => a.status !== 'Closed' && a.due_date && a.due_date < today()).slice(0, 10).map(a => ({ ...a, campaign: codeOf(a.campaign_id) }));

    res.json({
      scope: regs ? regs.join(', ') : 'ทั้งประเทศ',
      campaigns: { total: camps.length, byStatus,
        pending_approval: count('Pending Approval'), pending_readiness: count('Draft') + count('Pending Readiness'),
        in_progress: count('In Progress'), locked: count('Locked'), closed: count('Closed') },
      budget: { plan: plan_budget, expense_approved: exp.app, expense_actual: exp.act, accounting_pending: exp.pend },
      incidents, roi, actions, closed_campaigns: closed, tier_dist: tierDist,
      lists: { pendingApproval, notReady, openInc, overdueActs },
    });
  });
};
