// Ofero TMM System — frontend
const $ = s => document.querySelector(s);
const baht = n => (Math.round(n || 0)).toLocaleString('en-US');
let currentUser = null;
const api = (u, opt) => fetch(u, opt).then(async r => {
  if (r.status === 401) { location.href = '/login.html'; return new Promise(() => {}); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok && d.error) toast(d.error);
  return d;
});
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const del = u => api(u, { method: 'DELETE' });
function exportCSV(filename, cols, rows) {
  const head = cols.map(c => c.label).join(',');
  const body = rows.map(r => cols.map(c => {
    let v = r[c.key] ?? '';
    v = String(v).replace(/"/g, '""');
    return /[",\n]/.test(v) ? `"${v}"` : v;
  }).join(',')).join('\n');
  const blob = new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

// ---- tabs ----
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $('#' + b.dataset.t).classList.remove('hidden');
  render(b.dataset.t);
}));

function bars(items, valf, fmt, max) {
  const m = max || Math.max(...items.map(i => valf(i))) || 1;
  return items.map(i => `<div class="bar-row"><div class="bar-lbl" title="${esc(i.label)}">${esc(i.label)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(100*valf(i)/m).toFixed(1)}%;${i.color?'background:'+i.color:''}"></div></div>
    <div class="bar-val">${fmt(valf(i))}</div></div>`).join('');
}

// ================= DASHBOARD =================
async function renderDashboard() {
  const d = await api('/api/overview');
  const t = d.tot;
  const el = $('#dashboard');
  const THM={1:'ม.ค.',2:'ก.พ.',3:'มี.ค.',4:'เม.ย.',5:'พ.ค.',6:'มิ.ย.',7:'ก.ค.',8:'ส.ค.',9:'ก.ย.',10:'ต.ค.',11:'พ.ย.',12:'ธ.ค.'};
  const ml = k => { const [y,m]=k.split('-'); return THM[+m]+' '+((+y)%100+43); };
  const months = Object.entries(d.month).sort();
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">Sell-in รวม</div><div class="v">${baht(t.sellin)}</div><div class="s">บาท · ${t.po} PO</div></div>
    <div class="kpi"><div class="l">มูลค่าค้าปลีก</div><div class="v" style="color:#00897B">${baht(t.retail)}</div><div class="s">ราคาขายปลีกรวม</div></div>
    <div class="kpi"><div class="l">กำไร Dealer รวม</div><div class="v" style="color:#6A1B9A">${baht(t.profit)}</div><div class="s">ทั้งเครือข่าย</div></div>
    <div class="kpi"><div class="l">ค้างชำระ</div><div class="v" style="color:#e53935">${baht(t.outstanding)}</div><div class="s">รอเก็บ</div></div>
    <div class="kpi"><div class="l">เครื่องรวม</div><div class="v">${baht(t.units)}</div><div class="s">คัน</div></div>
    <div class="kpi"><div class="l">Dealer ที่ขาย</div><div class="v">${t.active_dealers}</div><div class="s">จาก ${t.dealers}</div></div>
  </div>
  <div class="card"><h2>💰 Sell-in ตามรุ่นสินค้า</h2>
    ${bars(d.products.map(p=>({label:p.model,v:p.sellin,color:'#1565C0'})),i=>i.v,v=>baht(v)+' ฿')}</div>
  <div class="grid2">
    <div class="card"><h2>🗺️ Sell-in ตามภาค (แผนที่)</h2>
      <div class="mapwrap"><div id="thmap" class="thmap"></div>
      <div class="reglg">${bars(Object.entries(d.region).map(([k,v])=>({label:k,v,color:regColor(k)})).sort((a,b)=>b.v-a.v),i=>i.v,v=>baht(v)+' ฿')}</div></div></div>
    <div class="card"><h2>📈 Sell-in รายเดือน</h2>
      ${bars(months.map(([k,v])=>({label:ml(k),v,color:'#6A1B9A'})),i=>i.v,v=>baht(v)+' ฿')}</div>
  </div>
  <div class="grid2">
    <div class="card scroll"><h2>🏆 Top Dealer (Sell-in)</h2>
      <table><tr><th>Dealer</th><th>จังหวัด</th><th class="num">Sell-in</th><th class="num">PO</th></tr>
      ${d.topDealers.map(x=>`<tr><td>${esc(x.name)}<small class="sub">${x.code}</small></td><td>${esc(x.province)}</td><td class="num">${baht(x.sellin)}</td><td class="num">${x.po}</td></tr>`).join('')}</table></div>
    <div class="card scroll"><h2>⚠️ ลูกหนี้ค้างชำระ</h2>
      <table><tr><th>Dealer</th><th>จังหวัด</th><th class="num">ค้างชำระ</th></tr>
      ${d.debtors.map(x=>`<tr><td>${esc(x.name)}<small class="sub">${x.code}</small></td><td>${esc(x.province)}</td><td class="num" style="color:#e53935">${baht(x.outstanding)}</td></tr>`).join('')}</table></div>
  </div>`;
  loadMap(d.region);
}
const RID = { 'กลาง':'klang','อีสาน':'isan','เหนือ':'nuea','กรุงเทพ ปริมณฑล':'bkk','ใต้':'tai' };
function regColor(k){ return {klang:'#1565C0',isan:'#00897B',nuea:'#6A1B9A',bkk:'#F9A825',tai:'#C62828'}[RID[k]]||'#1565C0'; }
async function loadMap(region) {
  const host = $('#thmap'); if (!host) return;
  try {
    const svg = await fetch('thailand.svg').then(r => r.text());
    host.innerHTML = svg;
    const byRid = {}; Object.entries(region).forEach(([k,v]) => byRid[RID[k]] = v);
    const max = Math.max(1, ...Object.values(byRid));
    host.querySelectorAll('path[data-region]').forEach(p => {
      const v = byRid[p.getAttribute('data-region')] || 0;
      p.setAttribute('fill-opacity', (0.25 + 0.7 * v / max).toFixed(2));
    });
  } catch(e) { host.innerHTML = '<div class="muted">โหลดแผนที่ไม่ได้</div>'; }
}

// ================= DEALERS =================
let dealerCache = [];
async function renderDealers() {
  dealerCache = await api('/api/dealers');
  const el = $('#dealers');
  el.innerHTML = `
  <div class="card">
    <div class="toolbar">
      <input class="grow" id="dsearch" placeholder="🔍 ค้นหาชื่อ / รหัส / จังหวัด...">
      <select id="dtier"><option value="">ทุก Tier</option><option>A</option><option>B</option><option>C</option></select>
      <span class="muted" id="dcount"></span>
      <span class="spacer"></span>
      <button class="btn ghost" id="dadd">➕ เพิ่ม Dealer</button>
      <button class="btn ghost" id="dexport">⬇ Export CSV</button>
    </div>
    <div class="scroll"><table id="dtable"></table></div>
  </div>`;
  $('#dsearch').addEventListener('input', drawDealers);
  $('#dtier').addEventListener('change', drawDealers);
  $('#dexport').addEventListener('click', () => exportCSV('dealers.csv',
    [{key:'code',label:'รหัส'},{key:'name',label:'ชื่อ'},{key:'province',label:'จังหวัด'},
     {key:'tier',label:'Tier'},{key:'phone',label:'เบอร์'},{key:'line',label:'LINE'},
     {key:'sellin',label:'Sell-in'},{key:'po',label:'PO'},{key:'outstanding',label:'ค้างชำระ'}], dealerCache));
  $('#dadd').addEventListener('click', async () => {
    const code = prompt('รหัส Dealer (เช่น V00200):'); if (!code) return;
    const name = prompt('ชื่อ Dealer:'); if (!name) return;
    const province = prompt('จังหวัด:') || '';
    const r = await api('/api/dealers', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, name, province }) });
    if (r.error) return toast('ผิดพลาด: ' + r.error);
    toast('เพิ่ม ' + code + ' แล้ว'); renderDealers();
  });
  drawDealers();
}
function drawDealers() {
  const q = ($('#dsearch').value || '').toLowerCase();
  const tf = $('#dtier').value;
  const rows = dealerCache.filter(d =>
    (!tf || d.tier === tf) &&
    (!q || (d.name+d.code+d.province).toLowerCase().includes(q)));
  $('#dcount').textContent = rows.length + ' ราย';
  $('#dtable').innerHTML =
    `<tr><th>รหัส</th><th>Dealer</th><th>จังหวัด</th><th class="num">Sell-in</th><th class="num">PO</th>
      <th>Tier</th><th>เบอร์โทร</th><th>LINE</th><th></th></tr>` +
    rows.map(d => `<tr data-code="${d.code}">
      <td>${d.code}</td><td>${esc(d.name)}</td><td>${esc(d.province)||'-'}</td>
      <td class="num">${baht(d.sellin)}</td><td class="num">${d.po}</td>
      <td><select class="cell f-tier"><option value="">-</option>
        ${['A','B','C'].map(t=>`<option ${d.tier===t?'selected':''}>${t}</option>`).join('')}</select></td>
      <td><input class="cell f-phone" value="${esc(d.phone)}" placeholder="เบอร์"></td>
      <td><input class="cell f-line" value="${esc(d.line)}" placeholder="LINE ID"></td>
      <td style="white-space:nowrap"><button class="btn sm f-save">บันทึก</button>
        <button class="btn sm del danger f-del">ลบ</button></td></tr>`).join('');
  $('#dtable').querySelectorAll('.f-save').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr'); const code = tr.dataset.code;
    const body = { phone: tr.querySelector('.f-phone').value, line: tr.querySelector('.f-line').value, tier: tr.querySelector('.f-tier').value };
    const upd = await api('/api/dealers/' + code, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = dealerCache.findIndex(x => x.code === code); dealerCache[i] = upd;
    toast('บันทึก ' + code + ' แล้ว');
  }));
  $('#dtable').querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr'); const code = tr.dataset.code;
    if (!confirm('ลบ Dealer ' + code + ' ?')) return;
    await del('/api/dealers/' + code);
    dealerCache = dealerCache.filter(x => x.code !== code);
    toast('ลบ ' + code + ' แล้ว'); drawDealers();
  }));
}

// ================= EVENTS (aligned to Lark "กิจกรรม ARM" form) =================
let eventCache = [], eventProducts = [];
const EV_TYPE = { activation:'กิจกรรมหน้าร้าน', training:'อบรม', testride:'ทดลองขับ', other:'อื่นๆ' };
const EV_DEPT = ['Branding', 'Back Office'];
const EV_STATUS = { planned:'วางแผน', confirmed:'ยืนยันแล้ว', done:'จัดเสร็จ', cancelled:'ยกเลิก' };
const achv = (a, t) => t > 0 ? Math.round(100 * a / t) : 0;
const achvColor = p => p >= 100 ? '#2e7d32' : p >= 60 ? '#ef6c00' : '#e53935';

async function renderEvents() {
  const [ev, ov, dl] = await Promise.all([api('/api/events'), api('/api/overview'), api('/api/dealers')]);
  eventCache = ev; eventProducts = ov.products.map(p => p.model); dealerCache = dl;
  const el = $('#events');
  const sum = (k) => eventCache.reduce((s, e) => s + (+e[k] || 0), 0);
  const tgt = { sellout: sum('target_sellout'), lead: sum('target_lead'), test: sum('target_testride'), train: sum('target_training') };
  const act = { sellout: sum('sales_units'), lead: sum('leads'), test: sum('test_ride'), train: sum('act_training') };
  const kpi = (label, a, t, unit) => `<div class="kpi"><div class="l">${label}</div><div class="v" style="color:${achvColor(achv(a,t))}">${a}<span style="font-size:14px;color:#98a2b3">/${t}</span></div><div class="s">${achv(a,t)}% ของเป้า · ${unit}</div></div>`;
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">กิจกรรมทั้งหมด</div><div class="v">${eventCache.length}</div><div class="s">${eventCache.filter(e=>e.status==='done').length} จัดเสร็จ</div></div>
    ${kpi('Sell-out (เป้า vs ผล)', act.sellout, tgt.sellout, 'คัน')}
    ${kpi('Lead (เป้า vs ผล)', act.lead, tgt.lead, 'ราย')}
    ${kpi('Test Ride (เป้า vs ผล)', act.test, tgt.test, 'คน')}
    ${kpi('Training (เป้า vs ผล)', act.train, tgt.train, 'คน')}
  </div>
  <div class="card"><div class="toolbar"><h2 style="margin:0">🎪 กิจกรรม ARM</h2><span class="muted">เก็บข้อมูลตามฟอร์ม Lark + ติดตามเป้า vs ผล</span>
    <span class="spacer"></span>
    <button class="btn editor-only" id="enew">➕ กิจกรรมใหม่</button>
    <button class="btn ghost" id="eexport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="etable">
      <tr><th>กิจกรรม</th><th>ร้าน/สาขา</th><th>ประเภท</th><th>ระดับ</th><th>วันที่</th><th>สถานะ</th>
        <th class="num">Sell-out</th><th class="num">Lead</th><th class="num">Test</th><th class="num">Train</th><th></th></tr>
      ${eventCache.length ? eventCache.map(e => {
        const cell = (a, t) => `<td class="num" title="ผล/เป้า">${a||0}<small style="color:#98a2b3">/${t||0}</small></td>`;
        return `<tr data-id="${e.id}">
        <td><b>${esc(e.activity_name || '(ไม่มีชื่อ)')}</b><small class="sub">${esc(e.dept||'')}${e.owner?' · '+esc(e.owner):''}</small></td>
        <td>${esc(e.dealer_name || e.company || '-')}<small class="sub">${esc(e.branch||e.province||'')}</small></td>
        <td><span class="badge b-reuse">${EV_TYPE[e.type]||e.type||'-'}</span></td>
        <td>${e.tier?`<span class="tierb tier-${e.tier}">${e.tier}</span>`:'-'}</td>
        <td><small>${esc(e.start_date||e.event_date||'')}</small></td>
        <td><span class="badge ${e.status==='done'?'b-avail':e.status==='cancelled'?'b-out':'b-reuse'}">${EV_STATUS[e.status]||e.status}</span></td>
        ${cell(e.sales_units, e.target_sellout)}${cell(e.leads, e.target_lead)}${cell(e.test_ride, e.target_testride)}${cell(e.act_training, e.target_training)}
        <td style="white-space:nowrap"><button class="btn sm f-edit">${currentUser.role==='viewer'?'ดู':'แก้ไข'}</button>
          ${currentUser.role==='viewer'?'':'<button class="btn sm del danger f-del">ลบ</button>'}</td></tr>`;
      }).join('') : '<tr><td colspan="11" class="muted">ยังไม่มีกิจกรรม — กด “กิจกรรมใหม่”</td></tr>'}
    </table></div></div>`;
  const enew = $('#enew');
  if (enew) enew.addEventListener('click', () => openEventEditor(null));
  $('#eexport').addEventListener('click', () => exportCSV('events.csv',
    [{key:'activity_name',label:'กิจกรรม'},{key:'dept',label:'แผนก'},{key:'dealer_name',label:'ร้าน'},{key:'branch',label:'สาขา'},
     {key:'type',label:'ประเภท'},{key:'tier',label:'ระดับ'},{key:'start_date',label:'เริ่ม'},{key:'end_date',label:'สิ้นสุด'},{key:'status',label:'สถานะ'},
     {key:'budget',label:'งบ'},{key:'target_sellout',label:'เป้าSellout'},{key:'sales_units',label:'ผลSellout'},
     {key:'target_lead',label:'เป้าLead'},{key:'leads',label:'ผลLead'},{key:'target_testride',label:'เป้าTest'},{key:'test_ride',label:'ผลTest'},
     {key:'target_training',label:'เป้าTrain'},{key:'act_training',label:'ผลTrain'}], eventCache));
  $('#etable').querySelectorAll('.f-edit').forEach(b => b.addEventListener('click', e =>
    openEventEditor(eventCache.find(x => x.id == e.target.closest('tr').dataset.id))));
  $('#etable').querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('ลบกิจกรรมนี้?')) return;
    await del('/api/events/' + id); toast('ลบแล้ว'); renderEvents();
  }));
}

let evBudget = [], evStock = [];
function openEventEditor(ev) {
  const readonly = currentUser.role === 'viewer';
  ev = ev || {};
  evBudget = Array.isArray(ev.budget_lines) ? [...ev.budget_lines] : [];
  evStock = Array.isArray(ev.stock_prep) ? [...ev.stock_prep] : [];
  const el = $('#events');
  const opt = (arr, v) => arr.map(x => `<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');
  const dealerOpts = (dealerCache && dealerCache.length ? dealerCache : []).map(d => `<option value="${esc(d.code)}" ${ev.dealer_code===d.code?'selected':''}>${esc(d.name)} (${esc(d.code)})</option>`).join('');
  const g = (id, label, val, type='text', ph='') => `<div class="fg"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val??'')}" placeholder="${ph}" ${readonly?'disabled':''}></div>`;
  const sel = (id, label, options, val) => `<div class="fg"><label>${label}</label><select id="${id}" ${readonly?'disabled':''}><option value="">-</option>${opt(options, val)}</select></div>`;
  el.innerHTML = `
  <div class="card"><div class="toolbar"><h2 style="margin:0">${ev.id?'✏️ แก้ไขกิจกรรม':'➕ กิจกรรมใหม่'}</h2><span class="spacer"></span>
    <button class="btn ghost" id="ecancel">← กลับ</button>${readonly?'':'<button class="btn" id="esave">💾 บันทึก</button>'}</div>

    <h3 class="sec">รายละเอียด</h3>
    <div class="fgrid">
      ${sel('e_dept','แผนกผู้ส่งคำขอ',EV_DEPT,ev.dept)}
      ${g('e_activity','ชื่อกิจกรรม',ev.activity_name,'text','เช่น Test Ride Day @เชียงใหม่')}
      <div class="fg"><label>ร้านค้า (Dealer)</label><select id="e_dealer" ${readonly?'disabled':''}><option value="">- เลือก -</option>${dealerOpts}</select></div>
      ${g('e_company','ชื่อบริษัท',ev.company)}
      ${g('e_branch','ชื่อสาขา',ev.branch)}
      ${g('e_customer','ชื่อลูกค้า',ev.customer_name)}
      ${g('e_phone','เบอร์โทรลูกค้า',ev.customer_phone)}
    </div>

    <h3 class="sec">เวลา & ประเภท</h3>
    <div class="fgrid">
      ${g('e_start','เวลาเริ่มต้น',ev.start_date,'date')}
      ${g('e_end','เวลาสิ้นสุด',ev.end_date,'date')}
      ${g('e_dur','ระยะเวลา (วัน)',ev.duration_days||1,'number')}
      ${sel('e_type','ประเภทกิจกรรม',Object.keys(EV_TYPE).map(k=>k),ev.type)}
      <div class="fg"><label>ระดับร้าน</label><select id="e_tier" ${readonly?'disabled':''}><option value="">-</option><option value="A" ${ev.tier==='A'?'selected':''}>A</option><option value="B" ${ev.tier==='B'?'selected':''}>B</option></select></div>
      ${g('e_goal','เป้าหมายหลัก',ev.goal)}
      ${sel('e_status','สถานะ',Object.keys(EV_STATUS),ev.status||'planned')}
      ${g('e_owner','ผู้รับผิดชอบหลัก',ev.owner)}
      ${g('e_support','ทีมสนับสนุน',ev.support_team)}
    </div>

    <h3 class="sec">🎯 เป้าหมาย vs ผลจริง</h3>
    <div class="scroll"><table class="mini">
      <tr><th></th><th class="num">Sell-out (คัน)</th><th class="num">Lead (ราย)</th><th class="num">Test Ride (คน)</th><th class="num">Training (คน)</th></tr>
      <tr><td><b>เป้าหมาย</b></td>
        <td><input id="t_sellout" type="number" value="${ev.target_sellout||0}" ${readonly?'disabled':''}></td>
        <td><input id="t_lead" type="number" value="${ev.target_lead||0}" ${readonly?'disabled':''}></td>
        <td><input id="t_test" type="number" value="${ev.target_testride||0}" ${readonly?'disabled':''}></td>
        <td><input id="t_train" type="number" value="${ev.target_training||0}" ${readonly?'disabled':''}></td></tr>
      <tr><td><b>ผลจริง</b></td>
        <td><input id="a_sellout" type="number" value="${ev.sales_units||0}" ${readonly?'disabled':''}></td>
        <td><input id="a_lead" type="number" value="${ev.leads||0}" ${readonly?'disabled':''}></td>
        <td><input id="a_test" type="number" value="${ev.test_ride||0}" ${readonly?'disabled':''}></td>
        <td><input id="a_train" type="number" value="${ev.act_training||0}" ${readonly?'disabled':''}></td></tr>
    </table></div>

    <h3 class="sec">💰 งบประมาณ</h3>
    <div id="budgetBox"></div>
    <div class="fgrid" style="margin-top:10px">${g('e_bank','ธนาคารสำหรับโอนเงิน',ev.bank)}${g('e_acct','บัญชีธนาคาร',ev.bank_account)}</div>

    <h3 class="sec">📦 สต็อกที่เตรียมไว้</h3>
    <div id="stockBox"></div>
  </div>`;
  drawBudget(readonly); drawStock(readonly);
  $('#ecancel').addEventListener('click', renderEvents);
  const save = $('#esave');
  if (save) save.addEventListener('click', () => saveEvent(ev.id));
}
function drawBudget(readonly) {
  const box = $('#budgetBox'); if (!box) return;
  const total = evBudget.reduce((s, l) => s + (+l.amount || 0), 0);
  box.innerHTML = `<table class="mini"><tr><th>ประเภท</th><th>จำนวนเงิน</th><th>หมายเหตุ</th><th></th></tr>
    ${evBudget.map((l, i) => `<tr>
      <td><input data-i="${i}" data-k="type" class="bl" value="${esc(l.type||'')}" ${readonly?'disabled':''}></td>
      <td><input data-i="${i}" data-k="amount" class="bl" type="number" value="${l.amount||0}" ${readonly?'disabled':''}></td>
      <td><input data-i="${i}" data-k="note" class="bl" value="${esc(l.note||'')}" ${readonly?'disabled':''}></td>
      <td>${readonly?'':`<button class="btn sm del danger" data-del="${i}">ลบ</button>`}</td></tr>`).join('')}
    <tr><td colspan="4">${readonly?'':'<button class="btn sm ghost" id="baddline">➕ เพิ่มรายการงบ</button>'} <b style="float:right">รวม: ${baht(total)} บาท</b></td></tr>
  </table>`;
  box.querySelectorAll('.bl').forEach(inp => inp.addEventListener('input', e => {
    const { i, k } = e.target.dataset; evBudget[i][k] = e.target.value; if (k === 'amount') drawBudget(readonly);
  }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => { evBudget.splice(+e.target.dataset.del, 1); drawBudget(readonly); }));
  const add = $('#baddline'); if (add) add.addEventListener('click', () => { evBudget.push({ type:'', amount:0, note:'' }); drawBudget(readonly); });
}
function drawStock(readonly) {
  const box = $('#stockBox'); if (!box) return;
  const modelOpt = v => eventProducts.map(m => `<option value="${m}" ${v===m?'selected':''}>${m}</option>`).join('');
  box.innerHTML = `<table class="mini"><tr><th>สินค้า</th><th>สี</th><th>จำนวน (คัน)</th><th></th></tr>
    ${evStock.map((s, i) => `<tr>
      <td><select data-i="${i}" data-k="model" class="sl" ${readonly?'disabled':''}><option value="">-</option>${modelOpt(s.model)}</select></td>
      <td><input data-i="${i}" data-k="color" class="sl" value="${esc(s.color||'')}" placeholder="สี" ${readonly?'disabled':''}></td>
      <td><input data-i="${i}" data-k="qty" class="sl" type="number" value="${s.qty||0}" ${readonly?'disabled':''}></td>
      <td>${readonly?'':`<button class="btn sm del danger" data-del="${i}">ลบ</button>`}</td></tr>`).join('')}
    <tr><td colspan="4">${readonly?'':'<button class="btn sm ghost" id="saddline">➕ เพิ่มสต็อก</button>'}</td></tr>
  </table>`;
  box.querySelectorAll('.sl').forEach(inp => inp.addEventListener('input', e => { const { i, k } = e.target.dataset; evStock[i][k] = e.target.value; }));
  box.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', e => { evStock.splice(+e.target.dataset.del, 1); drawStock(readonly); }));
  const add = $('#saddline'); if (add) add.addEventListener('click', () => { evStock.push({ model:'', color:'', qty:0 }); drawStock(readonly); });
}
async function saveEvent(id) {
  const dcode = $('#e_dealer').value;
  const dname = dcode && dealerCache ? (dealerCache.find(d => d.code === dcode)||{}).name : '';
  const body = {
    dept: $('#e_dept').value, activity_name: $('#e_activity').value,
    dealer_code: dcode, dealer_name: dname, company: $('#e_company').value, branch: $('#e_branch').value,
    customer_name: $('#e_customer').value, customer_phone: $('#e_phone').value,
    start_date: $('#e_start').value, end_date: $('#e_end').value, duration_days: +$('#e_dur').value,
    type: $('#e_type').value, tier: $('#e_tier').value, goal: $('#e_goal').value, status: $('#e_status').value,
    owner: $('#e_owner').value, support_team: $('#e_support').value,
    target_sellout:+$('#t_sellout').value, target_lead:+$('#t_lead').value, target_testride:+$('#t_test').value, target_training:+$('#t_train').value,
    sales_units:+$('#a_sellout').value, leads:+$('#a_lead').value, test_ride:+$('#a_test').value, act_training:+$('#a_train').value,
    bank: $('#e_bank').value, bank_account: $('#e_acct').value,
    budget_lines: evBudget, stock_prep: evStock,
  };
  const d = id
    ? await api('/api/events/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    : await api('/api/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (d.id) { toast('บันทึกกิจกรรมแล้ว'); renderEvents(); }
}


// ================= POSM =================
let posmCache = [];
let eventOptions = [];
async function renderPosm() {
  [posmCache, eventOptions] = await Promise.all([api('/api/posm'), api('/api/events')]);
  const el = $('#posm');
  const reuse = posmCache.filter(p=>p.type==='ใช้ซ้ำ').length;
  const out = posmCache.filter(p=>p.status==='out').length;
  const low = posmCache.filter(p=>p.low).length;
  const overdue = posmCache.filter(p=>p.overdue).length;
  const assetValue = posmCache.reduce((s,p)=>s + (p.qty||0)*(p.unit_value||0), 0);
  const alerts = [];
  posmCache.filter(p=>p.low).forEach(p=>alerts.push(`⚠️ <b>${esc(p.name)}</b> เหลือ ${p.qty} (ขั้นต่ำ ${p.min_stock}) — ควรสั่งเพิ่ม`));
  posmCache.filter(p=>p.overdue).forEach(p=>alerts.push(`⏰ <b>${esc(p.name)}</b> เกินกำหนดคืน (${p.open_move?.due_date||''}) ที่ ${esc(p.location)}`));
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">รายการ POSM</div><div class="v">${posmCache.length}</div><div class="s">${reuse} ใช้ซ้ำ</div></div>
    <div class="kpi"><div class="l">ถูกเบิกออก</div><div class="v" style="color:#ef6c00">${out}</div><div class="s">รายการ</div></div>
    <div class="kpi"><div class="l">⚠️ ของใกล้หมด</div><div class="v" style="color:${low?'#e53935':'#2e7d32'}">${low}</div><div class="s">ต่ำกว่าขั้นต่ำ</div></div>
    <div class="kpi"><div class="l">⏰ เกินกำหนดคืน</div><div class="v" style="color:${overdue?'#e53935':'#2e7d32'}">${overdue}</div><div class="s">รายการ</div></div>
    <div class="kpi"><div class="l">มูลค่าสินทรัพย์</div><div class="v">${baht(assetValue)}</div><div class="s">บาท</div></div>
  </div>
  ${alerts.length ? `<div class="card" style="border-left:4px solid #e53935"><b>แจ้งเตือน</b><div style="margin-top:8px;font-size:13px;line-height:1.9">${alerts.join('<br>')}</div></div>`:''}
  <div class="card">
    <div class="toolbar"><h2 style="margin:0">📦 คลัง POSM</h2><span class="muted">เบิก-คืน · ชุดมาตรฐาน A/B (ตามแผน) · แจ้งเตือนสต็อก</span>
      <span class="spacer"></span>
      ${currentUser && currentUser.role==='admin' ? '<button class="btn ghost" id="ploadstd">📥 โหลดชุดมาตรฐานตามแผน</button>' : ''}
      <button class="btn ghost" id="padd">➕ เพิ่มรายการ</button>
      <button class="btn ghost" id="pexport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="ptable"></table></div></div>
  <div id="phist"></div>`;
  const loadstd = $('#ploadstd');
  if (loadstd) loadstd.addEventListener('click', async () => {
    if (!confirm('โหลดชุดสื่อมาตรฐานตามแผน Boss (ตาราง 15) เข้าคลัง? รายการที่มีอยู่จะอัปเดตค่ามาตรฐาน A/B')) return;
    const d = await api('/api/posm/load-standard', { method: 'POST' });
    if (d.ok) { toast('โหลดชุดมาตรฐาน ' + d.added + ' รายการแล้ว'); renderPosm(); }
  });
  $('#pexport').addEventListener('click', () => exportCSV('posm.csv',
    [{key:'code',label:'รหัส'},{key:'name',label:'รายการ'},{key:'type',label:'ประเภท'},
     {key:'qty',label:'จำนวน'},{key:'std_a',label:'มาตรฐาน A'},{key:'std_b',label:'มาตรฐาน B'},
     {key:'min_stock',label:'ขั้นต่ำ'},{key:'unit_value',label:'มูลค่า/ชิ้น'},
     {key:'condition',label:'สภาพ'},{key:'location',label:'ที่อยู่'},{key:'status',label:'สถานะ'}], posmCache));
  $('#padd').addEventListener('click', async () => {
    const code = prompt('รหัส (เช่น PM-08):'); if (!code) return;
    const name = prompt('ชื่อรายการ:'); if (!name) return;
    const type = (prompt('ประเภท (ใช้ซ้ำ / สิ้นเปลือง):', 'ใช้ซ้ำ') || 'ใช้ซ้ำ');
    const qty = +(prompt('จำนวน:', '1') || 0);
    const min_stock = type==='สิ้นเปลือง' ? +(prompt('สต็อกขั้นต่ำ (แจ้งเตือนเมื่อต่ำกว่า):','0')||0) : 0;
    await api('/api/posm', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, name, type, qty, min_stock }) });
    toast('เพิ่ม ' + code + ' แล้ว'); renderPosm();
  });
  drawPosm();
}
function drawPosm() {
  $('#ptable').innerHTML =
    `<tr><th>รหัส</th><th>รายการ</th><th>ประเภท</th><th class="num">จำนวน</th>
      <th class="num" title="มาตรฐานร้าน A">มฐ.A</th><th class="num" title="มาตรฐานร้าน B">มฐ.B</th>
      <th class="num">ขั้นต่ำ</th><th class="num">มูลค่า</th><th>สภาพ</th><th>ที่อยู่ปัจจุบัน</th><th>สถานะ</th><th>จัดการ</th></tr>` +
    posmCache.map(p => {
      const rowStyle = p.low ? 'background:#fff5f5' : (p.overdue ? 'background:#fff8f0' : '');
      const stBadge = p.status==='out' ? `<span class="badge b-out">เบิกออก</span>`
        : p.status==='repair' ? `<span class="badge b-out">ซ่อม</span>` : `<span class="badge b-avail">ในคลัง</span>`;
      const moveInfo = p.status==='out' && p.open_move
        ? `<small class="sub">→ ${esc(p.location)}${p.open_move.due_date?' · คืน '+esc(p.open_move.due_date):''}${p.open_move.person?' · '+esc(p.open_move.person):''}${p.overdue?' ⏰เกินกำหนด':''}</small>` : '';
      const actionBtn = p.status==='out'
        ? `<button class="btn sm b-return" style="background:#00897b;color:#fff">คืน</button>`
        : `<button class="btn sm b-checkout">เบิก</button>`;
      return `<tr data-code="${p.code}" style="${rowStyle}">
        <td>${p.code}</td><td>${esc(p.name)}${moveInfo}</td>
        <td><span class="badge ${p.type==='ใช้ซ้ำ'?'b-reuse':'b-cons'}">${esc(p.type)}</span></td>
        <td class="num"><input class="cell f-qty" style="width:56px" type="number" value="${p.qty}"></td>
        <td class="num"><input class="cell f-stda" style="width:46px" type="number" value="${p.std_a||0}"></td>
        <td class="num"><input class="cell f-stdb" style="width:46px" type="number" value="${p.std_b||0}"></td>
        <td class="num"><input class="cell f-min" style="width:50px" type="number" value="${p.min_stock||0}">${p.low?' ⚠️':''}</td>
        <td class="num"><input class="cell f-val" style="width:56px" type="number" value="${p.unit_value||0}"></td>
        <td><input class="cell f-cond" style="width:70px" value="${esc(p.condition)}"></td>
        <td>${esc(p.location)}</td>
        <td>${stBadge}</td>
        <td style="white-space:nowrap">${actionBtn}
          <button class="btn sm f-save">บันทึก</button>
          <button class="btn sm ghost f-hist">ประวัติ</button>
          <button class="btn sm del danger f-del">ลบ</button></td></tr>`;
    }).join('');
  const P = code => posmCache.find(x=>x.code===code);
  $('#ptable').querySelectorAll('.f-save').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr'); const code = tr.dataset.code;
    const body = { qty:+tr.querySelector('.f-qty').value, min_stock:+tr.querySelector('.f-min').value,
      unit_value:+tr.querySelector('.f-val').value, condition:tr.querySelector('.f-cond').value,
      std_a:+tr.querySelector('.f-stda').value, std_b:+tr.querySelector('.f-stdb').value };
    await api('/api/posm/' + code, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    toast('บันทึก ' + code + ' แล้ว'); renderPosm();
  }));
  $('#ptable').querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const code = e.target.closest('tr').dataset.code;
    if (!confirm('ลบ ' + code + ' ?')) return;
    await del('/api/posm/' + code); toast('ลบ ' + code + ' แล้ว'); renderPosm();
  }));
  $('#ptable').querySelectorAll('.b-checkout').forEach(b => b.addEventListener('click', e =>
    openCheckout(e.target.closest('tr').dataset.code)));
  $('#ptable').querySelectorAll('.b-return').forEach(b => b.addEventListener('click', async e => {
    const code = e.target.closest('tr').dataset.code;
    if (!confirm('รับคืน ' + code + ' เข้าคลัง?')) return;
    await api('/api/posm/' + code + '/checkin', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    toast('รับคืน ' + code + ' แล้ว'); renderPosm();
  }));
  $('#ptable').querySelectorAll('.f-hist').forEach(b => b.addEventListener('click', e =>
    showHistory(e.target.closest('tr').dataset.code)));
}
function openCheckout(code) {
  const p = posmCache.find(x=>x.code===code);
  const evOpts = eventOptions.map(e=>`<option value="${e.id}">W${e.week} · ${esc(e.dealer_name)} (${esc(e.province)}) · ${esc(e.event_date)}</option>`).join('');
  const m = document.createElement('div'); m.className='modal-bg';
  m.innerHTML = `<div class="modal">
    <h3>เบิก POSM — ${esc(p.name)} <small>(${code})</small></h3>
    <label>ไปงาน (Event)</label>
    <select id="co-ev"><option value="">— ไม่ผูกงาน —</option>${evOpts}</select>
    <label>จำนวนที่เบิก</label><input id="co-qty" type="number" value="1" min="1">
    <label>กำหนดคืน (YYYY-MM-DD)</label><input id="co-due" type="date">
    <label>ผู้รับผิดชอบ</label><input id="co-person" placeholder="ชื่อผู้เบิก">
    <label>หมายเหตุ</label><input id="co-note" placeholder="(ถ้ามี)">
    <div class="modal-act"><button class="btn ghost" id="co-cancel">ยกเลิก</button><button class="btn" id="co-ok">เบิกออก</button></div>
  </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', e => { if (e.target===m) close(); });
  $('#co-cancel').addEventListener('click', close);
  $('#co-ok').addEventListener('click', async () => {
    const body = { event_id: $('#co-ev').value ? +$('#co-ev').value : null,
      qty:+$('#co-qty').value, due_date:$('#co-due').value, person:$('#co-person').value, note:$('#co-note').value };
    await api('/api/posm/' + code + '/checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    close(); toast('เบิก ' + code + ' แล้ว'); renderPosm();
  });
}
async function showHistory(code) {
  const moves = await api('/api/posm/' + code + '/moves');
  const p = posmCache.find(x=>x.code===code);
  const host = $('#phist');
  host.innerHTML = `<div class="card"><div class="toolbar"><h2 style="margin:0">🧾 ประวัติเบิก-คืน — ${esc(p.name)} (${code})</h2>
    <span class="spacer"></span><button class="btn sm ghost" id="hist-close">ปิด</button></div>
    <div class="scroll"><table><tr><th>เบิกออก</th><th>ไปที่ / งาน</th><th class="num">จำนวน</th><th>กำหนดคืน</th><th>คืนจริง</th><th>ผู้รับผิดชอบ</th><th>หมายเหตุ</th></tr>
    ${moves.length ? moves.map(mv=>`<tr><td>${esc(mv.date_out)}</td>
      <td>${esc(mv.dest)}${mv.dealer_name?'':''}</td><td class="num">${mv.qty}</td>
      <td>${esc(mv.due_date)||'-'}</td><td>${mv.date_back?esc(mv.date_back):'<span style="color:#ef6c00">ยังไม่คืน</span>'}</td>
      <td>${esc(mv.person)||'-'}</td><td>${esc(mv.note)||'-'}</td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">ยังไม่มีประวัติ</td></tr>'}</table></div></div>`;
  $('#hist-close').addEventListener('click', ()=>host.innerHTML='');
  host.scrollIntoView({ behavior:'smooth' });
}

function render(t) {
  if (t === 'dashboard') renderDashboard();
  else if (t === 'dealers') renderDealers();
  else if (t === 'events') renderEvents();
  else if (t === 'posm') renderPosm();
  else if (t === 'sellout') renderSellout();
  else if (t === 'audit') renderAudit();
  else if (t === 'users') renderUsers();
}

// ================= STORE AUDIT (มาตรฐานร้าน) =================
let auditMonth = null;
async function renderAudit() {
  const el = $('#audit');
  const [items, dealers, allSum] = await Promise.all([api('/api/audit/items'), api('/api/dealers'), api('/api/audit/summary')]);
  if (!auditMonth) auditMonth = (allSum.months && allSum.months[0]) || new Date().toISOString().slice(0, 7);
  const [sum, rows] = await Promise.all([api('/api/audit/summary?month=' + auditMonth), api('/api/audit?month=' + auditMonth)]);
  const f = sum.funnel || {};
  const dealerOpts = dealers.map(d => `<option value="${esc(d.code)}">${esc(d.name)} (${esc(d.code)})</option>`).join('');
  const funnelStep = (label, val, color) => `<div class="fn-step"><div class="fn-val" style="color:${color}">${(val||0).toLocaleString()}</div><div class="fn-lbl">${label}</div></div>`;
  const tierBadge = t => `<span class="tierb tier-${t}">${t}</span>`;
  el.innerHTML = `
  <div class="toolbar" style="margin-bottom:14px">
    <b>เดือน:</b> <input type="month" id="auMonth" value="${auditMonth}">
    <span class="muted">ประเมินมาตรฐานร้าน (A/B) + funnel: สอบถาม → ทดลองขับ → เสนอราคา → ปิดการขาย</span>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">ร้านที่ประเมิน</div><div class="v">${sum.count||0}</div><div class="s">A: ${(sum.byTier||[]).find(t=>t.tier==='A')?.count||0} · B: ${(sum.byTier||[]).find(t=>t.tier==='B')?.count||0}</div></div>
    <div class="kpi"><div class="l">ความพร้อมเฉลี่ย</div><div class="v" style="color:${sum.avgReadiness>=80?'#2e7d32':'#ef6c00'}">${sum.avgReadiness||0}%</div><div class="s">ตามมาตรฐาน</div></div>
    <div class="kpi"><div class="l">Conversion</div><div class="v" style="color:#1565C0">${sum.conversion||0}%</div><div class="s">ปิดการขาย ÷ สอบถาม</div></div>
    <div class="kpi"><div class="l">Test Ride</div><div class="v">${(f.testRide||0).toLocaleString()}</div><div class="s">ครั้ง</div></div>
  </div>
  <div class="card"><h2>🔻 Funnel รวม (เดือน ${auditMonth})</h2>
    <div class="funnel">${funnelStep('สอบถาม (Lead)',f.lead,'#1565C0')}<span class="fn-arrow">→</span>${funnelStep('ทดลองขับ',f.testRide,'#00897B')}<span class="fn-arrow">→</span>${funnelStep('เสนอราคา',f.quote,'#6A1B9A')}<span class="fn-arrow">→</span>${funnelStep('ปิดการขาย',f.sold,'#2e7d32')}</div></div>
  <div class="card editor-only"><h2>➕ ประเมินร้าน / บันทึก funnel</h2>
    <div class="soform">
      <div><label>Dealer</label><select id="auDealer">${dealerOpts}</select></div>
      <div><label>ระดับร้าน</label><select id="auTier"><option value="A">A (SR)</option><option value="B" selected>B</option></select></div>
    </div>
    <div style="margin:12px 0"><label style="font-size:12px;color:#667085">เช็กลิสต์มาตรฐาน (ติ๊กที่ผ่าน)</label>
      <div class="chklist">${items.map(i=>`<label class="chk"><input type="checkbox" class="au-chk" data-k="${i.k}"> ${esc(i.label)}</label>`).join('')}</div></div>
    <div class="soform">
      <div><label>สอบถาม (Lead)</label><input id="auLead" type="number" min="0" value="0"></div>
      <div><label>ทดลองขับ</label><input id="auTest" type="number" min="0" value="0"></div>
      <div><label>เสนอราคา</label><input id="auQuote" type="number" min="0" value="0"></div>
      <div><label>ปิดการขาย</label><input id="auSold" type="number" min="0" value="0"></div>
      <div class="grow"><label>หมายเหตุ</label><input id="auNote" placeholder="(ถ้ามี)"></div>
      <div><label>&nbsp;</label><button class="btn" id="auSave">บันทึก</button></div>
    </div>
    <div class="muted" style="margin-top:6px">* บันทึกซ้ำ Dealer+เดือนเดิม = อัปเดตทับ · ระดับร้านจะ sync ไปที่ทะเบียน Dealer</div>
  </div>
  <div class="card"><div class="toolbar"><h2 style="margin:0">รายการประเมิน (${rows.length})</h2><span class="spacer"></span>
    <button class="btn ghost" id="auExport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="auTable">
      <tr><th>ร้าน</th><th>ระดับ</th><th>ความพร้อม</th><th class="num">Lead</th><th class="num">Test</th><th class="num">เสนอราคา</th><th class="num">ปิด</th><th class="num">Conv.</th><th></th></tr>
      ${rows.length ? rows.map(r => `<tr data-id="${r.id}">
        <td>${esc(r.dealer_name)}<small class="sub">${esc(r.dealer_code)}</small></td>
        <td>${tierBadge(r.tier)}</td>
        <td><div class="rbar"><div style="width:${r.readiness}%;background:${r.readiness>=80?'#2e7d32':r.readiness>=50?'#ef6c00':'#e53935'}"></div></div><small>${r.readiness}%</small></td>
        <td class="num">${r.lead}</td><td class="num">${r.test_ride}</td><td class="num">${r.quote}</td><td class="num">${r.sold}</td>
        <td class="num"><b>${r.conversion}%</b></td>
        <td><button class="btn sm del danger f-del">ลบ</button></td></tr>`).join('')
      : '<tr><td colspan="9" class="muted">ยังไม่มีการประเมินเดือนนี้ — เพิ่มด้านบน</td></tr>'}
    </table></div></div>`;
  $('#auMonth').addEventListener('change', e => { auditMonth = e.target.value; renderAudit(); });
  $('#auExport').addEventListener('click', () => exportCSV('store_audit_' + auditMonth + '.csv',
    [{key:'dealer_code',label:'รหัส'},{key:'dealer_name',label:'ร้าน'},{key:'tier',label:'ระดับ'},{key:'readiness',label:'ความพร้อม%'},
     {key:'lead',label:'Lead'},{key:'test_ride',label:'TestRide'},{key:'quote',label:'เสนอราคา'},{key:'sold',label:'ปิด'},{key:'conversion',label:'Conv%'}], rows));
  const save = $('#auSave');
  if (save) save.addEventListener('click', async () => {
    const checklist = {};
    document.querySelectorAll('.au-chk').forEach(c => { if (c.checked) checklist[c.dataset.k] = true; });
    const body = { dealer_code: $('#auDealer').value, tier: $('#auTier').value, ym: auditMonth, checklist,
      lead: +$('#auLead').value, test_ride: +$('#auTest').value, quote: +$('#auQuote').value, sold: +$('#auSold').value, note: $('#auNote').value };
    const d = await api('/api/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d.id) { toast('บันทึกการประเมินแล้ว'); renderAudit(); }
  });
  el.querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('ลบการประเมินนี้?')) return;
    const d = await del('/api/audit/' + id);
    if (d.ok) { toast('ลบแล้ว'); renderAudit(); }
  }));
}

// ================= SELL-OUT & STOCK =================
let selloutMonth = null;
async function renderSellout() {
  const el = $('#sellout');
  const [dealers, ov, allSum] = await Promise.all([api('/api/dealers'), api('/api/overview'), api('/api/sellout/summary')]);
  const models = ov.products.map(p => p.model);
  if (!selloutMonth) selloutMonth = (allSum.months && allSum.months[0]) || new Date().toISOString().slice(0, 7);
  const [sum, rows] = await Promise.all([api('/api/sellout/summary?month=' + selloutMonth), api('/api/sellout?month=' + selloutMonth)]);
  const t = sum.tot || {};
  const dealerOpts = dealers.map(d => `<option value="${esc(d.code)}">${esc(d.name)} (${esc(d.code)})</option>`).join('');
  const modelOpts = models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  const modelBars = sum.byModel && sum.byModel.length
    ? bars(sum.byModel.map(m => ({ label: m.model, v: m.sold || 0, color: '#00897B' })), i => i.v, v => v.toLocaleString() + ' คัน')
    : '<div class="muted">ยังไม่มีข้อมูลเดือนนี้</div>';
  el.innerHTML = `
  <div class="toolbar" style="margin-bottom:14px">
    <b>เดือน:</b> <input type="month" id="soMonth" value="${selloutMonth}">
    <span class="muted">Sell-out = จำนวนที่ Dealer ขายออกให้ลูกค้าจริง · Stock = คงเหลือที่ร้าน</span>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="l">ขายออกเดือนนี้</div><div class="v" style="color:#00897B">${(t.sold||0).toLocaleString()}</div><div class="s">คัน</div></div>
    <div class="kpi"><div class="l">สต็อกคงเหลือรวม</div><div class="v" style="color:#ef6c00">${(t.stock||0).toLocaleString()}</div><div class="s">คัน (ที่ Dealer)</div></div>
    <div class="kpi"><div class="l">Dealer ที่รายงาน</div><div class="v">${t.dealers||0}</div><div class="s">ราย</div></div>
  </div>
  <div class="card editor-only"><h2>➕ บันทึก Sell-out / สต็อก</h2>
    <div class="soform">
      <div><label>Dealer</label><select id="soDealer">${dealerOpts}</select></div>
      <div><label>รุ่นสินค้า</label><select id="soModel">${modelOpts}</select></div>
      <div><label>ขายออก (คัน)</label><input id="soSold" type="number" min="0" value="0"></div>
      <div><label>สต็อกคงเหลือ (คัน)</label><input id="soStock" type="number" min="0" value="0"></div>
      <div class="grow"><label>หมายเหตุ</label><input id="soNote" placeholder="(ถ้ามี)"></div>
      <div><label>&nbsp;</label><button class="btn" id="soSave">บันทึก</button></div>
    </div>
    <div class="muted" style="margin-top:6px">* บันทึกซ้ำ Dealer+รุ่น+เดือนเดิม = อัปเดตทับ</div>
  </div>
  <div class="card"><div class="toolbar"><h2 style="margin:0">📦 ขายออกตามรุ่น (เดือน ${selloutMonth})</h2></div>${modelBars}</div>
  <div class="card"><div class="toolbar"><h2 style="margin:0">รายการที่บันทึก (${rows.length})</h2><span class="spacer"></span>
    <button class="btn ghost" id="soExport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="soTable">
      <tr><th>Dealer</th><th>รุ่น</th><th class="num">ขายออก</th><th class="num">สต็อก</th><th>หมายเหตุ</th><th>อัปเดต</th><th></th></tr>
      ${rows.length ? rows.map(r => `<tr data-id="${r.id}">
        <td>${esc(r.dealer_name)}<small class="sub">${esc(r.dealer_code)}</small></td>
        <td>${esc(r.model)}</td><td class="num">${(r.sold||0).toLocaleString()}</td>
        <td class="num">${(r.stock||0).toLocaleString()}</td><td>${esc(r.note)||'-'}</td>
        <td><small class="sub">${esc((r.updated_at||'').slice(0,10))}</small></td>
        <td><button class="btn sm del danger f-del">ลบ</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">ยังไม่มีข้อมูลเดือนนี้ — เพิ่มด้านบน</td></tr>'}
    </table></div></div>`;
  $('#soMonth').addEventListener('change', e => { selloutMonth = e.target.value; renderSellout(); });
  $('#soExport').addEventListener('click', () => exportCSV('sellout_' + selloutMonth + '.csv',
    [{key:'dealer_code',label:'รหัส'},{key:'dealer_name',label:'Dealer'},{key:'ym',label:'เดือน'},
     {key:'model',label:'รุ่น'},{key:'sold',label:'ขายออก'},{key:'stock',label:'สต็อก'},{key:'note',label:'หมายเหตุ'}], rows));
  const save = $('#soSave');
  if (save) save.addEventListener('click', async () => {
    const body = { dealer_code: $('#soDealer').value, model: $('#soModel').value, ym: selloutMonth,
      sold: +$('#soSold').value, stock: +$('#soStock').value, note: $('#soNote').value };
    const d = await api('/api/sellout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (d.id) { toast('บันทึกแล้ว'); renderSellout(); }
  });
  el.querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('ลบรายการนี้?')) return;
    const d = await del('/api/sellout/' + id);
    if (d.ok) { toast('ลบแล้ว'); renderSellout(); }
  }));
}

// ================= AUTH / USER =================
function renderUserbox() {
  const roleTxt = { admin: 'ผู้ดูแลระบบ', editor: 'แก้ไขได้', viewer: 'ดูอย่างเดียว' }[currentUser.role] || currentUser.role;
  $('#userbox').innerHTML = `<span class="uname">${esc(currentUser.name)} <small>· ${roleTxt}</small></span>
    <button class="btn sm ghost" id="pwBtn">เปลี่ยนรหัส</button>
    <button class="btn sm ghost" id="logoutBtn">ออกจากระบบ</button>`;
  $('#logoutBtn').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; });
  $('#pwBtn').addEventListener('click', () => {
    const cur = prompt('รหัสผ่านเดิม:'); if (cur === null) return;
    const nw = prompt('รหัสผ่านใหม่ (อย่างน้อย 6 ตัว):'); if (nw === null) return;
    api('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: cur, next: nw }) })
      .then(d => { if (d.ok) toast('เปลี่ยนรหัสผ่านแล้ว'); });
  });
}
async function renderUsers() {
  if (currentUser.role !== 'admin') { $('#users').innerHTML = '<div class="card muted">เฉพาะผู้ดูแลระบบ</div>'; return; }
  const users = await api('/api/users');
  const roles = ['admin', 'editor', 'viewer'];
  const roleTxt = { admin: 'ผู้ดูแลระบบ', editor: 'แก้ไขได้', viewer: 'ดูอย่างเดียว' };
  $('#users').innerHTML = `
  <div class="card">
    <div class="toolbar"><h2 style="margin:0">👤 จัดการผู้ใช้ & สิทธิ์</h2>
      <span class="muted">admin = จัดการทุกอย่าง · editor = แก้ข้อมูลได้ · viewer = ดูอย่างเดียว</span>
      <span class="spacer"></span><button class="btn ghost" id="uadd">➕ เพิ่มผู้ใช้</button></div>
    <div class="scroll"><table id="utable">
      <tr><th>ชื่อผู้ใช้</th><th>ชื่อ</th><th>สิทธิ์</th><th>สร้างเมื่อ</th><th>จัดการ</th></tr>
      ${users.map(u => `<tr data-u="${esc(u.username)}">
        <td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td>
        <td><select class="cell f-role">${roles.map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${roleTxt[r]}</option>`).join('')}</select></td>
        <td><small class="sub">${esc((u.created_at || '').slice(0, 10))}</small></td>
        <td style="white-space:nowrap">
          <button class="btn sm f-save">บันทึก</button>
          <button class="btn sm ghost f-pw">ตั้งรหัสใหม่</button>
          ${u.username === currentUser.username ? '' : '<button class="btn sm del danger f-del">ลบ</button>'}
        </td></tr>`).join('')}
    </table></div></div>`;
  $('#uadd').addEventListener('click', async () => {
    const username = prompt('ชื่อผู้ใช้ (username):'); if (!username) return;
    const name = prompt('ชื่อ-นามสกุล:') || username;
    const role = (prompt('สิทธิ์ (admin / editor / viewer):', 'viewer') || 'viewer').trim();
    const password = prompt('รหัสผ่านเริ่มต้น (อย่างน้อย 6 ตัว):'); if (!password) return;
    const d = await api('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, name, role, password }) });
    if (d.username) { toast('เพิ่มผู้ใช้ ' + d.username); renderUsers(); }
  });
  $('#utable').querySelectorAll('.f-save').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr'); const username = tr.dataset.u;
    const d = await api('/api/users/' + encodeURIComponent(username), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: tr.querySelector('.f-role').value }) });
    if (d.username) toast('บันทึกสิทธิ์ ' + username);
  }));
  $('#utable').querySelectorAll('.f-pw').forEach(b => b.addEventListener('click', async e => {
    const username = e.target.closest('tr').dataset.u;
    const pw = prompt('รหัสผ่านใหม่ของ ' + username + ' (อย่างน้อย 6 ตัว):'); if (!pw) return;
    const d = await api('/api/users/' + encodeURIComponent(username), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (d.username) toast('ตั้งรหัสใหม่ให้ ' + username + ' แล้ว');
  }));
  $('#utable').querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const username = e.target.closest('tr').dataset.u;
    if (!confirm('ลบผู้ใช้ ' + username + ' ?')) return;
    const d = await del('/api/users/' + encodeURIComponent(username));
    if (d.ok) { toast('ลบ ' + username + ' แล้ว'); renderUsers(); }
  }));
}
async function init() {
  let me;
  try { const r = await fetch('/api/me'); if (!r.ok) { location.href = '/login.html'; return; } me = await r.json(); }
  catch (_) { location.href = '/login.html'; return; }
  currentUser = me;
  document.body.classList.toggle('role-viewer', me.role === 'viewer');
  if (me.role === 'admin') $('#usersTab').style.display = '';
  renderUserbox();
  render('dashboard');
}
init();
