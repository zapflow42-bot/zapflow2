import { Queue, Worker, type Job } from "bullmq"
import { redis, db, logger } from "@zapflow/shared"
import { sendTelegramMessage } from "./bot"
import type { DispatchJob } from "@zapflow/shared"

export const tgQueue = new Queue<DispatchJob>("zf-telegram", {
  connection: redis,
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
      const { to, message, campaignId, contactName, ownerId } = job.data

      // to = chat_id do Telegram
      const ok = await sendTelegramMessage(to, message)

      await db.collection("dispatch_logs").add({
        campaignId, ownerId, channel: "telegram",
        to: `tg:${to}`, contactName,
        status: ok ? "sent" : "failed",
        attempt: job.attemptsMade + 1,
        timestamp: new Date(),
      })

      await db.collection("campaigns").doc(campaignId).update({
        [(ok ? "sentCount" : "failCount")]: (await import("firebase-admin")).default.firestore.FieldValue.increment(1),
      })

      if (!ok) throw new Error(`Falha Telegram chatId=${to}`)

      logger.info({ chatId: to, contactName }, "✓ Telegram enviado")
    },
    {
      connection: redis,
      concurrency: 3,
      // Telegram: 30 msgs/s global, 1/s por conversa
      limiter: { max: 30, duration: 1_000 },
    }
  )

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "Job Telegram falhou")
  )

  logger.info("Telegram Worker iniciado (grammy)")
  return worker
}
