import { Queue, Worker, type Job } from "bullmq"
import { redis, db, logger } from "@zapflow/shared"
import { sendEmail } from "./brevoService"
import type { DispatchJob } from "@zapflow/shared"

export const emailQueue = new Queue<DispatchJob>("zf-email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail:     { count: 500 },
  },
})

export const getQueueStats = async () => ({
  waiting:   await emailQueue.getWaitingCount(),
  active:    await emailQueue.getActiveCount(),
  completed: await emailQueue.getCompletedCount(),
  failed:    await emailQueue.getFailedCount(),
})

export function startWorker() {
  const worker = new Worker<DispatchJob>(
    "zf-email",
    async (job: Job<DispatchJob>) => {
      const { to, message, subject, campaignId, contactName, ownerId } = job.data

      const ok = await sendEmail({
        to,
        name:    contactName,
        subject: subject ?? "Mensagem importante",
        text:    message,
      })

      await db.collection("dispatch_logs").add({
        campaignId, ownerId, channel: "email",
        to: maskEmail(to), contactName,
        status: ok ? "sent" : "failed",
        attempt: job.attemptsMade + 1,
        timestamp: new Date(),
      })

      await db.collection("campaigns").doc(campaignId).update({
        [(ok ? "sentCount" : "failCount")]: (await import("firebase-admin")).default.firestore.FieldValue.increment(1),
      })

      if (!ok) throw new Error(`Falha ao enviar email para ${maskEmail(to)}`)
    },
    {
      connection: redis,
      concurrency: 5,    // email suporta mais concorrência que WhatsApp
      limiter: { max: 100, duration: 60_000 },  // 100 emails/min (Brevo free: 300/dia)
    }
  )

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "Job Email falhou")
  )

  logger.info("Email Worker iniciado (Brevo)")
  return worker
}

const maskEmail = (e: string) => {
  const [u, d] = e.split("@"); return `${u.slice(0,2)}***@${d}`
}
