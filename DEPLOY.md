# คู่มือ Deploy ขึ้น VPS (ให้ทีมใช้ร่วมกัน)

ระบบนี้เป็น Node.js + Express + SQLite รันบน VPS ได้เลย ไม่ต้องแก้โค้ด
(SQLite เพียงพอสำหรับผู้ใช้ไม่กี่คน — ถ้าคนเยอะ/เขียนพร้อมกันมาก ค่อยย้ายไป PostgreSQL)

## 1) เตรียม VPS (Ubuntu 22.04 ตัวอย่าง)

```bash
# ติดตั้ง Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# ดึงโค้ดขึ้น server (git หรือ scp โฟลเดอร์ tmm-system ขึ้นไป)
cd /opt
git clone <your-repo> ofero-tmm   # หรือ scp -r tmm-system user@vps:/opt/ofero-tmm
cd ofero-tmm
npm install --omit=dev
npm run seed        # สร้างฐานข้อมูลครั้งแรก
```

## 2) รันแบบถาวรด้วย PM2

```bash
sudo npm install -g pm2
PORT=4173 pm2 start server.js --name ofero-tmm
pm2 save && pm2 startup    # ให้รันอัตโนมัติเมื่อ reboot
```

## 3) เปิดผ่านโดเมน + HTTPS (Nginx + Certbot)

```nginx
# /etc/nginx/sites-available/ofero-tmm
server {
  server_name tmm.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ofero-tmm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tmm.yourdomain.com   # ติด HTTPS อัตโนมัติ
```

เสร็จแล้วเข้าใช้งานที่ **https://tmm.yourdomain.com**

## 4) สำรองข้อมูล (สำคัญ)

ข้อมูลทั้งหมดอยู่ในไฟล์ `tmm.db` — สำรองด้วย cron รายวัน:

```bash
# crontab -e
0 2 * * * cp /opt/ofero-tmm/tmm.db /opt/backups/tmm-$(date +\%F).db
```

## สิ่งที่ควรเพิ่มก่อนใช้จริงหลายคน (แนะนำ)
- **ระบบ Login / สิทธิ์ผู้ใช้** (ตอนนี้ยังไม่มี — ใครเข้า URL ได้ก็แก้ได้)
- ถ้าผู้ใช้ >10 คนหรือเขียนพร้อมกันเยอะ → เปลี่ยน SQLite เป็น **PostgreSQL**
  (แก้เฉพาะไฟล์ `db.js` ให้ต่อ PG — โครงสร้างตารางเหมือนเดิม)
- จำกัดการเข้าถึงด้วย firewall / Basic Auth ชั่วคราวระหว่างทดสอบ

## อัปเดตเวอร์ชันใหม่
```bash
cd /opt/ofero-tmm && git pull && npm install --omit=dev && pm2 restart ofero-tmm
```
