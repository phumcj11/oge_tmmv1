// Excel/CSV import (admin-only) for dealers / sellout / products.
// Registered from server.js:  require('./import')(app, db)
// Two-step: POST /api/import/:type (preview)  ->  POST /api/import/:type?commit=1 (apply).
// GET /api/import/:type/template downloads a blank .xlsx template.
const multer = require('multer');
const XLSX = require('xlsx');
const uploadXlsx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// canonical field -> accepted header variants (compared lowercased, spaces collapsed)
const ALIASES = {
  dealers: {
    code: ['code', 'รหัส', 'รหัสร้าน', 'dealer_code', 'dealer', 'รหัสดีลเลอร์'],
    name: ['name', 'ชื่อ', 'ชื่อร้าน', 'dealer_name', 'ชื่อดีลเลอร์'],
    tax: ['tax', 'เลขภาษี', 'taxid', 'tax_id', 'เลขผู้เสียภาษี'],
    province: ['province', 'จังหวัด'],
    address: ['address', 'ที่อยู่'],
    lat: ['lat', 'latitude', 'ละติจูด'],
    lon: ['lon', 'lng', 'longitude', 'ลองจิจูด'],
    phone: ['phone', 'เบอร์', 'โทร', 'โทรศัพท์', 'tel'],
    line: ['line', 'ไลน์', 'line_id'],
    tier: ['tier', 'ระดับ', 'เกรด'],
    sellin: ['sellin', 'sell-in', 'sell in', 'ยอดขายเข้า', 'ยอดเข้า', 'ซื้อเข้า'],
    retail: ['retail', 'ค้าปลีก', 'มูลค่าค้าปลีก'],
    profit: ['profit', 'กำไร'],
    units: ['units', 'จำนวน', 'จำนวนเครื่อง', 'คัน', 'เครื่อง'],
    po: ['po', 'จำนวนpo', 'ใบสั่งซื้อ'],
    outstanding: ['outstanding', 'ค้างชำระ', 'หนี้', 'ยอดค้าง'],
    sales_rep: ['sales_rep', 'sales rep', 'เซลล์', 'พนักงานขาย', 'ผู้ดูแล', 'sr'],
    credit: ['credit', 'เครดิต', 'วงเงิน'],
  },
  products: {
    model: ['model', 'รุ่น', 'โมเดล'],
    cost: ['cost', 'ต้นทุน'],
    price: ['price', 'ราคา', 'ราคาขาย'],
    margin: ['margin', 'มาร์จิ้น', 'กำไรขั้นต้น'],
    profit: ['profit', 'กำไร'],
    units: ['units', 'จำนวน', 'คัน'],
    sellin: ['sellin', 'sell-in', 'ยอดขายเข้า', 'ยอดเข้า'],
    dealer_profit: ['dealer_profit', 'dealer profit', 'กำไรดีลเลอร์', 'กำไรร้าน'],
  },
  sellout: {
    dealer_code: ['dealer_code', 'code', 'รหัส', 'รหัสร้าน', 'dealer'],
    ym: ['ym', 'เดือน', 'งวด', 'month', 'period', 'yearmonth'],
    model: ['model', 'รุ่น', 'โมเดล'],
    sold: ['sold', 'ขายออก', 'ยอดขาย', 'ขาย', 'จำนวนขาย'],
    stock: ['stock', 'คงเหลือ', 'สต็อก', 'สต๊อก', 'คงคลัง'],
    note: ['note', 'หมายเหตุ', 'remark'],
  },
};

// full column list per table (order used for INSERT of new rows)
const COLS = {
  dealers: ['code', 'name', 'tax', 'province', 'address', 'lat', 'lon', 'phone', 'line', 'tier',
    'sellin', 'retail', 'profit', 'units', 'po', 'outstanding', 'sales_rep', 'credit'],
  products: ['model', 'cost', 'price', 'margin', 'profit', 'units', 'sellin', 'dealer_profit'],
};
const NUMERIC = {
  dealers: ['lat', 'lon', 'sellin', 'retail', 'profit', 'units', 'po', 'outstanding'],
  products: ['cost', 'price', 'margin', 'profit', 'units', 'sellin', 'dealer_profit'],
  sellout: ['sold', 'stock'],
};

const TEMPLATE = {
  dealers: {
    headers: ['code', 'name', 'province', 'tier', 'phone', 'line', 'sales_rep', 'sellin', 'retail', 'profit', 'units', 'po', 'outstanding', 'credit'],
    example: ['V00200', 'ตัวอย่างร้าน', 'เชียงใหม่', 'A', '0812345678', '@shopline', 'ARM เหนือ', 1500000, 1800000, 300000, 120, 15, 50000, 'ปกติ'],
  },
  products: {
    headers: ['model', 'cost', 'price', 'margin', 'profit', 'units', 'sellin', 'dealer_profit'],
    example: ['Galaxy3', 40000, 52000, 12000, 8000, 300, 15600000, 3000],
  },
  sellout: {
    headers: ['dealer_code', 'ym', 'model', 'sold', 'stock', 'note'],
    example: ['V00016', '2026-08', 'Galaxy3', 12, 4, 'ตัวอย่าง'],
  },
};

const THMON = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };

function normYM(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 90000 && XLSX.SSF && XLSX.SSF.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) return d.y + '-' + String(d.m).padStart(2, '0');
  }
  let s = String(v).trim();
  for (const [th, m] of Object.entries(THMON)) {
    if (s.startsWith(th)) {
      let y = parseInt(s.replace(th, '').replace(/[^0-9]/g, ''), 10);
      if (!y) return null;
      if (y < 100) y += 2500;      // 69 -> 2569 (พ.ศ. สองหลัก)
      if (y > 2400) y -= 543;      // พ.ศ. -> ค.ศ.
      return y + '-' + String(m).padStart(2, '0');
    }
  }
  let mm = s.match(/^(\d{4})[-/.](\d{1,2})$/);   // 2026-08
  if (mm) return mm[1] + '-' + mm[2].padStart(2, '0');
  mm = s.match(/^(\d{1,2})[-/.](\d{4})$/);        // 08/2026
  if (mm) return mm[2] + '-' + mm[1].padStart(2, '0');
  mm = s.match(/^(\d{4})(\d{2})$/);               // 202608
  if (mm) return mm[1] + '-' + mm[2];
  return null;
}

function buildHeaderMap(type, rawHeaders) {
  const alias = ALIASES[type];
  const map = {};
  for (const raw of rawHeaders) {
    const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
    for (const [canon, variants] of Object.entries(alias)) {
      if (variants.includes(key)) { map[raw] = canon; break; }
    }
  }
  return map;
}

function num(v) { const n = +String(v).replace(/,/g, '').trim(); return Number.isFinite(n) ? n : 0; }

module.exports = function (app, db) {
  const requireAdmin = (req, res, next) =>
    (req.user && req.user.role === 'admin') ? next() : res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (admin)' });

  // ---- template download ----
  app.get('/api/import/:type/template', requireAdmin, (req, res) => {
    const t = req.params.type;
    if (!TEMPLATE[t]) return res.status(404).json({ error: 'ชนิดข้อมูลไม่ถูกต้อง' });
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE[t].headers, TEMPLATE[t].example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="template-' + t + '.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });

  // ---- import: preview (default) or commit (?commit=1) ----
  app.post('/api/import/:type', requireAdmin, uploadXlsx.single('file'), (req, res) => {
    const type = req.params.type;
    if (!ALIASES[type]) return res.status(400).json({ error: 'ชนิดข้อมูลไม่ถูกต้อง' });
    if (!req.file) return res.status(400).json({ error: 'ไม่พบไฟล์' });
    const commit = req.query.commit === '1';

    let rows;
    try {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return res.status(400).json({ error: 'ไฟล์ว่างหรือไม่มีชีต' });
      rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    } catch (e) {
      return res.status(400).json({ error: 'อ่านไฟล์ไม่ได้: ' + e.message });
    }
    if (!rows.length) return res.status(400).json({ error: 'ไม่มีข้อมูลในไฟล์' });

    const hmap = buildHeaderMap(type, Object.keys(rows[0]));
    if (!Object.keys(hmap).length) return res.status(400).json({ error: 'ไม่พบคอลัมน์ที่รู้จัก — ลองดาวน์โหลด template' });

    const dealerName = db.prepare('SELECT name FROM dealers WHERE code=?');
    const exq = {
      dealers: db.prepare('SELECT 1 FROM dealers WHERE code=?'),
      products: db.prepare('SELECT 1 FROM products WHERE model=?'),
      sellout: db.prepare('SELECT 1 FROM sellout WHERE dealer_code=? AND ym=? AND model=?'),
    }[type];

    const errors = [];
    const valid = [];
    const seen = new Set();

    rows.forEach((raw, i) => {
      const rowno = i + 2; // +1 header, +1 to 1-based
      const o = {};
      for (const [rh, canon] of Object.entries(hmap)) o[canon] = raw[rh];

      if (type === 'dealers') {
        const code = String(o.code == null ? '' : o.code).trim();
        const name = String(o.name == null ? '' : o.name).trim();
        if (!code) { errors.push({ row: rowno, msg: 'ไม่มีรหัสร้าน (code)' }); return; }
        if (seen.has(code)) { errors.push({ row: rowno, msg: 'รหัสซ้ำในไฟล์: ' + code }); return; }
        seen.add(code);
        const exists = !!exq.get(code);
        if (!exists && !name) { errors.push({ row: rowno, msg: 'ร้านใหม่ต้องมีชื่อ (name)' }); return; }
        valid.push({ data: o, id: code, exists });
      } else if (type === 'products') {
        const model = String(o.model == null ? '' : o.model).trim();
        if (!model) { errors.push({ row: rowno, msg: 'ไม่มีรุ่น (model)' }); return; }
        if (seen.has(model)) { errors.push({ row: rowno, msg: 'รุ่นซ้ำในไฟล์: ' + model }); return; }
        seen.add(model);
        valid.push({ data: o, id: model, exists: !!exq.get(model) });
      } else { // sellout
        const dc = String(o.dealer_code == null ? '' : o.dealer_code).trim();
        const model = String(o.model == null ? '' : o.model).trim();
        const ym = normYM(o.ym);
        if (!dc || o.ym === '' || o.ym == null || !model) { errors.push({ row: rowno, msg: 'ต้องมี dealer_code, เดือน(ym), รุ่น(model)' }); return; }
        if (!ym) { errors.push({ row: rowno, msg: 'รูปแบบเดือนไม่ถูกต้อง: ' + o.ym }); return; }
        if (!dealerName.get(dc)) { errors.push({ row: rowno, msg: 'ไม่พบ dealer: ' + dc }); return; }
        const k = dc + '|' + ym + '|' + model;
        if (seen.has(k)) { errors.push({ row: rowno, msg: 'ซ้ำในไฟล์: ' + k }); return; }
        seen.add(k);
        valid.push({ data: { ...o, dealer_code: dc, ym, model }, exists: !!exq.get(dc, ym, model) });
      }
    });

    const willInsert = valid.filter(v => !v.exists).length;
    const willUpdate = valid.filter(v => v.exists).length;

    if (!commit) {
      return res.json({
        ok: true, type, mode: 'preview', total: rows.length,
        willInsert, willUpdate, errorCount: errors.length,
        errors: errors.slice(0, 25), sample: valid.slice(0, 5).map(v => v.data),
      });
    }

    // ---- COMMIT ----
    const now = new Date().toISOString();
    const NUM = NUMERIC[type];
    let inserted = 0, updated = 0;

    const apply = db.transaction(() => {
      for (const v of valid) {
        const o = v.data;
        if (type === 'sellout') {
          const nm = (dealerName.get(o.dealer_code) || {}).name || o.dealer_code;
          db.prepare(`INSERT INTO sellout (dealer_code,dealer_name,ym,model,sold,stock,note,updated_at)
            VALUES (@dealer_code,@dealer_name,@ym,@model,@sold,@stock,@note,@updated_at)
            ON CONFLICT(dealer_code,ym,model) DO UPDATE SET sold=@sold, stock=@stock, note=@note, updated_at=@updated_at`)
            .run({ dealer_code: o.dealer_code, dealer_name: nm, ym: o.ym, model: o.model,
              sold: num(o.sold), stock: num(o.stock), note: String(o.note == null ? '' : o.note), updated_at: now });
        } else {
          const idcol = type === 'dealers' ? 'code' : 'model';
          if (!v.exists) {
            const vals = {};
            for (const c of COLS[type]) {
              const raw = o[c];
              const empty = (raw === '' || raw == null);
              vals[c] = empty ? (NUM.includes(c) ? 0 : '') : (NUM.includes(c) ? num(raw) : String(raw));
            }
            vals[idcol] = v.id;
            db.prepare('INSERT INTO ' + type + ' (' + COLS[type].join(',') + ') VALUES (' + COLS[type].map(c => '@' + c).join(',') + ')').run(vals);
          } else {
            const cols = [], vals = {};
            for (const c of COLS[type]) {
              if (c === idcol) continue;
              const raw = o[c];
              if (raw === '' || raw == null) continue; // keep existing value
              cols.push(c);
              vals[c] = NUM.includes(c) ? num(raw) : String(raw);
            }
            if (cols.length) {
              vals[idcol] = v.id;
              db.prepare('UPDATE ' + type + ' SET ' + cols.map(c => c + '=@' + c).join(',') + ' WHERE ' + idcol + '=@' + idcol).run(vals);
            }
          }
        }
        v.exists ? updated++ : inserted++;
      }
    });

    try { apply(); }
    catch (e) { return res.status(500).json({ error: 'บันทึกไม่สำเร็จ: ' + e.message }); }

    res.json({ ok: true, type, mode: 'commit', inserted, updated, errorCount: errors.length, errors: errors.slice(0, 25) });
  });
};
