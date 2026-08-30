#!/usr/bin/env bash
# ============================================================
# Deploy/update — เฉพาะโปรเจกต์ ofero-tmm เท่านั้น
# ปลอดภัยกับโปรเจกต์อื่นบน VPS (mkttools ฯลฯ) — แตะแค่:
#   - โฟลเดอร์ /home/pcj/tmm
#   - pm2 app ชื่อ "ofero-tmm"
# ไม่มีคำสั่ง global (ไม่มี pm2 restart all / ไม่ยุ่ง Apache)
# วิธีใช้บน VPS:  bash ~/tmm/deploy.sh   (หรือ cd /home/pcj/tmm && bash deploy.sh)
# ============================================================
set -e
# path-relative: works on any VPS regardless of where the repo lives
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PM2_NAME="ofero-tmm"

cd "$APP_DIR"
echo "==> [$PM2_NAME] อัปเดตโค้ดจาก GitHub"
git pull

echo "==> [$PM2_NAME] ติดตั้ง dependencies (ถ้ามีเปลี่ยน)"
npm install --omit=dev

echo "==> [$PM2_NAME] restart แอป (เฉพาะตัวนี้)"
pm2 restart "$PM2_NAME" --update-env
pm2 save

echo ""
echo "==> เสร็จ! log ล่าสุด:"
pm2 logs "$PM2_NAME" --lines 8 --nostream
echo ""
echo "ทดสอบ: curl -s http://127.0.0.1:4173/api/overview | head -c 120"
