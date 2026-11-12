#!/usr/bin/env bash
# Ar_Trading — baja la última versión de la rama actualizaciones y reinicia el servicio.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Ejecuta con sudo."; exit 1; }
git -C /opt/ar-trading pull --ff-only
chown -R arapp:arapp /opt/ar-trading/data
systemctl restart ar-trading
sleep 2
systemctl is-active ar-trading && echo "Actualizado."
