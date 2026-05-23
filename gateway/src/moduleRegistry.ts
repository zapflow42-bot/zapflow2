// Endereços dos módulos — configurável via env para deploy em servidores separados
export const MODULES = {
  whatsapp: process.env.MODULE_WHATSAPP_URL ?? "http://localhost:4001",
  email:    process.env.MODULE_EMAIL_URL    ?? "http://localhost:4002",
  telegram: process.env.MODULE_TELEGRAM_URL ?? "http://localhost:4003",
  ai:       process.env.MODULE_AI_URL       ?? "http://localhost:4004",
} as const

export type ModuleName = keyof typeof MODULES
