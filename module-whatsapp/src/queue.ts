import { Queue, Worker, type Job } from "bullmq";
import {
  newRedisConnection,
  supabase,
  logger,
  type DispatchJob,
} from "@zapflow/shared";
import { sendMessage } from "./sessionManager";

// Fila WhatsApp com Redis local e controle seguro de volume
export const waQueue = new Queue<DispatchJob>("zf-whatsapp", {
  connection: newRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 500 },
  },
});

export function startWorker() {
  const worker = new Worker<DispatchJob>(
    "zf-whatsapp",
    async (job: Job<DispatchJob>) => {
      const { to, message, senderId, campaignId, contactName, ownerId, tenantId, imageBase64, imageMime } =
        job.data;

      const maskedTo = maskPhone(to);

      logger.info(
        {
          jobId: job.id,
          campaignId,
          to: maskedTo,
          hasImage: !!imageBase64,
          attempt: job.attemptsMade + 1,
        },
        "Processando envio WhatsApp"
      );

      const ok = await sendMessage(senderId, to, message, imageBase64, imageMime);
      const field = ok ? "sent_count" : "fail_count";

      Promise.all([
        supabase.from("dispatch_logs").insert({
          campaign_id: campaignId,
          owner_id: ownerId,
          tenant_id: tenantId,
          channel: "whatsapp",
          to_masked: maskedTo,
          contact_name: contactName,
          status: ok ? "sent" : "failed",
          attempt: job.attemptsMade + 1,
        }),
        supabase.rpc("whatsapp_increment_count", {
          p_campaign_id: campaignId,
          p_field: field,
        }),
      ]).catch((err) => {
        logger.warn(
          { campaignId, err: err?.message ?? String(err) },
          "Falha silenciosa ao gravar log/contador"
        );
      });

      if (!ok) {
        throw new Error(`Falha no envio para ${maskedTo}`);
      }

      logger.info(
        {
          jobId: job.id,
          campaignId,
          to: maskedTo,
        },
        "✓ WhatsApp enviado"
      );
    },
    {
      connection: newRedisConnection(),
      concurrency: 1,
      limiter: {
        max: 30,
        duration: 60_000,
      },
      lockDuration: 120_000,
      stalledInterval: 30_000,
      maxStalledCount: 1,
    }
  );

  worker.on("completed", (job) => {
    logger.info(
      {
        jobId: job.id,
        campaignId: job.data.campaignId,
        to: maskPhone(job.data.to),
      },
      "Job WA concluído"
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        campaignId: job?.data?.campaignId,
        to: job?.data?.to ? maskPhone(job.data.to) : undefined,
        err: err.message,
      },
      "Job WA falhou"
    );
  });

  worker.on("error", (err) => {
    logger.error({ err: err.message }, "Erro interno no Worker WhatsApp");
  });

  logger.info("WhatsApp Worker iniciado com delay controlado e sem bloqueio por horário");

  return worker;
}

const maskPhone = (n: string) => {
  if (!n || n.length <= 6) return "****";
  return n.slice(0, 4) + "****" + n.slice(-2);
};

export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    waQueue.getWaitingCount(),
    waQueue.getActiveCount(),
    waQueue.getCompletedCount(),
    waQueue.getFailedCount(),
    waQueue.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}