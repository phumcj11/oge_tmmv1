#!/usr/bin/env bash
# ============================================================
# One-shot setup for a FRESH Ubuntu 22.04/24.04 VPS dedicated to oge
# Run as root:  bash server-setup.sh
# It installs Node + pm2 + Nginx + certbot, deploys the app, and wires SSL.
# Nothing here is shared with any other site — this VPS is oge-only.
# ============================================================
set -e

# ---- EDIT THESE 3 LINES ----
DOMAIN="oge.k-mkt.com"
REPO="https://github.com/phumcj11/oge_tmmv1.git"   # for a private repo see the note below
EMAIL="you@example.com"                            # your email for Let's Encrypt renewal notices
# ----------------------------

APPUSER="oge"
APPDIR="/home/${APPUSER}/tmm"
PM2_NAME="ofero-tmm"

echo "==> 1/6 base packages"
apt-get update && apt-get -y upgrade
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get -y install nodejs nginx git
npm install -g pm2

echo "==> 2/6 app user + clone"
id "$APPUSER" &>/dev/null || useradd -m -s /bin/bash "$APPUSER"
if [ -d "$APPDIR/.git" ]; then
  sudo -u "$APPUSER" git -C "$APPDIR" pull
else
  sudo -u "$APPUSER" git clone "$REPO" "$APPDIR"
fi
cd "$APPDIR"
sudo -u "$APPUSER" npm install --omit=dev

echo "==> 3/6 start app with pm2 (as $APPUSER)"
sudo -u "$APPUSER" pm2 start server.js --name "$PM2_NAME" || sudo -u "$APPUSER" pm2 restart "$PM2_NAME"
sudo -u "$APPUSER" pm2 save
# enable pm2 on boot for this user
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APPUSER" --hp "/home/${APPUSER}" | tail -1 | bash || true

echo "==> 4/6 nginx site"
cp "$APPDIR/deploy/nginx-oge.conf" /etc/nginx/sites-available/oge.conf
sed -i "s/oge\.k-mkt\.com/${DOMAIN}/g" /etc/nginx/sites-available/oge.conf
ln -sf /etc/nginx/sites-available/oge.conf /etc/nginx/sites-enabled/oge.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> 5/6 firewall (allow web + ssh)"
if command -v ufw &>/dev/null; then ufw allow 'Nginx Full' || true; ufw allow OpenSSH || true; fi

echo "==> 6/6 SSL (Let's Encrypt)"
apt-get -y install certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo ""
echo "=================================================="
echo " เสร็จ! เปิด  https://${DOMAIN}"
echo " แอปรันที่ 127.0.0.1:4173 (pm2: $PM2_NAME)"
echo " deploy รอบต่อไป:  cd $APPDIR && bash deploy.sh"
echo "=================================================="
