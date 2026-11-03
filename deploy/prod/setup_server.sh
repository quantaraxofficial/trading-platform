#!/usr/bin/env bash
# One-time setup of a fresh Debian/Ubuntu VM for the TradePilot stack: Docker, 4 GB swap, a
# firewall-friendly layout, and deploy/prod/.env with secrets generated right here (they never
# leave the server). Run from the code's folder:  sudo bash deploy/prod/setup_server.sh <site-host>
set -euo pipefail
SITE_HOST="${1:?usage: setup_server.sh <site-host>}"
cd "$(dirname "$0")"

# Docker
if ! command -v docker >/dev/null; then
  apt-get update -y
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  . /etc/os-release
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Swap (the Next.js build needs more than 4 GB at its peak)
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
  sysctl -w vm.swappiness=10 && echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
fi

# Secrets: generated here, once
if [ ! -f .env ]; then
  umask 077
  cat > .env <<EOF
SITE_HOST=${SITE_HOST}
DJANGO_SECRET_KEY=$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-60)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
CLICKHOUSE_PASSWORD=$(openssl rand -hex 24)
FIREBASE_PROJECT_ID=quantarax
FIREBASE_WEB_API_KEY=
TWELVEDATA_API_KEY=
ADMIN_URL=admin/
EOF
  echo "Created deploy/prod/.env (secrets generated on this server). Fill in FIREBASE_WEB_API_KEY and TWELVEDATA_API_KEY."
else
  sed -i "s/^SITE_HOST=.*/SITE_HOST=${SITE_HOST}/" .env
fi
echo "Setup done for ${SITE_HOST}"
