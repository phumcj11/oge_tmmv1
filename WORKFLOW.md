# Ofero TMM — Workflow การพัฒนา & Deploy

> การ์ดอ้างอิงประจำโปรเจกต์นี้ (VPS มีหลายโปรเจกต์ — เอกสารนี้ระบุเฉพาะ ofero-tmm)

## 📌 ข้อมูลโปรเจกต์ (จำไว้)

| อะไร | ค่า |
|------|-----|
| โฟลเดอร์ในเครื่อง | `D:\Works\Ofero\tmm-system` |
| GitHub repo | https://github.com/phumcj11/oge_tmmv1 (private) |
| โฟลเดอร์บน VPS | `/home/pcj/tmm` |
| ชื่อ pm2 app | **`ofero-tmm`** |
| พอร์ต | **4173** (127.0.0.1) |
| โดเมน | https://oge.k-mkt.com |
| VPS | `ssh root@119.59.102.235` |

> **โปรเจกต์อื่นบน VPS** (ห้ามไปแตะ): `mkttools-backend`, `mkttools-frontend` (พอร์ต 3000/3220 ฯลฯ)

---

## 🔄 วงจรพัฒนา (ทำซ้ำได้ตลอด)

```
แก้โค้ดในเครื่อง → เทสต์ localhost → push GitHub → SSH เข้า VPS → bash deploy.sh
```

### 1) แก้โค้ด + เทสต์ในเครื่อง
```bash
cd "D:/Works/Ofero/tmm-system"
npm start
# เปิด http://localhost:4173 ดูให้โอเคก่อน
```

### 2) push ขึ้น GitHub
```bash
cd "D:/Works/Ofero/tmm-system"
git add -A
git commit -m "อธิบายสั้น ๆ ว่าแก้อะไร"
git push
```

### 3) deploy ขึ้น VPS (แค่นี้จบ)
```bash
ssh root@119.59.102.235
bash ~/tmm/deploy.sh
```
`deploy.sh` จะ: `git pull` → `npm install` → `pm2 restart ofero-tmm` → โชว์ log
**แตะเฉพาะ ofero-tmm — ไม่กระทบ mkttools หรือเว็บอื่น**

---

## ⚠️ กฎความปลอดภัย (เพราะ VPS มีหลายโปรเจกต์)

- ✅ ใช้ `pm2 restart ofero-tmm` — **อย่าใช้** `pm2 restart all` / `pm2 kill`
- ✅ ทำงานในโฟลเดอร์ `/home/pcj/tmm` เท่านั้น
- ✅ ไม่ยุ่งกับ Apache / config ของ DirectAdmin (proxy โดเมนตั้งเสร็จแล้ว)
- ✅ พอร์ต 4173 เป็นของโปรเจกต์นี้ — โปรเจกต์อื่นใช้พอร์ตอื่น

## 🔎 คำสั่งตรวจสอบที่ใช้บ่อย
```bash
pm2 status                       # ดูทุกแอป (ต้องเห็น ofero-tmm = online)
pm2 logs ofero-tmm --lines 30    # ดู log เฉพาะแอปนี้
curl -s http://127.0.0.1:4173/api/overview | head -c 120   # เทสต์แอปตรง ๆ
```

## 🗄️ กรณีแก้โครงสร้างฐานข้อมูล (db.js)
- ไฟล์ข้อมูลจริง = `/home/pcj/tmm/tmm.db` (ไม่อยู่ใน git — ปลอดภัย)
- ถ้าเพิ่มตาราง/คอลัมน์: `db.js` มี migration เช็คบางส่วนแล้ว (เช่น posm min_stock/unit_value)
- ถ้าเพิ่มของใหม่ที่ต้อง migrate — เพิ่มโค้ด `ALTER TABLE ... IF NOT EXISTS` ใน `initDb()` แล้ว deploy ปกติ
- **ห้าม** ลบ `tmm.db` บน VPS (ข้อมูลจริงจะหาย) — `npm run seed` ใช้เฉพาะตอนติดตั้งครั้งแรก

## 🔙 ย้อนกลับเวอร์ชัน (ถ้า deploy แล้วมีปัญหา)
```bash
cd /home/pcj/tmm
git log --oneline -5        # หา commit ก่อนหน้า
git reset --hard <commit>   # ย้อนโค้ด
pm2 restart ofero-tmm
```
