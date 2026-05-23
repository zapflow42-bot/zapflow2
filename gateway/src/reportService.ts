import { supabase } from "@zapflow/shared"
import { randomUUID } from "crypto"
import type { Report, ReportPeriod, ReportScope, ChannelType } from "@zapflow/shared"

function getPeriodDates(period: ReportPeriod, customStart?: Date, customEnd?: Date) {
  const now = new Date()
  const end = new Date(now); end.setHours(23,59,59,999)
  switch (period) {
    case "week":   { const s=new Date(now); s.setDate(s.getDate()-7);  s.setHours(0,0,0,0); return {start:s,end} }
    case "month":  { const s=new Date(now); s.setDate(s.getDate()-30); s.setHours(0,0,0,0); return {start:s,end} }
    case "3weeks": { const s=new Date(now); s.setDate(s.getDate()-21); s.setHours(0,0,0,0); return {start:s,end} }
    case "custom": return { start: customStart ?? new Date(0), end: customEnd ?? end }
  }
}

export async function generateReport(params: {
  tenantId: string; scope: ReportScope; period: ReportPeriod
  userId?: string; channels?: ChannelType[]
  customStart?: Date; customEnd?: Date
}): Promise<Report> {
  const { start, end } = getPeriodDates(params.period, params.customStart, params.customEnd)

  let query = supabase.from("dispatch_logs").select("channel, status, owner_id")
    .eq("tenant_id", params.tenantId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())

  if (params.scope === "individual" && params.userId) query = query.eq("owner_id", params.userId)
  if (params.channels?.length) query = query.in("channel", params.channels)

  const { data: logs } = await query.limit(100_000)
  const rows = logs ?? []

  const totalSent   = rows.filter(r => r.status === "sent").length
  const totalFailed = rows.filter(r => r.status === "failed").length

  const byChannel: Partial<Record<ChannelType, any>> = {}
  for (const ch of ["whatsapp","email","telegram","sms"] as ChannelType[]) {
    const cr = rows.filter(r => r.channel === ch)
    if (!cr.length) continue
    const s = cr.filter(r => r.status === "sent").length
    const f = cr.filter(r => r.status === "failed").length
    byChannel[ch] = { sent:s, failed:f, replied:0, deliveryRate:(s+f)>0?(s/(s+f))*100:0, replyRate:0 }
  }

  let byUser: any[] | undefined
  if (params.scope === "team") {
    const { data: users } = await supabase.from("users").select("id, display_name").eq("tenant_id", params.tenantId)
    const byUid = new Map<string, typeof rows>()
    rows.forEach(r => { if (!byUid.has(r.owner_id)) byUid.set(r.owner_id, []); byUid.get(r.owner_id)!.push(r) })
    byUser = Array.from(byUid.entries()).map(([uid, urw]) => {
      const s = urw.filter(r => r.status==="sent").length
      const f = urw.filter(r => r.status==="failed").length
      return { uid, displayName: users?.find(u => u.id===uid)?.display_name ?? "Desconhecido",
        total:urw.length, sent:s, failed:f, replied:0,
        deliveryRate:(s+f)>0?(s/(s+f))*100:0, replyRate:0, byChannel:{} }
    }).sort((a,b) => b.sent-a.sent)
  }

  const total = totalSent + totalFailed
  const report: Report = {
    id: randomUUID(), tenantId: params.tenantId, generatedAt: new Date(),
    scope: params.scope, period: params.period, startDate: start, endDate: end,
    totalSent, totalFailed, totalReplied: 0,
    deliveryRate: total>0?(totalSent/total)*100:0, replyRate:0, byChannel, byUser,
  }

  await supabase.from("reports").insert({
    id: report.id, tenant_id: report.tenantId, scope: report.scope,
    period: report.period, start_date: report.startDate, end_date: report.endDate,
    total_sent: report.totalSent, total_failed: report.totalFailed,
    delivery_rate: report.deliveryRate, by_channel: report.byChannel,
    by_user: report.byUser, generated_at: report.generatedAt,
  })

  return report
}
