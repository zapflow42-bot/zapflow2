import "dotenv/config"
import express from "express"
import { router } from "./routes"
import { startWorker } from "./queue"

const app  = express()
const PORT = process.env.PORT ?? 4001

app.use(express.json({ limit: "5mb" }))
app.use("/", router)

app.listen(PORT, () => {
  console.log(`📱 Module WhatsApp → http://localhost:${PORT}`)
  startWorker()   // inicia o worker de disparo no mesmo processo
})
