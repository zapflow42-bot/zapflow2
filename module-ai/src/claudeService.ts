import Anthropic from "@anthropic-ai/sdk"
import { db, logger } from "@zapflow/shared"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function buildContext(tenantId: string): Promise<string> {
  try {
    const [usersSnap, campaignsSnap, logsSnap] = await Promise.all([
      db.collection("users").where("tenantId", "==", tenantId).get(),
      db.collection("campaigns").where("ownerId", "==", tenantId).limit(20).get(),
      db.collection("dispatch_logs").where("ownerId", "==", tenantId).orderBy("timestamp", "desc").limit(100).get(),
    ])

    const campaigns = campaignsSnap.docs.map(d => d.data())
    const totalSent = campaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0)
    const totalFail = campaigns.reduce((s, c) => s + (c.failCount ?? 0), 0)
    const channels  = [...new Set(campaigns.map(c => c.channelType))].join(", ")

    const recentLogs = logsSnap.docs.map(d => d.data())
    const failRate   = recentLogs.length > 0
      ? (recentLogs.filter(l => l.status === "failed").length / recentLogs.length * 100).toFixed(1)
      : "0"

    return `
CONTEXTO DA OPERAÇÃO (dados em tempo real):
- Disparadores: ${usersSnap.size}
- Canais ativos: ${channels || "whatsapp"}
- Total enviado: ${totalSent.toLocaleString("pt-BR")}
- Taxa de falha: ${failRate}%
- Taxa de entrega: ${totalSent > 0 ? ((totalSent / (totalSent + totalFail)) * 100).toFixed(1) : "N/A"}%
- Campanhas recentes: ${campaigns.slice(0,5).map(c => c.name).join(", ") || "nenhuma"}
`
  } catch (err) {
    logger.error(err, "Falha ao buscar contexto para IA")
    return "Contexto: dados temporariamente indisponíveis."
  }
}

export async function askClaude(prompt: string, tenantId: string): Promise<string> {
  const context = await buildContext(tenantId)

  const response = await client.messages.create({
    model:      "claude-sonnet-4-20250514",
    max_tokens: 1200,
    system: `Você é o analista IA do ZapFlow — SaaS de automação de marketing multicanal (WhatsApp, Email, Telegram).

${context}

REGRAS:
- Responda SEMPRE em PT-BR
- Para cada resposta: responda a pergunta + aponte 1-2 insights que o gestor não pediu mas deve saber
- Use **negrito** para pontos críticos
- Sinalize riscos de ban/block com ⚠️
- Seja direto e objetivo, sem enrolação
- Se não souber, diga claramente`,
    messages: [{ role: "user", content: prompt }],
  })

  const block = response.content[0]
  return block.type === "text" ? block.text : "Resposta não disponível"
}
