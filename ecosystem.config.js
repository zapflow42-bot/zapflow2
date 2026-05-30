/**
 * PM2 Ecosystem — ZapFlow2
 * FIX APLICADO: interpreter usa path absoluto do tsx do workspace
 * Motivo: PM2 não herda o PATH do fnm, então "tsx" global não enxerga node_modules
 *
 * Comandos úteis:
 *   pm2 start ecosystem.config.js
 *   pm2 restart module-whatsapp
 *   pm2 logs module-telegram --lines 50
 *   pm2 monit
 *   pm2 save  ← rodar após qualquer mudança
 */
module.exports = {
  apps: [
    {
      name:            "gateway",
      script:          "./gateway/src/index.ts",
      interpreter:     "/home/darthvader/zapflow2/node_modules/.bin/tsx",
      env_file:        ".env",
      env:             { PORT: 4000 },
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name:               "module-whatsapp",
      script:             "./module-whatsapp/src/index.ts",
      interpreter:        "/home/darthvader/zapflow2/node_modules/.bin/tsx",
      env_file:           ".env",
      env:                { PORT: 4001 },
      autorestart:        true,
      max_restarts:       15,
      restart_delay:      5000,
      max_memory_restart: "600M",
      watch:              false,
    },
    {
      name:            "module-email",
      script:          "./module-email/src/index.ts",
      interpreter:     "/home/darthvader/zapflow2/node_modules/.bin/tsx",
      env_file:        ".env",
      env:             { PORT: 4002 },
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
    },
    {
      name:            "module-telegram",
      script:          "./module-telegram/src/index.ts",
      interpreter:     "/home/darthvader/zapflow2/node_modules/.bin/tsx",
      env_file:        ".env",
      env:             { PORT: 4003 },
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
    },
    {
      name:            "module-ai",
      script:          "./module-ai/src/index.ts",
      interpreter:     "/home/darthvader/zapflow2/node_modules/.bin/tsx",
      env_file:        ".env",
      env:             { PORT: 4004 },
      instances:       1,
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
    },
  ],
}
