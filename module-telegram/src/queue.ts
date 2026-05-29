// module-telegram/src/queue.ts — REESCRITO para Supabase (sem Firebase)
import { Queue, Worker, type Job } from "bullmq"
import { newRedisConnection, supabase, logger } from "@zapflow/shared"
import { sendTelegramMessage } from "./bot"
import type { DispatchJob } from "@zapflow/shared"

export const tgQueue = new Queue<DispatchJob>("zf-telegram", {
  connection: newRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 2_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail:     { count: 500 },
  },
})

export const getQueueStats = async () => ({
  waiting:   await tgQueue.getWaitingCount(),
  active:    await tgQueue.getActiveCount(),
  completed: await tgQueue.getCompletedCount(),
  failed:    await tgQueue.getFailedCount(),
})

export function startWorker() {
  const worker = new Worker<DispatchJob>(
    "zf-telegram",
    async (job: Job<DispatchJob>) => {
      const { to, message, campaignId, contactName, ownerId, tenantId } = job.data

      const ok = await sendTelegramMessage(to, message)

      // Grava log no Supabase (mesmo padrão do WhatsApp)
      await supabase.from("dispatch_logs").insert({
        campaign_id:   campaignId,
        owner_id:      ownerId,
        tenant_id:     tenantId,
        channel:       "telegram",
        to_masked:     `tg:${to}`,
        contact_name:  contactName,
        status:        ok ? "sent" : "failed",
        attempt:       job.attemptsMade + 1,
      })

      // Atualiza contador da campanha via RPC (mesmo padrão do WhatsApp)
      await supabase.rpc("telegram_increment_count", {
        p_campaign_id: campaignId,
        p_field:       ok ? "sent_count" : "fail_count",
      })

      if (!ok) throw new Error(`Falha Telegram chatId=${to}`)

      logger.info({ chatId: to, contactName }, "✓ Telegram enviado")
    },
    {
      connection: newRedisConnection(),
      concurrency: 3,
      limiter: { max: 30, duration: 1_000 },
    }
  )

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "Job Telegram falhou")
  )

  logger.info("Telegram Worker iniciado (grammy)")
  return worker
}
