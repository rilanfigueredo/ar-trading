#!/usr/bin/env bash
# Ar_Trading v0.26 — instala el programa en un servidor Ubuntu (Oracle Cloud Always Free u otro).
# Uso:  sudo bash instalar_nube.sh TU_DOMINIO.duckdns.org
# Pide la clave de acceso (mínimo 8 caracteres). Deja Caddy (HTTPS automático) + servicio que arranca solo.
set -euo pipefail
DOM="${1:-}"
[ -n "$DOM" ] || { echo "Falta el dominio. Ejemplo: sudo bash instalar_nube.sh miprograma.duckdns.org"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Ejecuta con sudo."; exit 1; }
APP=/opt/ar-trading
read -rsp "Elige tu clave de acceso (mínimo 8 caracteres): " PW; echo
[ ${#PW} -ge 8 ] || { echo "Clave demasiado corta."; exit 1; }
case "$PW" in *"'"*) echo "La clave no puede llevar comilla simple (')."; exit 1;; esac

apt-get update -y
apt-get install -y curl git debian-keyring debian-archive-keyring apt-transport-https gpg
# Node 22
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# Caddy
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi
# Programa (rama actualizaciones)
if [ -d "$APP/.git" ]; then git -C "$APP" pull --ff-only; else git clone --branch actualizaciones --depth 1 https://github.com/rilanfigueredo/ar-trading.git "$APP"; fi
mkdir -p "$APP/data"
id arapp >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin arapp
chown -R arapp:arapp "$APP/data"
# Servicio
(umask 077; printf "AR_PASSWORD='%s'\n" "$PW" > /etc/ar-trading.env)
cat > /etc/systemd/system/ar-trading.service <<UNIT
[Unit]
Description=Ar_Trading
After=network-online.target
[Service]
User=arapp
WorkingDirectory=$APP
Environment=PORT=3000
Environment=AR_HOST=127.0.0.1
Environment=AR_TRUST_PROXY=1
EnvironmentFile=/etc/ar-trading.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/caddy/Caddyfile <<CADDY
$DOM {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
CADDY
# Cortafuegos del propio servidor (además de la regla en la consola de Oracle)
if command -v iptables >/dev/null; then
  iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
  iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi
systemctl daemon-reload
systemctl enable --now ar-trading
systemctl restart caddy
sleep 3
systemctl is-active ar-trading && echo "LISTO: abre https://$DOM en tu móvil y entra con tu clave."
