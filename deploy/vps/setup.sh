#!/usr/bin/env bash
# Run from an extracted release on a NEW Ubuntu/Debian VPS, as root.
set -euo pipefail
umask 077
if [[ ${EUID} -ne 0 ]]; then echo 'Jalankan dengan sudo bash deploy/setup.sh DOMAIN EMAIL [--with-postgres] [--no-nginx]'; exit 1; fi
domain=${1:-};email=${2:-};with_pg=false;no_nginx=false
if [[ ! $domain =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || $domain != *.* || ! $email =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then echo 'Isi domain tanpa https:// dan email pengelola sertifikat.'; exit 1; fi
shift 2
for arg in "$@"; do case "$arg" in --with-postgres) with_pg=true;; --no-nginx) no_nginx=true;; *) echo "Opsi tidak dikenal: $arg"; exit 1;; esac; done
release_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ -f "$release_dir/backend/dist/start.js" && -d "$release_dir/public" ]] || { echo 'Gunakan arsip release, bukan langsung folder source.'; exit 1; }
[[ ! -e /etc/media-intelligence.env && ! -e /var/lib/media-intelligence/runtime.json && ! -e /opt/media-intelligence ]] || { echo 'Instalasi lama ditemukan. Dihentikan; gunakan prosedur upgrade/restore.'; exit 1; }
if ! $no_nginx && [[ -n $(ss -H -ltn '( sport = :80 or sport = :443 )') ]]; then echo 'Port 80/443 sudah digunakan. Jangan timpa proxy yang ada. Gunakan --no-nginx dan konfigurasi proxy sesuai README.'; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg openssl
if ! command -v node >/dev/null || [[ $(node -p 'Number(process.versions.node.split(".")[0])') -lt 22 ]]; then
 install -d -m 755 /etc/apt/keyrings
 curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /tmp/media-intelligence-nodesource.asc
 gpg --batch --yes --dearmor -o /etc/apt/keyrings/nodesource.gpg /tmp/media-intelligence-nodesource.asc
 rm -f /tmp/media-intelligence-nodesource.asc
 echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/media-intelligence-node.list
 chmod 644 /etc/apt/keyrings/nodesource.gpg /etc/apt/sources.list.d/media-intelligence-node.list
 apt-get update
 apt-get install -y nodejs
fi
getent passwd media-intelligence >/dev/null || useradd --system --home-dir /var/lib/media-intelligence --shell /usr/sbin/nologin media-intelligence
install -d -m 700 -o media-intelligence -g media-intelligence /var/lib/media-intelligence /var/lib/media-intelligence/files
install -d -m 755 /opt/media-intelligence
cp -a "$release_dir/backend" "$release_dir/public" /opt/media-intelligence/
# Runtime dependency install does not run as root.
chown -R media-intelligence:media-intelligence /opt/media-intelligence/backend
runuser -u media-intelligence -- npm --prefix /opt/media-intelligence/backend ci --omit=dev --no-audit --no-fund
chown -R root:root /opt/media-intelligence
chmod -R a+rX /opt/media-intelligence/public
jwt_secret=$(openssl rand -hex 48);credential_key=$(openssl rand -hex 32);install_token=$(openssl rand -hex 32);cron_secret=$(openssl rand -hex 32)
cat > /etc/media-intelligence.env <<EOF
NODE_ENV=production
DEPLOYMENT_MODE=vps
HOST=127.0.0.1
PORT=8080
TRUST_LOCAL_PROXY=true
PUBLIC_APP_URL=https://$domain
CORS_ORIGIN=https://$domain
COOKIE_SECURE=true
JWT_SECRET=$jwt_secret
INTEGRATION_CREDENTIAL_KEY=$credential_key
CRON_SECRET=$cron_secret
INSTALL_ENABLED=true
INSTALL_TOKEN=$install_token
INSTALL_CONFIG_PATH=/var/lib/media-intelligence/runtime.json
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/var/lib/media-intelligence/files
EOF
chmod 600 /etc/media-intelligence.env
if $with_pg; then
 apt-get install -y postgresql
 systemctl enable --now postgresql
 # Refuse existing objects. Generated password is strictly hexadecimal.
 existing=$(runuser -u postgres -- psql -Atc "SELECT count(*) FROM pg_roles WHERE rolname='mi_vps'")
 [[ $existing == 0 ]] || { echo 'Role mi_vps sudah ada. Tidak diubah. Lanjutkan konfigurasi database secara manual.'; exit 1; }
 db_password=$(openssl rand -hex 24)
 runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<EOF
CREATE ROLE mi_vps LOGIN PASSWORD '$db_password';
CREATE DATABASE media_intelligence OWNER mi_vps;
EOF
 printf 'DATABASE_URL=postgresql://mi_vps:%s@127.0.0.1:5432/media_intelligence\n' "$db_password" > /etc/media-intelligence-database.txt
 chmod 600 /etc/media-intelligence-database.txt
fi
cp "$release_dir/deploy/"*.service "$release_dir/deploy/"*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now media-intelligence.service media-intelligence-scheduler.timer
if ! $no_nginx; then
 apt-get install -y nginx certbot python3-certbot-nginx
 sed "s/mediaintelligence.example/$domain/g" "$release_dir/deploy/nginx.conf" > /etc/nginx/sites-available/media-intelligence
 ln -s /etc/nginx/sites-available/media-intelligence /etc/nginx/sites-enabled/media-intelligence
 nginx -t
 systemctl enable --now nginx
 systemctl reload nginx
 certbot --nginx --non-interactive --agree-tos -m "$email" -d "$domain" --redirect
fi
printf '\nBuka https://%s/install setelah DNS dan HTTPS siap.\nToken instalasi: %s\n' "$domain" "$install_token"
echo 'Simpan /etc/media-intelligence.env dan runtime.json secara rahasia. Scheduler koleksi tetap nonaktif sampai diaktifkan di admin.'
$with_pg && echo 'URL database untuk wizard ada di /etc/media-intelligence-database.txt' || true
