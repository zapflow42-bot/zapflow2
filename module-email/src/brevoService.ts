import * as Brevo from "@getbrevo/brevo"
import { logger } from "@zapflow/shared"

// Inicializa API client da Brevo
const transactionalApi = new Brevo.TransactionalEmailsApi()
transactionalApi.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY!
)

interface SendEmailParams {
  to:      string
  name?:   string
  subject: string
  text:    string   // texto plano (template já processado)
  html?:   string   // opcional — se não fornecido, converte o texto
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  try {
    const htmlBody = params.html ?? textToHtml(params.text)

    await transactionalApi.sendTransacEmail({
      sender: {
        email: process.env.BREVO_SENDER_EMAIL!,
        name:  process.env.BREVO_SENDER_NAME ?? "ZapFlow",
      },
      to: [{ email: params.to, name: params.name ?? params.to }],
      subject:     params.subject,
      htmlContent: htmlBody,
      textContent: params.text,
      // Headers para melhorar entregabilidade
      headers: {
        "X-Mailin-Tag":    "zapflow-dispatch",
        "X-Mailer":        "ZapFlow/1.0",
      },
    })

    logger.info({ to: maskEmail(params.to) }, "✓ Email enviado via Brevo")
    return true
  } catch (err: any) {
    logger.error({ err: err?.body ?? err?.message }, "✗ Brevo falhou")
    return false
  }
}

/** Converte texto plano em HTML simples preservando quebras de linha */
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#333;">
  <div style="line-height:1.7;">${escaped}</div>
  <hr style="margin-top:32px;border:none;border-top:1px solid #eee;">
  <p style="font-size:11px;color:#999;">
    Para cancelar o recebimento, responda com SAIR.<br>
    Enviado por ZapFlow — plataforma de marketing.
  </p>
</body>
</html>`
}

const maskEmail = (e: string) => {
  const [user, domain] = e.split("@")
  return `${user.slice(0, 2)}***@${domain}`
}
