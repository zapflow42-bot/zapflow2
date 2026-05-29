// module-ai/src/claudeService.ts — REESCRITO para Supabase (sem Firebase)
import Anthropic from "@anthropic-ai/sdk"
import { supabase, logger } from "@zapflow/shared"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function buildContext(tenantId: string): Promise<string> {
  try {
    const [usersRes, campaignsRes, logsRes] = await Promise.all([
      supabase.from("users").select("id").eq("tenant_id", tenantId),
      supabase.from("campaigns").select("name, channel_type, sent_count, fail_count")
        .eq("owner_id", tenantId).limit(20),
      supabase.from("dispatch_logs").select("status")
        .eq("owner_id", tenantId).order("created_at", { ascending: false }).limit(100),
    ])

    const campaigns  = campaignsRes.data ?? []
    const totalSent  = campaigns.reduce((s, c) => s + (c.sent_count ?? 0), 0)
    const totalFail  = campaigns.reduce((s, c) => s + (c.fail_count ?? 0), 0)
    const channels   = [...new Set(campaigns.map(c => c.channel_type))].join(", ")
    const logs       = logsRes.data ?? []
    const failRate   = logs.length > 0
      ? (logs.filter(l => l.status === "failed").length / logs.length * 100).toFixed(1)
      : "0"

    return `
CONTEXTO DA OPERAÇÃO (dados em tempo real):
- Disparadores: ${usersRes.data?.length ?? 0}
- Canais ativos: ${channels || "whatsapp"}
- Total enviado: ${totalSent.toLocaleString("pt-BR")}
- Taxa de falha: ${failRate}%
- Taxa de entrega: ${totalSent > 0 ? ((totalSent / (totalSent + totalFail)) * 100).toFixed(1) : "N/A"}%
- Campanhas recentes: ${campaigns.slice(0, 5).map(c => c.name).join(", ") || "nenhuma"}
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
