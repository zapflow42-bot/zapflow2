// ── Roles ─────────────────────────────────────────
export type Role        = "gestor" | "disparador"
export type ChannelType = "whatsapp" | "email" | "telegram"
export type JobStatus   = "waiting" | "active" | "completed" | "failed"

// ── Usuários ──────────────────────────────────────
export interface AppUser {
  uid: string; email: string; displayName: string
  role: Role; tenantId: string; active: boolean
  createdAt: Date
  stats: { sentToday: number; sentThisMonth: number; failRate: number; activeCampaigns: number }
}

// ── Números WhatsApp ──────────────────────────────
export type NumberStatus = "connected" | "disconnected" | "banned" | "pending_qr"
export interface WhatsAppNumber {
  id: string; ownerId: string; phoneNumber: string; alias: string
  status: NumberStatus; sentToday: number; dailyLimit: number
  sessionId: string; createdAt: Date; lastConnected: Date | null
}

// ── Contatos ──────────────────────────────────────
export type ContactStatus = "pending" | "sent" | "failed" | "replied"
export interface Contact {
  id: string; ownerId: string; phoneNumber: string
  email?: string; telegramChatId?: string
  name: string; status: ContactStatus; campaignId?: string
}

// ── Campanhas ─────────────────────────────────────
export type CampaignStatus = "draft"|"running"|"paused"|"completed"|"stopped"
export interface Campaign {
  id: string; ownerId: string; name: string; template: string
  channelType: ChannelType; senderId: string; status: CampaignStatus
  totalContacts: number; sentCount: number; failCount: number; replyCount: number
  delayMin: number; delayMax: number; activeHours: number[]
  subject?: string   // só para email
  createdAt: Date; startedAt: Date | null; completedAt: Date | null
}

// ── Jobs de fila ──────────────────────────────────
export interface DispatchJob {
  jobId: string; campaignId: string; ownerId: string
  tenantId: string; // <--- ADICIONADO: Campo obrigatório para o multi-tenancy
  to: string           // número, email ou chatId dependendo do canal
  contactName: string; message: string; senderId: string
  channelType: ChannelType; subject?: string; attempt: number
}

// ── Saúde dos módulos ─────────────────────────────
export type ModuleStatus = "ok" | "degraded" | "down"
export interface ModuleHealth {
  name: string; url: string; status: ModuleStatus
  latencyMs: number | null; lastCheck: string
}