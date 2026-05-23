/**
 * PM2 Ecosystem — gerencia todos os módulos como processos independentes
 * 
 * Comandos úteis:
 *   pm2 start ecosystem.config.js      → sobe tudo
 *   pm2 restart module-whatsapp        → reinicia só o WA
 *   pm2 logs module-email              → logs do email
 *   pm2 monit                          → dashboard em tempo real
 *   pm2 stop module-telegram           → para o Telegram sem afetar o resto
 */
module.exports = {
  apps: [
    {
      name:            "gateway",
      script:          "./gateway/src/index.ts",
      interpreter:     "tsx",
      env_file:        ".env",
      env:             { PORT: 4000 },
      autorestart:     true,
      max_restarts:    10,
      restart_delay:   3000,
      watch:           false,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name:              "module-whatsapp",
      script:            "./module-whatsapp/src/index.ts",
      interpreter:       "tsx",
      env_file:          ".env",
      env:               { PORT: 4001 },
      autorestart:       true,
      max_restarts:      15,
      restart_delay:     5000,
      // Reinicia se Baileys vazar memória (comum com muitas sessões)
      max_memory_restart:"600M",
      watch:             false,
    },
    {
      name:            "module-email",
      script:          "./module-email/src/index.ts",
      interpreter:     "tsx",
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
      interpreter:     "tsx",
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
      interpreter:     "tsx",
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
