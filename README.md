# ZapFlow — Marketing Automation SaaS

Stack modular: React 18 + TypeScript (frontend) · Node.js modular (backend)  
Canais: WhatsApp (Baileys) · Email (Brevo) · Telegram (grammy)

## Arquitetura

```
gateway          :4000  — API pública, auth, rate limiting
module-whatsapp  :4001  — Baileys + BullMQ
module-email     :4002  — Brevo SDK + BullMQ
module-telegram  :4003  — grammy Bot + BullMQ
module-ai        :4004  — Claude API
shared                  — tipos, firebase, redis, auth
frontend               — React 18 + Vite + TypeScript
```

## Instalação local

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env
# Preencher Firebase, Redis (Upstash), Brevo, Telegram, Anthropic

# 2. Instalar dependências (todos os módulos)
pnpm install -r   # ou: npm install -r

# 3. Subir todos os módulos
pm2 start ecosystem.config.js
pm2 logs

# 4. Frontend
cd frontend && pnpm install && pnpm dev
```

## Deploy Oracle Cloud

```bash
scp -i zapflow.pem zapflow.zip ubuntu@IP_DA_VM:/home/ubuntu/
ssh -i zapflow.pem ubuntu@IP_DA_VM
unzip zapflow.zip && mv zapflow2 zapflow
bash zapflow/scripts/setup.sh
```

## Manutenção por módulo (zero downtime nos outros)

```bash
pm2 restart module-whatsapp   # reinicia só o WA
pm2 restart module-email      # reinicia só o email
pm2 logs module-telegram      # logs do Telegram
pm2 stop module-ai            # para a IA sem afetar disparos
pm2 monit                     # dashboard em tempo real
```

## Variáveis obrigatórias

| Variável | Onde obter |
|---|---|
| FIREBASE_* | console.firebase.google.com → Configurações → Service Account |
| REDIS_URL | upstash.com → criar database → copiar URL TLS |
| BREVO_API_KEY | app.brevo.com → SMTP & API → API Keys |
| TELEGRAM_BOT_TOKEN | @BotFather no Telegram → /newbot |
| ANTHROPIC_API_KEY | console.anthropic.com → API Keys |
