// Ofero TMM System — frontend
const $ = s => document.querySelector(s);
const baht = n => (Math.round(n || 0)).toLocaleString('en-US');
const api = (u, opt) => fetch(u, opt).then(r => r.json());
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
function esc(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const del = u => fetch(u, { method: 'DELETE' }).then(r => r.json());
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

// ================= EVENTS =================
let eventCache = [];
async function renderEvents() {
  eventCache = await api('/api/events');
  const el = $('#events');
  const totBudget = eventCache.reduce((s,e)=>s+e.budget,0);
  const done = eventCache.filter(e=>e.status==='done').length;
  const leads = eventCache.reduce((s,e)=>s+e.leads,0);
  const sales = eventCache.reduce((s,e)=>s+e.sales_units,0);
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="l">Event ทั้งหมด</div><div class="v">${eventCache.length}</div><div class="s">${done} จัดแล้ว</div></div>
    <div class="kpi"><div class="l">งบรวม</div><div class="v">${baht(totBudget)}</div><div class="s">บาท</div></div>
    <div class="kpi"><div class="l">Lead รวม</div><div class="v" style="color:#00897B">${leads}</div><div class="s">ราย</div></div>
    <div class="kpi"><div class="l">ปิดการขาย</div><div class="v" style="color:#6A1B9A">${sales}</div><div class="s">คัน</div></div>
  </div>
  <div class="card">
    <div class="toolbar"><h2 style="margin:0">🎪 ตารางจัด Event</h2><span class="muted">แก้สถานะ/กรอกผลได้</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="eadd">➕ เพิ่ม Event</button>
      <button class="btn ghost" id="eexport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="etable"></table></div></div>`;
  $('#eexport').addEventListener('click', () => exportCSV('events.csv',
    [{key:'week',label:'สัปดาห์'},{key:'event_date',label:'วันที่'},{key:'dealer_code',label:'รหัส'},
     {key:'dealer_name',label:'สาขา'},{key:'province',label:'จังหวัด'},{key:'phase',label:'ระยะ'},
     {key:'status',label:'สถานะ'},{key:'budget',label:'งบ'},{key:'leads',label:'Lead'},{key:'sales_units',label:'ขาย(คัน)'}], eventCache));
  $('#eadd').addEventListener('click', async () => {
    const dealer_name = prompt('ชื่อสาขา:'); if (!dealer_name) return;
    const province = prompt('จังหวัด:') || '';
    const week = +(prompt('สัปดาห์ (1-12):') || 0);
    const event_date = prompt('วันที่ (เช่น 5 ต.ค. 69):') || '';
    const r = await api('/api/events', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dealer_name, province, week, event_date, phase:'ขยายผล' }) });
    toast('เพิ่ม Event แล้ว'); renderEvents();
  });
  drawEvents();
}
function drawEvents() {
  const st = ['planned','confirmed','done','cancelled'];
  const stLabel = {planned:'วางแผน',confirmed:'ยืนยันแล้ว',done:'จัดเสร็จ',cancelled:'ยกเลิก'};
  $('#etable').innerHTML =
    `<tr><th>W</th><th>วันที่</th><th>สาขา</th><th>จังหวัด</th><th>ระยะ</th><th class="num">งบ</th>
      <th>สถานะ</th><th class="num">Lead</th><th class="num">ขาย(คัน)</th><th></th></tr>` +
    eventCache.map(e => `<tr data-id="${e.id}">
      <td>W${e.week}</td><td>${esc(e.event_date)}</td>
      <td>${esc(e.dealer_name)}<small class="sub">${e.dealer_code}</small></td>
      <td>${esc(e.province)}</td>
      <td><span class="badge ${e.phase==='นำร่อง'?'b-out':'b-reuse'}">${esc(e.phase)}</span></td>
      <td class="num">${baht(e.budget)}</td>
      <td><select class="cell f-st">${st.map(s=>`<option value="${s}" ${e.status===s?'selected':''}>${stLabel[s]}</option>`).join('')}</select></td>
      <td class="num"><input class="cell f-lead" style="width:60px" type="number" min="0" value="${e.leads}"></td>
      <td class="num"><input class="cell f-sales" style="width:60px" type="number" min="0" value="${e.sales_units}"></td>
      <td style="white-space:nowrap"><button class="btn sm f-save">บันทึก</button>
        <button class="btn sm del danger f-del">ลบ</button></td></tr>`).join('');
  $('#etable').querySelectorAll('.f-save').forEach(b => b.addEventListener('click', async e => {
    const tr = e.target.closest('tr'); const id = tr.dataset.id;
    const body = { status: tr.querySelector('.f-st').value,
      leads: +tr.querySelector('.f-lead').value, sales_units: +tr.querySelector('.f-sales').value };
    const upd = await api('/api/events/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const i = eventCache.findIndex(x => x.id == id); eventCache[i] = upd;
    toast('บันทึก Event แล้ว'); renderEvents();
  }));
  $('#etable').querySelectorAll('.f-del').forEach(b => b.addEventListener('click', async e => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('ลบ Event นี้?')) return;
    await del('/api/events/' + id); toast('ลบแล้ว'); renderEvents();
  }));
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
    <div class="toolbar"><h2 style="margin:0">📦 คลัง POSM</h2><span class="muted">เบิก-คืน / ผูกกับ Event / แจ้งเตือนสต็อก</span>
      <span class="spacer"></span>
      <button class="btn ghost" id="padd">➕ เพิ่มรายการ</button>
      <button class="btn ghost" id="pexport">⬇ Export CSV</button></div>
    <div class="scroll"><table id="ptable"></table></div></div>
  <div id="phist"></div>`;
  $('#pexport').addEventListener('click', () => exportCSV('posm.csv',
    [{key:'code',label:'รหัส'},{key:'name',label:'รายการ'},{key:'type',label:'ประเภท'},
     {key:'qty',label:'จำนวน'},{key:'min_stock',label:'ขั้นต่ำ'},{key:'unit_value',label:'มูลค่า/ชิ้น'},
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
    `<tr><th>รหัส</th><th>รายการ</th><th>ประเภท</th><th class="num">จำนวน</th><th class="num">ขั้นต่ำ</th>
      <th class="num">มูลค่า/ชิ้น</th><th>สภาพ</th><th>ที่อยู่ปัจจุบัน</th><th>สถานะ</th><th>จัดการ</th></tr>` +
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
        <td class="num"><input class="cell f-qty" style="width:64px" type="number" value="${p.qty}"></td>
        <td class="num"><input class="cell f-min" style="width:56px" type="number" value="${p.min_stock||0}">${p.low?' ⚠️':''}</td>
        <td class="num"><input class="cell f-val" style="width:64px" type="number" value="${p.unit_value||0}"></td>
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
      unit_value:+tr.querySelector('.f-val').value, condition:tr.querySelector('.f-cond').value };
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
}
render('dashboard');
