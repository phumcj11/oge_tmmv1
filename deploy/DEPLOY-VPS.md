# คู่มือแยก VPS สำหรับ oge (oge.k-mkt.com)

เป้าหมาย: ให้ oge รันบน **VPS ของตัวเอง** แยกจากเว็บ production อื่น ๆ — พังยังไงก็ไม่กระทบใคร

สแตก: **Ubuntu + Node 20 + pm2 + Nginx (reverse proxy) + Let's Encrypt SSL** · ฐานข้อมูลเป็น SQLite (ไฟล์เดียว ไม่ต้องมี DB server)

---

## ขั้นที่ 1 — เตรียม VPS
1. เช่า VPS 1 เครื่อง — สเปกเล็กพอ: **1 vCPU / 1 GB RAM / 20 GB SSD** (แอปนี้กินทรัพยากรน้อยมาก)
   - เลือก OS: **Ubuntu 24.04 LTS** (หรือ 22.04 LTS)
   - ผู้ให้บริการไหนก็ได้ (เจ้าไทยหรือ DigitalOcean/Vultr/Linode) ขอแค่ให้ root + SSH
2. จดค่า **IP ของ VPS** ไว้

## ขั้นที่ 2 — ชี้โดเมนมาที่ VPS ใหม่
ที่ระบบจัดการ DNS ของ `k-mkt.com` แก้ **A record** ของ `oge`:
```
oge.k-mkt.com   A   <IP ของ VPS ใหม่>
```
รอ DNS อัปเดต (ปกติ 5-30 นาที) เช็คด้วย: `nslookup oge.k-mkt.com` ต้องได้ IP ใหม่

> ⚠️ อย่าลืม **ถอด oge ออกจาก VPS เดิม** ทีหลัง (ลบ vhost/subdomain oge บน DirectAdmin) จะได้ไม่สับสน — แต่ทำหลังเว็บใหม่ขึ้นเรียบร้อยแล้ว

## ขั้นที่ 3 — ติดตั้ง (รันครั้งเดียวบน VPS ใหม่)
SSH เข้า VPS ใหม่ในฐานะ root แล้ว:
```bash
# ดึงสคริปต์ setup มา (หรือ git clone repo ก่อนก็ได้)
git clone https://github.com/phumcj11/oge_tmmv1.git /root/oge-setup
cd /root/oge-setup
nano deploy/server-setup.sh     # แก้ 3 บรรทัดบนสุด: DOMAIN, REPO, EMAIL
bash deploy/server-setup.sh
```
สคริปต์จะ: ลง Node+pm2+Nginx → clone แอป → start ด้วย pm2 → ตั้ง Nginx proxy → ขอ SSL อัตโนมัติ

เสร็จแล้วเปิด **https://oge.k-mkt.com** ได้เลย

## ขั้นที่ 4 — โหลดแผน Boss เข้าระบบ (ถ้าต้องการ)
```bash
cd /home/oge/tmm && sudo -u oge node scripts/setup-thaweeyont.js
```

---

## Deploy รอบต่อไป (หลัง push โค้ดใหม่)
บน VPS:
```bash
cd /home/oge/tmm && bash deploy.sh
```
`deploy.sh` แตะแค่โฟลเดอร์นี้ + pm2 app `ofero-tmm` เท่านั้น — VPS นี้เป็นของ oge ล้วน จึงปลอดภัย 100%

---

## หมายเหตุสำคัญ

**Repo เป็น private** → ตอน clone บน VPS ต้องมีสิทธิ์ เลือกวิธีใดวิธีหนึ่ง:
- **Deploy key (แนะนำ):** สร้าง SSH key บน VPS (`ssh-keygen -t ed25519`) แล้วเอา public key ไปใส่ใน GitHub repo → Settings → Deploy keys (read-only) จากนั้น clone ด้วย URL แบบ SSH: `git@github.com:phumcj11/oge_tmmv1.git`
- **PAT:** clone ด้วย `https://<TOKEN>@github.com/phumcj11/oge_tmmv1.git` (อย่าเก็บ token ลงไฟล์ในสคริปต์)

**ย้ายข้อมูลจาก VPS เดิม (ถ้าอยากเก็บข้อมูลปัจจุบัน)** — คัดลอก 2 อย่างจากเครื่องเก่ามาทับบนเครื่องใหม่ (ตอนแอปหยุด):
```bash
# บนเครื่องใหม่: หยุดแอปก่อน
sudo -u oge pm2 stop ofero-tmm
# คัดลอก tmm.db* และ uploads/ จากเครื่องเก่า (/home/pcj/tmm) มาที่ /home/oge/tmm
#   ผ่าน scp หรือ rsync — เช่นจากเครื่องเก่า:
#   scp tmm.db* root@<IP ใหม่>:/home/oge/tmm/
#   scp -r uploads root@<IP ใหม่>:/home/oge/tmm/
sudo -u oge pm2 start ofero-tmm
```
> ถ้าไม่ย้าย แอปจะ seed ข้อมูลตั้งต้นจาก `seed-data.json` ให้เองตอนรันครั้งแรก (ร้าน/สินค้า/POSM ครบ) แล้วค่อยรัน `setup-thaweeyont.js` เติมแผน Boss

**SSL ต่ออายุอัตโนมัติ** — certbot ตั้ง cron ให้แล้ว ไม่ต้องทำอะไรเพิ่ม

**เปลี่ยนรหัส admin** — หลังขึ้นเว็บ login `admin / ofero1234` แล้วเปลี่ยนรหัสทันที
