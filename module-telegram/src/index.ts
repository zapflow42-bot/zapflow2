import "dotenv/config"
import express from "express"
import { router } from "./routes"
import { startWorker } from "./queue"
import { getBot } from "./bot"

const app  = express()
const PORT = process.env.PORT ?? 4003

app.use(express.json({ limit: "5mb" }))
app.use("/", router)

app.listen(PORT, () => {
  console.log(`✈️  Module Telegram (grammy) → http://localhost:${PORT}`)
  getBot()         // inicializa o bot (long polling ou webhook)
  startWorker()    // inicia o worker de disparo
})
