// Phase 1 Campaign lifecycle UI. Loaded after app.js; uses globals api, esc, toast, $, currentUser.
(function () {
  const WS_COLOR = {
    'Draft': '#78909c', 'Pending Readiness': '#b8860b', 'Pending Approval': '#b8860b',
    'Approved': '#2e7d32', 'Approved with Conditions': '#2e7d32', 'Locked': '#1565c0',
    'Ready to Launch': '#1565c0', 'In Progress': '#1565c0', 'Completed': '#2e7d32',
    'Under Review': '#b8860b', 'Closed': '#2e7d32', 'On Hold': '#b8860b',
    'Cancelled': '#c62828', 'Rejected': '#c62828', 'Change Requested': '#b8860b',
  };
  const role = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || '';
  const isAdmin = () => role() === 'admin';
  const canCreate = () => ['tmm', 'admin'].includes(role());
  const canApprove = () => ['approver', 'admin'].includes(role());
  const canTmm = () => ['tmm', 'admin'].includes(role());
  const badge = s => `<span class="tierb" style="background:${WS_COLOR[s] || '#78909c'};width:auto;padding:0 8px">${esc(s)}</span>`;

  window.renderCampaigns = async function () {
    const el = $('#campaigns');
    let rows = [];
    try { rows = await api('/api/campaigns'); } catch (_) {}
    el.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h2 style="margin:0">🎯 Campaign (Trade Marketing)</h2>
        <span class="muted" id="cmpCount">${rows.length} แคมเปญ</span>
        <span class="spacer"></span>
        ${canCreate() ? '<button class="btn" id="cmpAdd">➕ สร้างแคมเปญ</button>' : ''}
      </div>
      <div class="scroll"><table id="cmpTable">
        <tr><th>Campaign ID</th><th>ชื่อ</th><th>ภูมิภาค</th><th>ประเภท</th><th class="num">Ver</th><th>สถานะงาน</th><th>อนุมัติ</th></tr>
        ${rows.length ? rows.map(c => `<tr data-id="${c.id}" style="cursor:pointer">
          <td><b>${esc(c.code)}</b></td><td>${esc(c.name)}</td><td>${esc(c.region) || '-'}</td>
          <td>${esc(c.campaign_type) || '-'}</td><td class="num">v${c.current_version}</td>
          <td>${badge(c.work_status)}</td><td>${esc(c.approval_status) || '-'}</td></tr>`).join('')
        : '<tr><td colspan="7" class="muted">ยังไม่มีแคมเปญ' + (canCreate() ? ' — กด "สร้างแคมเปญ"' : '') + '</td></tr>'}
      </table></div>
    </div>`;
    $('#cmpAdd')?.addEventListener('click', openCreate);
    el.querySelectorAll('#cmpTable tr[data-id]').forEach(tr =>
      tr.addEventListener('click', () => openDetail(tr.dataset.id)));
  };

  function openCreate() {
    const bg = modal(`<h3>➕ สร้างแคมเปญใหม่</h3>
      <label>ชื่อแคมเปญ *</label><input id="c-name">
      <label>วัตถุประสงค์</label><input id="c-obj">
      <label>ประเภท</label><select id="c-type"><option value="">—</option><option>Major</option><option>Regional</option><option>Local</option></select>
      <label>ภูมิภาค</label><input id="c-region" placeholder="เช่น เหนือ / กลาง / อีสาน / ใต้ / กรุงเทพ ปริมณฑล">
      <label>งบประมาณแผน (บาท)</label><input id="c-budget" type="number" value="0">
      <div class="modal-act"><button class="btn ghost" id="c-cancel">ยกเลิก</button><button class="btn" id="c-ok">สร้าง</button></div>`);
    const q = s => bg.querySelector(s);
    q('#c-cancel').addEventListener('click', () => bg.remove());
    q('#c-ok').addEventListener('click', async () => {
      const name = q('#c-name').value.trim(); if (!name) { toast('ต้องมีชื่อ'); return; }
      const r = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, objective: q('#c-obj').value, campaign_type: q('#c-type').value, region: q('#c-region').value, plan_budget: +q('#c-budget').value || 0 }) });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'สร้างไม่สำเร็จ'); return; }
      toast('สร้างแคมเปญ ' + d.code); bg.remove(); renderCampaigns();
    });
  }

  async function openDetail(id) {
    let c; try { c = await api('/api/campaigns/' + id); } catch (_) { return; }
    const acts = actionButtons(c);
    const bg = modal(`<h3>${esc(c.code)} — ${esc(c.name)}</h3>
      <div class="im-stat"><span>สถานะ: ${badge(c.work_status)}</span><span class="muted">อนุมัติ: ${esc(c.approval_status)}</span><span class="muted">เวอร์ชันปัจจุบัน: v${c.current_version}</span></div>
      <div style="font-size:13px;line-height:1.9;margin:8px 0">
        <div>วัตถุประสงค์: ${esc(c.objective) || '-'}</div>
        <div>ประเภท: ${esc(c.campaign_type) || '-'} · ภูมิภาค: ${esc(c.region) || '-'} · งบแผน: ${(c.plan_budget || 0).toLocaleString()} ฿</div>
        <div>เจ้าของ: ${esc(c.owner) || '-'}</div>
      </div>
      <div class="muted" style="margin-top:6px">เวอร์ชัน (${c.versions.length})</div>
      <div class="scroll" style="max-height:120px"><table class="mini"><tr><th>Ver</th><th>Brief</th><th>Lock</th><th>โดย</th></tr>
        ${c.versions.map(v => `<tr><td>v${v.version}</td><td>${esc(v.brief_status)}</td><td>${v.locked ? '🔒 ' + esc((v.locked_at || '').slice(0, 10)) : '-'}</td><td>${esc(v.created_by)}</td></tr>`).join('')}</table></div>
      ${c.approvals.length ? `<div class="muted" style="margin-top:8px">การอนุมัติ</div><div class="scroll" style="max-height:100px"><table class="mini"><tr><th>Ver</th><th>ประเภท</th><th>ผล</th><th>ผู้อนุมัติ</th></tr>
        ${c.approvals.map(a => `<tr><td>v${a.version}</td><td>${esc(a.type)}</td><td>${esc(a.decision)}</td><td>${esc(a.approver)}</td></tr>`).join('')}</table></div>` : ''}
      <div id="c-audit"></div>
      <div class="modal-act" style="flex-wrap:wrap">${acts}<button class="btn ghost" id="c-close">ปิด</button></div>`);
    const q = s => bg.querySelector(s);
    q('#c-close').addEventListener('click', () => bg.remove());
    // audit (tmm/approver)
    if (['tmm', 'approver', 'admin'].includes(role())) {
      api('/api/audit-logs?entity=campaign&entity_id=' + encodeURIComponent(c.code)).then(logs => {
        if (!logs || !logs.length) return;
        q('#c-audit').innerHTML = `<div class="muted" style="margin-top:8px">ประวัติ (audit)</div><div class="im-errs" style="color:#475467;max-height:120px">${logs.map(l => `<div>${esc((l.at || '').slice(0, 16).replace('T', ' '))} · ${esc(l.action)}${l.old_value || l.new_value ? ': ' + esc(l.old_value) + '→' + esc(l.new_value) : ''} · ${esc(l.actor)}${l.reason ? ' ('+esc(l.reason)+')' : ''}</div>`).join('')}</div>`;
      });
    }
    // wire actions
    const doAct = async (path, body, okMsg) => {
      const r = await fetch('/api/campaigns/' + c.id + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const d = await r.json(); if (!r.ok) { toast(d.error || 'ทำรายการไม่สำเร็จ'); return; }
      toast(okMsg); bg.remove(); renderCampaigns();
    };
    q('#a-submit')?.addEventListener('click', () => doAct('/transition', { to: 'Pending Approval' }, 'ส่งขออนุมัติแล้ว'));
    q('#a-approve')?.addEventListener('click', () => doAct('/approve', { decision: 'Approved' }, 'อนุมัติแล้ว'));
    q('#a-reject')?.addEventListener('click', () => { const rs = prompt('เหตุผลที่ปฏิเสธ:') || ''; doAct('/approve', { decision: 'Rejected', conditions: rs }, 'ปฏิเสธแล้ว'); });
    q('#a-lock')?.addEventListener('click', () => doAct('/lock', {}, 'ล็อก Version แล้ว'));
    q('#a-launch')?.addEventListener('click', () => doAct('/transition', { to: 'Ready to Launch' }, 'พร้อม Launch'));
    q('#a-progress')?.addEventListener('click', () => doAct('/transition', { to: 'In Progress' }, 'เริ่มดำเนินการ'));
    q('#a-version')?.addEventListener('click', () => { const rs = prompt('เหตุผลการเปลี่ยนแปลง (Change Request):'); if (!rs) return; doAct('/versions', { reason: rs }, 'สร้างเวอร์ชันใหม่แล้ว'); });
  }

  function actionButtons(c) {
    const s = c.work_status, b = [];
    if (['Draft', 'Change Requested'].includes(s) && canTmm()) b.push('<button class="btn" id="a-submit">ส่งขออนุมัติ</button>');
    if (s === 'Pending Approval' && canApprove()) { b.push('<button class="btn" id="a-approve">✅ อนุมัติ</button>'); b.push('<button class="btn danger" id="a-reject">✕ ปฏิเสธ</button>'); }
    if (['Approved', 'Approved with Conditions'].includes(s) && canTmm()) b.push('<button class="btn" id="a-lock">🔒 ล็อก Version</button>');
    if (s === 'Locked' && canTmm()) { b.push('<button class="btn" id="a-launch">พร้อม Launch</button>'); b.push('<button class="btn ghost" id="a-version">✎ Change Request</button>'); }
    if (s === 'Ready to Launch' && (canTmm() || role() === 'area_manager')) b.push('<button class="btn" id="a-progress">เริ่มดำเนินการ</button>');
    return b.join('');
  }

  function modal(html) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal wide">' + html + '</div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    return bg;
  }
})();
