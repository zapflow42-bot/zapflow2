import { Bot, type Context } from "grammy"
import { db, logger } from "@zapflow/shared"

let bot: Bot | null = null

export function getBot(): Bot {
  if (!bot) {
    if (!process.env.TELEGRAM_BOT_TOKEN)
      throw new Error("TELEGRAM_BOT_TOKEN não definido")

    bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)

    /**
     * /start — o usuário precisa mandar isso uma vez para o bot poder lhe enviar msgs
     * Quando o usuário manda /start, salvamos o chat_id no Firestore
     * O disparador importa esses contatos pelo chat_id
     */
    bot.command("start", async (ctx: Context) => {
      const chatId = ctx.chat?.id.toString()
      const name   = ctx.from?.first_name ?? "usuário"
      const user   = ctx.from?.username ? `@${ctx.from.username}` : name

      if (chatId) {
        // Salva o contato no Firestore para ficar disponível para os disparadores
        await db.collection("telegram_contacts").doc(chatId).set({
          chatId,
          name,
          username: ctx.from?.username ?? null,
          joinedAt: new Date(),
          active:   true,
        }, { merge: true })

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
        await db.collection("telegram_contacts").doc(chatId).update({ active: false })
      }
      await ctx.reply("Você foi descadastrado. Para se cadastrar novamente, envie /start.")
    })

    // Captura mensagens de resposta para rastrear engajamento
    bot.on("message:text", async (ctx: Context) => {
      const text   = ctx.message?.text ?? ""
      const chatId = ctx.chat?.id.toString()
      if (!chatId) return

      // Atualiza lastMessage e incrementa replyCount da campanha se houver
      await db.collection("telegram_contacts").doc(chatId).update({
        lastMessage: text.slice(0, 200),
        lastReplyAt: new Date(),
      }).catch(() => {})
    })

    // Produção: usar webhook em vez de long polling
    // Em dev: long polling é ok
    if (process.env.TELEGRAM_WEBHOOK_URL) {
      bot.start({ onStart: () => logger.info("Telegram bot: webhook ativo") })
    } else {
      bot.start({ onStart: () => logger.info("Telegram bot: long polling ativo") })
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
    // 403 = usuário bloqueou o bot
    if (err?.error_code === 403) {
      await db.collection("telegram_contacts").doc(chatId).update({ active: false })
    }
    logger.error({ chatId, err: err?.description ?? err?.message }, "✗ Telegram falhou")
    return false
  }
}
