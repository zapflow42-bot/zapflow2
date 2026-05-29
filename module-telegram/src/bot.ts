// module-telegram/src/bot.ts — REESCRITO para Supabase (sem Firebase)
import { Bot, type Context } from "grammy"
import { supabase, logger } from "@zapflow/shared"

let bot: Bot | null = null
let botStarted = false

export function getBot(): Bot {
  if (!bot) {
    if (!process.env.TELEGRAM_BOT_TOKEN)
      throw new Error("TELEGRAM_BOT_TOKEN não definido")

    bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)

    bot.command("start", async (ctx: Context) => {
      const chatId = ctx.chat?.id.toString()
      const name   = ctx.from?.first_name ?? "usuário"
      const user   = ctx.from?.username ? `@${ctx.from.username}` : name

      if (chatId) {
        await supabase.from("telegram_contacts").upsert({
          chat_id:    chatId,
          name,
          username:   ctx.from?.username ?? null,
          joined_at:  new Date().toISOString(),
          active:     true,
        }, { onConflict: "chat_id" })

        logger.info({ chatId, name }, "Novo contato Telegram via /start")
      }

      await ctx.reply(
        `Olá, ${user}! 👋\n\n` +
        `Você está cadastrado para receber novidades e ofertas.\n` +
        `Para parar de receber, envie /parar.`,
        { parse_mode: "HTML" }
      )
    })

    bot.command("parar", async (ctx: Context) => {
      const chatId = ctx.chat?.id.toString()
      if (chatId) {
        await supabase.from("telegram_contacts")
          .update({ active: false })
          .eq("chat_id", chatId)
      }
      await ctx.reply("Você foi descadastrado. Para se cadastrar novamente, envie /start.")
    })

    bot.on("message:text", async (ctx: Context) => {
      const text   = ctx.message?.text ?? ""
      const chatId = ctx.chat?.id.toString()
      if (!chatId) return

      await supabase.from("telegram_contacts")
        .update({
          last_message:  text.slice(0, 200),
          last_reply_at: new Date().toISOString(),
        })
        .eq("chat_id", chatId)
    })
  }

  if (!botStarted) {
    botStarted = true
    if (process.env.TELEGRAM_WEBHOOK_URL) {
      bot.start({ onStart: () => logger.info("Telegram bot: webhook ativo") })
    } else {
      bot.start({
        onStart: () => logger.info("Telegram bot: long polling ativo"),
        drop_pending_updates: true,
      })
    }
  }

  return bot
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  try {
    const b = getBot()
    await b.api.sendMessage(Number(chatId), text, { parse_mode: "HTML" })
    return true
  } catch (err: any) {
    if (err?.error_code === 403) {
      await supabase.from("telegram_contacts")
        .update({ active: false })
        .eq("chat_id", chatId)
    }
    logger.error({ chatId, err: err?.description ?? err?.message }, "✗ Telegram falhou")
    return false
  }
}
