/**
 * module-telegram/src/queue.ts
 * Worker de disparo Telegram — padrão idêntico ao WhatsApp
 */

import { Queue, Worker, type Job } from "bullmq"
import { newRedisConnection, supabase, logger, type DispatchJob } from "@zapflow/shared"
import { sendMessage } from "./sessionManager"

export const tgQueue = new Queue<DispatchJob>("zf-telegram", {
  connection: newRedisConnection(),
  defaultJobOptions: {
    attempts:         3,
    backoff:          { type: "exponential", delay: 3_000 },
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
      const { to, message, senderId, campaignId, contactName, ownerId, tenantId } = job.data

      const maskedTo = maskPhone(to)

      logger.info(
        { jobId: job.id, campaignId, to: maskedTo, attempt: job.attemptsMade + 1 },
        "Processando envio Telegram"
      )

      // senderId é o sessionId do chip Telegram (igual ao WhatsApp usa senderId = sessionId)
      const ok = await sendMessage(senderId, to, message)
      const field = ok ? "sent_count" : "fail_count"

      Promise.all([
        supabase.from("dispatch_logs").insert({
          campaign_id:  campaignId,
          owner_id:     ownerId,
          tenant_id:    tenantId,
          channel:      "telegram",
          to_masked:    maskedTo,
          contact_name: contactName,
          status:       ok ? "sent" : "failed",
          attempt:      job.attemptsMade + 1,
        }),
        supabase.rpc("telegram_increment_count", {
          p_campaign_id: campaignId,
          p_field:       field,
        }),
      ]).catch(err =>
        logger.warn({ campaignId, err: err?.message ?? String(err) }, "Falha silenciosa ao gravar log/contador")
      )

      if (!ok) throw new Error(`Falha no envio para ${maskedTo}`)

      logger.info({ jobId: job.id, campaignId, to: maskedTo }, "✓ Telegram enviado")
    },
    {
      connection:       newRedisConnection(),
      concurrency:      1,
      limiter:          { max: 30, duration: 60_000 },
      lockDuration:     120_000,
      stalledInterval:  30_000,
      maxStalledCount:  1,
    }
  )

  worker.on("completed", job =>
    logger.info({ jobId: job.id, campaignId: job.data.campaignId }, "Job Telegram concluído")
  )

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, campaignId: job?.data?.campaignId, err: err.message }, "Job Telegram falhou")
  )

  worker.on("error", err =>
    logger.error({ err: err.message }, "Erro interno no Worker Telegram")
  )

  logger.info("✈️  Telegram Worker iniciado (MTProto)")
  return worker
}

const maskPhone = (n: string) =>
  !n || n.length <= 6 ? "****" : n.slice(0, 4) + "****" + n.slice(-2)
