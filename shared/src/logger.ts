import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: process.env.NODE_ENV === "development"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
  redact: {
    // LGPD: nunca loga dados sensíveis
    paths: ["*.phoneNumber", "*.email", "*.password", "*.token", "*.apiKey"],
    censor: "[REDACTED]",
  },
})
