import "dotenv/config"
import express from "express"
import { router } from "./routes"
import { startWorker } from "./queue"

const app  = express()
const PORT = process.env.PORT ?? 4003

app.use(express.json({ limit: "5mb" }))
app.use("/", router)

app.listen(PORT, () => {
  console.log(`✈️  Module Telegram MTProto → http://localhost:${PORT}`)
  startWorker()
})
