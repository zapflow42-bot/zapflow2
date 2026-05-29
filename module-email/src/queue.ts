// module-email/src/queue.ts — REESCRITO para Supabase (sem Firebase)
import { Queue, Worker, type Job } from "bullmq"
import { newRedisConnection, supabase, logger } from "@zapflow/shared"
import { sendEmail } from "./brevoService"
import type { DispatchJob } from "@zapflow/shared"

export const emailQueue = new Queue<DispatchJob>("zf-email", {
  connection: newRedisConnection(),
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
      const { to, message, subject, campaignId, contactName, ownerId, tenantId } = job.data

      const ok = await sendEmail({
        to,
        name:    contactName,
        subject: subject ?? "Mensagem importante",
        text:    message,
      })

      // Grava log no Supabase
      await supabase.from("dispatch_logs").insert({
        campaign_id:  campaignId,
        owner_id:     ownerId,
        tenant_id:    tenantId,
        channel:      "email",
        to_masked:    maskEmail(to),
        contact_name: contactName,
        status:       ok ? "sent" : "failed",
        attempt:      job.attemptsMade + 1,
      })

      // Atualiza contador da campanha via RPC
      await supabase.rpc("email_increment_count", {
        p_campaign_id: campaignId,
        p_field:       ok ? "sent_count" : "fail_count",
      })

      if (!ok) throw new Error(`Falha ao enviar email para ${maskEmail(to)}`)

      logger.info({ to: maskEmail(to), contactName }, "✓ Email enviado")
    },
    {
      connection: newRedisConnection(),
      concurrency: 5,
      limiter: { max: 100, duration: 60_000 },
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
