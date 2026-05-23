#!/bin/bash
# ═══════════════════════════════════════════════════════════
# ZapFlow — Setup automático para Oracle Cloud (Ubuntu 22.04)
# Uso: bash setup.sh
# ═══════════════════════════════════════════════════════════

set -e  # para se qualquer comando falhar

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

log "ZapFlow Setup — Oracle Cloud Ubuntu 22.04"
echo ""

# ── 1. Atualizar sistema ──────────────────────────────────
log "Atualizando sistema..."
sudo apt-get update -qq && sudo apt-get upgrade -y -qq

# ── 2. Instalar dependências ──────────────────────────────
log "Instalando dependências..."
sudo apt-get install -y -qq git curl wget unzip build-essential   python3 python3-pip iptables-persistent ufw

# ── 3. Node.js 20 ────────────────────────────────────────
log "Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
sudo apt-get install -y nodejs
node --version

# ── 4. pnpm ──────────────────────────────────────────────
log "Instalando pnpm..."
npm install -g pnpm pm2 tsx
pm2 --version

# ── 5. Caddy (proxy reverso + SSL automático) ─────────────
log "Instalando Caddy..."
sudo apt-get install -y apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update -qq && sudo apt-get install caddy -y

# ── 6. Firewall ───────────────────────────────────────────
log "Configurando firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 4000/tcp  # Gateway (acesso direto em dev)
sudo ufw --force enable

# Oracle Cloud também requer regras no VCN Security List
warn "IMPORTANTE: No painel Oracle, adicione regras de ingress:"
warn "  Porta 80  (HTTP)  — TCP"
warn "  Porta 443 (HTTPS) — TCP"
warn "  Porta 22  (SSH)   — TCP (já existe)"

# ── 7. Clonar/atualizar projeto ───────────────────────────
log "Configurando projeto..."
if [ -d "/home/ubuntu/zapflow" ]; then
  warn "Pasta zapflow já existe. Atualizando..."
  cd /home/ubuntu/zapflow && git pull
else
  warn "Cole o ZIP do projeto em /home/ubuntu/ e descompacte:"
  warn "  scp -i zapflow.pem zapflow.zip ubuntu@IP:/home/ubuntu/"
  warn "  unzip zapflow.zip"
  warn "  mv zapflow2 zapflow"
  warn "Depois rode este script novamente de dentro da pasta zapflow."
  exit 0
fi

cd /home/ubuntu/zapflow

# ── 8. Variáveis de ambiente ──────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  warn "Arquivo .env criado — preencha as credenciais:"
  warn "  nano /home/ubuntu/zapflow/.env"
  warn "Depois execute: pm2 start ecosystem.config.js"
else
  log ".env já existe"
fi

# ── 9. Instalar dependências do projeto ───────────────────
log "Instalando dependências do projeto..."
pnpm install -r

# ── 10. PM2 — configurar autostart ───────────────────────
log "Configurando PM2 autostart..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash || true

# ── 11. Caddy config ──────────────────────────────────────
DOMAIN=""
read -p "Domínio do backend API (ex: api.seusite.com.br) ou ENTER para pular: " DOMAIN

if [ -n "$DOMAIN" ]; then
  sudo tee /etc/caddy/Caddyfile > /dev/null << CADDYEOF
${DOMAIN} {
    reverse_proxy localhost:4000
    encode gzip

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
    }
}
CADDYEOF
  sudo systemctl restart caddy
  log "Caddy configurado para ${DOMAIN} com SSL automático"
else
  warn "Pulando configuração de domínio"
fi

# ── Finalizar ─────────────────────────────────────────────
echo ""
log "═══════════════════════════════════════════"
log "Setup concluído!"
log ""
log "Próximos passos:"
log "  1. Preencher .env:       nano /home/ubuntu/zapflow/.env"
log "  2. Iniciar módulos:      pm2 start ecosystem.config.js"
log "  3. Salvar processo:      pm2 save"
log "  4. Ver status:           pm2 status"
log "  5. Ver logs:             pm2 logs"
log "  6. Monitorar:            pm2 monit"
log ""
log "URLs locais:"
log "  Gateway:   http://localhost:4000"
log "  WhatsApp:  http://localhost:4001"
log "  Email:     http://localhost:4002"
log "  Telegram:  http://localhost:4003"
log "  AI:        http://localhost:4004"
log "═══════════════════════════════════════════"
