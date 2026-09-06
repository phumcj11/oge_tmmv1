// Phase 5 UI — TM Control Board (lifecycle rollup). Loaded after app.js.
(function () {
  const baht = v => (v || 0).toLocaleString();
  const WSC = { Draft: '#78909c', 'Pending Approval': '#b8860b', Approved: '#2e7d32', Locked: '#1565c0', 'In Progress': '#1565c0', Completed: '#2e7d32', Closed: '#2e7d32', 'On Hold': '#b8860b', Rejected: '#c62828', Cancelled: '#c62828' };
  const LVL = { Critical: '#c62828', High: '#ef6c00', Medium: '#b8860b', Low: '#78909c' };

  window.renderTMBoard = async function () {
    const el = $('#tmboard');
    let d; try { d = await api('/api/tm-dashboard'); } catch (_) { el.innerHTML = '<div class="card muted">โหลดไม่สำเร็จ</div>'; return; }
    const kpi = (l, v, s, c) => `<div class="kpi"><div class="l">${l}</div><div class="v"${c ? ' style="color:' + c + '"' : ''}>${v}</div><div class="s">${s || ''}</div></div>`;
    const statusBars = Object.entries(d.campaigns.byStatus || {}).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="bar-row"><div class="bar-lbl">${esc(k)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, v / d.campaigns.total * 100).toFixed(0)}%;background:${WSC[k] || '#78909c'}"></div></div><div style="min-width:28px;text-align:right">${v}</div></div>`).join('') || '<div class="muted">—</div>';
    const tier = Object.entries(d.tier_dist || {}).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(' · ') || '—';

    el.innerHTML = `
    <div class="card"><div class="toolbar"><h2 style="margin:0">🧭 TM Control Board</h2><span class="muted">ขอบเขต: ${esc(d.scope)}</span></div></div>
    <div class="kpis">
      ${kpi('แคมเปญทั้งหมด', d.campaigns.total, d.campaigns.in_progress + ' กำลังดำเนิน')}
      ${kpi('รออนุมัติ', d.campaigns.pending_approval, 'Pending Approval', d.campaigns.pending_approval ? '#b8860b' : '')}
      ${kpi('ยังไม่ผ่าน Readiness', d.campaigns.pending_readiness, 'Draft/Pending')}
      ${kpi('ปิดแล้ว', d.campaigns.closed, 'Closed', '#2e7d32')}
      ${kpi('Incident เปิดค้าง', d.incidents.open, d.incidents.critical_high_open + ' Critical/High', d.incidents.open ? '#c62828' : '#2e7d32')}
      ${kpi('SLA เกิน', d.incidents.sla_breached, 'Breached', d.incidents.sla_breached ? '#c62828' : '#2e7d32')}
      ${kpi('Action เกินกำหนด', d.actions.overdue, d.actions.open + ' เปิดอยู่', d.actions.overdue ? '#c62828' : '#2e7d32')}
      ${kpi('งบแผน', baht(d.budget.plan), 'จ่ายจริง ' + baht(d.budget.expense_actual))}
    </div>
    <div class="grid2">
      <div class="card"><h2>📋 สถานะแคมเปญ</h2>${statusBars}
        <div class="muted" style="margin-top:10px;font-size:12px">Tier ล่าสุด: ${tier}</div></div>
      <div class="card"><h2>💵 ROI</h2>
        <div class="pstat">
          <div class="ps"><b style="color:#2e7d32">${d.roi.calculated}</b><span>Calculated</span></div>
          <div class="ps"><b style="color:#b8860b">${d.roi.directional}</b><span>Directional</span></div>
          <div class="ps"><b style="color:#c62828">${d.roi.not_calculated}</b><span>Not Calculated</span></div>
          <div class="ps"><b>${d.roi.avg == null ? '-' : (d.roi.avg * 100).toFixed(1) + '%'}</b><span>ROI เฉลี่ย</span></div>
        </div>
        <div class="muted" style="margin-top:8px;font-size:12px">บัญชีรอยืนยัน: ${d.budget.accounting_pending} รายการ</div></div>
    </div>
    <div class="grid2">
      <div class="card scroll"><h2>⏳ รออนุมัติ (${d.lists.pendingApproval.length})</h2>
        <table><tr><th>Campaign</th><th>ชื่อ</th><th>ภูมิภาค</th></tr>${d.lists.pendingApproval.length ? d.lists.pendingApproval.map(c => `<tr><td>${esc(c.code)}</td><td>${esc(c.name)}</td><td>${esc(c.region) || '-'}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">ไม่มี</td></tr>'}</table></div>
      <div class="card scroll"><h2>🚨 Incident เปิดค้าง (${d.lists.openInc.length})</h2>
        <table><tr><th>Level</th><th>Campaign</th><th>รายละเอียด</th></tr>${d.lists.openInc.length ? d.lists.openInc.map(i => `<tr><td><span style="color:${LVL[i.level] || '#475467'};font-weight:600">${esc(i.level)}</span></td><td>${esc(i.campaign)}</td><td>${esc(i.description)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">ไม่มี</td></tr>'}</table></div>
    </div>
    <div class="card scroll"><h2>⏰ Corrective Action เกินกำหนด (${d.lists.overdueActs.length})</h2>
      <table><tr><th>Campaign</th><th>Action</th><th>Owner</th><th>กำหนด</th><th>สถานะ</th></tr>${d.lists.overdueActs.length ? d.lists.overdueActs.map(a => `<tr><td>${esc(a.campaign)}</td><td>${esc(a.action)}</td><td>${esc(a.owner)}</td><td style="color:#c62828">${esc(a.due_date)}</td><td>${esc(a.status)}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">ไม่มี</td></tr>'}</table></div>`;
  };
})();
