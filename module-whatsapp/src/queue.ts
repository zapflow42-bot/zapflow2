import { Queue, Worker, type Job } from "bullmq";
import { newRedisConnection, redis, supabase, logger, type DispatchJob } from "@zapflow/shared";
import { sendMessage } from "./sessionManager";

// Configuração da fila usando o Factory Pattern
export const waQueue = new Queue<DispatchJob>("zf-whatsapp", {
  connection: newRedisConnection(), 
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3_000 },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 500 },
  },
});

async function getCampaignActiveHours(campaignId: string): Promise<number[]> {
  const cacheKey = `camp_hours:${campaignId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { data } = await supabase.from("campaigns").select("active_hours").eq("id", campaignId).single();
  const hours = data?.active_hours ?? [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  
  await redis.set(cacheKey, JSON.stringify(hours), "EX", 300);
  return hours;
}

export function startWorker() {
  const worker = new Worker<DispatchJob>(
    "zf-whatsapp",
    async (job: Job<DispatchJob>) => {
      const { to, message, senderId, campaignId, contactName, ownerId, tenantId } = job.data;
      const maskedTo = maskPhone(to);

      const hour = new Date().getHours();
      const hours = await getCampaignActiveHours(campaignId);

      if (!hours.includes(hour)) {
        logger.info({ to: maskedTo, hour }, "Fora do horário, atrasando job");
        await job.moveToDelayed(Date.now() + 10 * 60_000);
        return;
      }

      const ok = await sendMessage(senderId, to, message);
      const field = ok ? "sent_count" : "fail_count";

      // Gravação assíncrona
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
        supabase.rpc("whatsapp_increment_count", { p_campaign_id: campaignId, p_field: field })
      ]).catch(err => {
        logger.warn({ campaignId, err: err.message }, "Falha silenciosa ao gravar log/contador");
      });

      if (!ok) throw new Error(`Falha no envio para ${maskedTo}`);
      
      logger.info({ to: maskedTo }, "✓ WhatsApp enviado");
    },
    { 
      connection: newRedisConnection(), // Conexão dedicada para o Worker
      concurrency: 1, 
      limiter: { max: 30, duration: 60_000 } 
    }
  );

  worker.on("failed", (job, err) => 
    logger.error({ jobId: job?.id, err: err.message }, "Job WA falhou permanentemente")
  );

  logger.info("WhatsApp Worker iniciado com Factory Pattern");
  return worker;
}

const maskPhone = (n: string) => n.slice(0, 4) + "****" + n.slice(-2);