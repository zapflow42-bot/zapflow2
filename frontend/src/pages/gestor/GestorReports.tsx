import { useState } from "react"
import { apiFetch } from "../../lib/api"
import { toast } from "sonner"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts"
import { Download, FileSpreadsheet, FileText, Bot, Loader2, TrendingUp, Send, Users, AlertTriangle } from "lucide-react"
import * as XLSX from "xlsx"

const MOCK = {
  totalSent:4821, totalFailed:192, totalReplied:1680, deliveryRate:96.2, replyRate:34.8,
  byChannel: { whatsapp:{sent:3200,failed:128,deliveryRate:96.1}, email:{sent:980,failed:32,deliveryRate:96.8}, telegram:{sent:441,failed:18,deliveryRate:96.1}, sms:{sent:200,failed:14,deliveryRate:93.5} },
  byUser:[
    {displayName:"João Silva",   sent:412,failed:16,deliveryRate:96.2,replyRate:38.1},
    {displayName:"Maria Souza",  sent:398,failed:21,deliveryRate:95.0,replyRate:29.4},
    {displayName:"Carlos Lima",  sent:387,failed:12,deliveryRate:97.0,replyRate:41.1},
    {displayName:"Ana Costa",    sent:361,failed:19,deliveryRate:95.0,replyRate:31.3},
    {displayName:"Pedro Neto",   sent:298,failed:38,deliveryRate:88.7,replyRate:22.1},
  ],
  daily:[
    {day:"Seg",sent:680,failed:27},{day:"Ter",sent:820,failed:31},{day:"Qua",sent:750,failed:19},
    {day:"Qui",sent:920,failed:22},{day:"Sex",sent:1100,failed:41},{day:"Sáb",sent:340,failed:28},{day:"Dom",sent:211,failed:24},
  ]
}

export function GestorReports() {
  const [period,  setPeriod]  = useState("month")
  const [scope,   setScope]   = useState("team")
  const [withAI,  setWithAI]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [report,  setReport]  = useState<typeof MOCK | null>(null)

  async function generate() {
    setLoading(true)
    await new Promise(r => setTimeout(r, 1400))
    setReport(MOCK)
    setLoading(false)
    toast.success("Relatório gerado!")
  }

  function exportCSV() {
    if (!report) return
    const rows = [
      ["Canal","Enviados","Falhas","Taxa Entrega"],
      ...Object.entries(report.byChannel).map(([ch,m]) => [ch,m.sent,m.failed,`${m.deliveryRate.toFixed(1)}%`]),
      [],["Disparador","Enviados","Falhas","Entrega","Resposta"],
      ...report.byUser.map(u => [u.displayName,u.sent,u.failed,`${u.deliveryRate.toFixed(1)}%`,`${u.replyRate.toFixed(1)}%`]),
    ]
    const csv = "\uFEFF" + rows.map(r => r.join(",")).join("\n")
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv"}))
    a.download = `relatorio-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    toast.success("CSV exportado!")
  }

  function exportExcel() {
    if (!report) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["ZapFlow — Relatório"],[""],["Métrica","Valor"],
      ["Total Enviados",report.totalSent],["Total Falhas",report.totalFailed],
      ["Taxa de Entrega",`${report.deliveryRate.toFixed(1)}%`],["Taxa de Resposta",`${report.replyRate.toFixed(1)}%`],
    ]), "Resumo")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Canal","Enviados","Falhas","Taxa Entrega"],
      ...Object.entries(report.byChannel).map(([ch,m]) => [ch,m.sent,m.failed,`${m.deliveryRate.toFixed(1)}%`])
    ]), "Por Canal")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Disparador","Enviados","Falhas","Entrega","Resposta"],
      ...report.byUser.map(u => [u.displayName,u.sent,u.failed,`${u.deliveryRate.toFixed(1)}%`,`${u.replyRate.toFixed(1)}%`])
    ]), "Por Disparador")
    XLSX.writeFile(wb, `relatorio-${new Date().toISOString().slice(0,10)}.xlsx`)
    toast.success("Excel exportado!")
  }

  const pieData = Object.entries(MOCK.byChannel).map(([name,v],i) => ({
    name, value: v.sent, color:["#25d366","#58a6ff","#229ed9","#d29922"][i]
  }))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-bold text-white">Relatórios</h1>

      {/* Filters */}
      <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-[#7d8590] mb-1.5 font-mono uppercase">Escopo</label>
            <select value={scope} onChange={e => setScope(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50">
              <option value="team">Equipe toda</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#7d8590] mb-1.5 font-mono uppercase">Período</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50">
              <option value="week">Últimos 7 dias</option>
              <option value="3weeks">Últimas 3 semanas</option>
              <option value="month">Últimos 30 dias</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer mb-0.5">
              <div onClick={() => setWithAI(s=>!s)} className={`w-9 h-5 rounded-full transition-all relative ${withAI?"bg-[#bc8cff]":"bg-[#30363d]"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${withAI?"left-4":"left-0.5"}`} />
              </div>
              <span className="text-sm text-white">Análise da IA</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={generate} disabled={loading}
            className="flex items-center gap-2 bg-[#2ea043] hover:bg-[#238636] disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
            {loading ? "Gerando..." : "Gerar Relatório"}
          </button>
          {report && (
            <>
              <button onClick={exportCSV} className="flex items-center gap-1.5 text-sm text-[#7d8590] hover:text-white border border-white/10 hover:border-white/20 px-3 py-2.5 rounded-lg transition-colors">
                <Download className="w-4 h-4" /> CSV
              </button>
              <button onClick={exportExcel} className="flex items-center gap-1.5 text-sm text-[#3fb950] border border-[#2ea043]/30 hover:bg-[#2ea043]/10 px-3 py-2.5 rounded-lg transition-colors">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button className="flex items-center gap-1.5 text-sm text-[#7d8590] hover:text-white border border-white/10 hover:border-white/20 px-3 py-2.5 rounded-lg transition-colors">
                <FileText className="w-4 h-4" /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {report && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              {label:"Total Enviados",  value:report.totalSent.toLocaleString("pt-BR"),   color:"text-[#3fb950]",   icon:Send},
              {label:"Total Falhas",    value:report.totalFailed.toLocaleString("pt-BR"),  color:"text-[#f85149]",   icon:AlertTriangle},
              {label:"Taxa de Entrega", value:`${report.deliveryRate.toFixed(1)}%`,         color:"text-[#d29922]",   icon:TrendingUp},
              {label:"Taxa de Resposta",value:`${report.replyRate.toFixed(1)}%`,            color:"text-[#bc8cff]",   icon:Users},
            ].map(s => (
              <div key={s.label} className="bg-[#161b22] border border-white/[0.07] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-[#7d8590] font-mono uppercase tracking-wider">{s.label}</span>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-[#161b22] border border-white/[0.07] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Disparos por Dia</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={report.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                  <XAxis dataKey="day" stroke="#7d8590" tick={{fontSize:11}} />
                  <YAxis stroke="#7d8590" tick={{fontSize:11}} />
                  <Tooltip contentStyle={{background:"#161b22",border:"1px solid #30363d",borderRadius:"8px",color:"#e6edf3"}} />
                  <Bar dataKey="sent"   fill="#2ea043" radius={[4,4,0,0]} />
                  <Bar dataKey="failed" fill="#f85149" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Distribuição</h3>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                    {pieData.map((e,i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{background:"#161b22",border:"1px solid #30363d",borderRadius:"8px",color:"#e6edf3"}} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map(m => (
                  <div key={m.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{background:m.color}} />
                      <span className="text-[#7d8590] capitalize">{m.name}</span>
                    </div>
                    <span className="font-mono text-white">{m.value.toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* By user table */}
          <div className="bg-[#161b22] border border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.07]">
              <h3 className="text-sm font-semibold text-white">Por Disparador</h3>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-[#0d1117]">
                {["Disparador","Enviados","Falhas","Taxa Entrega","Taxa Resposta","Status"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-[#7d8590]">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-white/[0.04]">
                {report.byUser.map((u,i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{u.displayName}</td>
                    <td className="px-4 py-3 font-mono text-[#3fb950]">{u.sent.toLocaleString("pt-BR")}</td>
                    <td className={`px-4 py-3 font-mono ${u.failed > 30 ? "text-[#f85149]" : "text-[#7d8590]"}`}>{u.failed}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${u.deliveryRate>95?"bg-[#2ea043]":u.deliveryRate>88?"bg-[#d29922]":"bg-[#f85149]"}`}
                            style={{width:`${u.deliveryRate}%`}} />
                        </div>
                        <span className="text-xs font-mono text-[#7d8590]">{u.deliveryRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-[#7d8590]">{u.replyRate.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.deliveryRate>95?"bg-[#2ea043]/20 text-[#3fb950]":u.deliveryRate>88?"bg-[#d29922]/20 text-[#d29922]":"bg-[#f85149]/20 text-[#f85149]"}`}>
                        {u.deliveryRate>95?"Ótimo":u.deliveryRate>88?"Regular":"Atenção"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {withAI && (
            <div className="bg-[#bc8cff]/10 border border-[#bc8cff]/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#bc8cff]" />
                <span className="text-sm font-semibold text-white">Análise da IA</span>
                <span className="text-xs text-[#bc8cff] bg-[#bc8cff]/15 px-2 py-0.5 rounded-full">Claude Sonnet</span>
              </div>
              <p className="text-sm text-[#e6edf3] leading-7">
                A equipe manteve uma <strong className="text-white">taxa de entrega sólida de 96.2%</strong>. Destaque para <strong className="text-white">Carlos Lima</strong> com 97% de entrega e maior taxa de resposta.<br/><br/>
                ⚠️ <strong className="text-[#f85149]">Pedro Neto em zona de risco</strong> — taxa de falha de 11.3%, acima do limite seguro de 8%. Recomendo revisar a qualidade da lista e pausar o chip para aquecimento.
              </p>
              <div className="space-y-1.5">
                <div className="text-xs font-mono text-[#bc8cff] uppercase tracking-wider">Insights proativos</div>
                {["Quinta-feira 10h–12h tem 41% mais respostas — concentrar disparos nesse horário","Carlos Lima tem template com 2.1× mais resposta — padronizar para a equipe","Pedro Neto: intervir imediatamente antes de ban"].map((ins,i) => (
                  <div key={i} className="flex gap-2 text-xs text-[#7d8590]">
                    <span className="text-[#bc8cff] flex-shrink-0">→</span> {ins}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
