#!/usr/bin/env bash
# ============================================================
# Ofero TMM — one-shot deploy script for the VPS
# วิธีใช้: SSH เข้าเครื่องเอง (พิมพ์รหัส root เอง) แล้ว:
#   1) วางไฟล์นี้ไว้ที่เครื่อง หรือ copy ทั้งสคริปต์ไปวางใน terminal
#   2) แก้ค่า GITHUB_TOKEN ด้านล่างก่อนรัน (repo เป็น private)
#   3) bash deploy-vps.sh
# ============================================================
set -e

# ---- ตั้งค่า (แก้ก่อนรัน) ----
APP_USER="pcj"                       # DirectAdmin user
APP_DIR="/home/${APP_USER}/tmm"      # ที่ติดตั้งแอป
REPO="github.com/phumcj11/oge_tmmv1.git"
GITHUB_USER="phumcj11"
GITHUB_TOKEN="__ใส่_PERSONAL_ACCESS_TOKEN_ที่นี่__"   # สร้างที่ GitHub > Settings > Developer settings > PAT (scope: repo)
PORT="4173"

echo "==> 1) ติดตั้ง Node.js 20 + git + PM2 (ถ้ายังไม่มี)"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
command -v git >/dev/null 2>&1 || apt-get install -y git
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
echo "    node $(node -v) / npm $(npm -v)"

echo "==> 2) ดึงโค้ดจาก GitHub (private repo)"
if [ -d "${APP_DIR}/.git" ]; then
  cd "${APP_DIR}" && git pull
else
  git clone "https://${GITHUB_USER}:${GITHUB_TOKEN}@${REPO}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "==> 3) ติดตั้ง dependencies + สร้างฐานข้อมูลครั้งแรก"
npm install --omit=dev
[ -f tmm.db ] || npm run seed

echo "==> 4) รันถาวรด้วย PM2 ที่ port ${PORT}"
PORT="${PORT}" pm2 start server.js --name ofero-tmm --update-env || pm2 restart ofero-tmm --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo ""
echo "==> เสร็จ! แอปรันที่ http://127.0.0.1:${PORT}"
echo "    ขั้นต่อไป: ตั้ง reverse proxy ในโดเมน oge.k-mkt.com ให้ชี้มาที่ 127.0.0.1:${PORT}"
echo "    ตรวจสถานะ: pm2 status ofero-tmm  |  ดู log: pm2 logs ofero-tmm"
