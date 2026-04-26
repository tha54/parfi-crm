#!/bin/bash
# Parfi CRM — script de démarrage
# Le frontend est servi par Nginx (port 80) depuis le build statique.
# Ce script (re)démarre uniquement le backend API via PM2.

set -e

echo "==> Démarrage Parfi CRM..."

# Vérifier que le build frontend existe
if [ ! -f /opt/parfi-crm/frontend/dist/index.html ]; then
  echo "Build frontend manquant — compilation en cours..."
  cd /opt/parfi-crm/frontend && npm run build
fi

# Démarrer ou redémarrer le backend via PM2
if pm2 describe parfi-crm-api > /dev/null 2>&1; then
  pm2 restart parfi-crm-api
else
  pm2 start /opt/parfi-crm/backend/src/server.js \
    --name parfi-crm-api \
    --cwd /opt/parfi-crm/backend
fi

# S'assurer que Nginx tourne
systemctl is-active nginx > /dev/null 2>&1 || systemctl start nginx

echo ""
echo "  Parfi CRM       : http://localhost"
echo "  API backend     : http://localhost:3001"
echo "  Identifiants    : thierry@parfi-france.fr / Parfi2026!"
echo ""
pm2 list
