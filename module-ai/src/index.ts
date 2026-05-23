import "dotenv/config"
import express from "express"
import { router } from "./routes"

const app  = express()
const PORT = process.env.PORT ?? 4004

app.use(express.json({ limit: "1mb" }))
app.use("/", router)

app.listen(PORT, () => console.log(`🤖 Module AI (Claude) → http://localhost:${PORT}`))
