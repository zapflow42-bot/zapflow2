import { Queue, Worker, type Job } from "bullmq"
import { redis, supabase, logger } from "@zapflow/shared"
import { sendMessage } from "./sessionManager"
import type { DispatchJob } from "@zapflow/shared"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const waQueue = new Queue<DispatchJob>("zf-whatsapp", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail:     { count: 500 },
  },
})

export const getQueueStats = async () => ({
  waiting:   await waQueue.getWaitingCount(),
  active:    await waQueue.getActiveCount(),
  completed: await waQueue.getCompletedCount(),
  failed:    await waQueue.getFailedCount(),
})

export function startWorker() {
  const worker = new Worker<DispatchJob>(
    "zf-whatsapp",
    async (job: Job<DispatchJob>) => {
      const { to, message, senderId, campaignId, contactName, ownerId, tenantId } = job.data

      const hour = new Date().getHours()
      const { data: camp } = await supabase
        .from("campaigns").select("active_hours").eq("id", campaignId).single()
      const hours: number[] = camp?.active_hours ?? [8,9,10,11,12,13,14,15,16,17,18,19,20]

      if (!hours.includes(hour)) {
        await job.moveToDelayed(Date.now() + 10 * 60_000)
        return
      }

      const ok = await sendMessage(senderId, to, message)

      await supabase.from("dispatch_logs").insert({
        campaign_id: campaignId, owner_id: ownerId, tenant_id: tenantId,
        channel: "whatsapp", to_masked: maskPhone(to), contact_name: contactName,
        status: ok ? "sent" : "failed", attempt: job.attemptsMade + 1,
      })

      const field = ok ? "sent_count" : "fail_count"
      const { data: c } = await supabase.from("campaigns").select(field).eq("id", campaignId).single()
      if (c) await supabase.from("campaigns").update({ [field]: (c as any)[field] + 1 }).eq("id", campaignId)

      if (!ok) throw new Error(`Falha para ${maskPhone(to)}`)
      logger.info({ to: maskPhone(to) }, "✓ whatsapp enviado")
    },
    { connection: redis, concurrency: 1, limiter: { max: 30, duration: 60_000 } }
  )
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err: err.message }, "Job WA falhou"))
  logger.info("WhatsApp Worker iniciado")
  return worker
}

const maskPhone = (n: string) => n.slice(0,4) + "****" + n.slice(-2)
