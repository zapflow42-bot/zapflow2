import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "../../lib/api"
import { useAuthStore } from "../../store/authStore"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"
import { Users, Send, TrendingUp, AlertTriangle, CheckCircle, Activity } from "lucide-react"

const MOCK_AREA = [
  { day:"1",  sent:320, failed:12 },
  { day:"5",  sent:480, failed:18 },
  { day:"10", sent:290, failed:9  },
  { day:"15", sent:610, failed:22 },
  { day:"20", sent:750, failed:15 },
  { day:"25", sent:430, failed:31 },
  { day:"30", sent:820, failed:14 },
]

const MOCK_PIE = [
  { name:"WhatsApp", value:58, color:"#25d366" },
  { name:"Email",    value:22, color:"#58a6ff" },
  { name:"Telegram", value:12, color:"#229ed9" },
  { name:"SMS",      value:8,  color:"#d29922"  },
]

function StatCard({ label, value, sub, icon: Icon, color, trend }: any) {
  return (
    <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[#7d8590] font-mono uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}/15`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${color} mb-1`}>{value}</div>
      {sub && <div className="text-xs text-[#7d8590]">{sub}</div>}
      {trend && <div className={`text-xs mt-1 ${trend > 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>{trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs semana passada</div>}
    </div>
  )
}

export function GestorDashboard() {
  const { user } = useAuthStore()
  const { data: usersData } = useQuery({ queryKey:["users"], queryFn: () => apiFetch("/api/users") })
  const users = usersData?.users ?? []
  const dispatchers = users.filter((u: any) => u.role === "disparador")

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Dashboard</h1>
          <p className="text-[#7d8590] text-sm">Bem-vindo, {user?.displayName}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#7d8590]">
          <Activity className="w-3.5 h-3.5 text-[#3fb950]" />
          Sistema operacional
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Disparadores"    value={dispatchers.length}  sub="cadastrados"        icon={Users}        color="text-[#58a6ff]"  trend={5}  />
        <StatCard label="Enviados Hoje"   value="4.821"               sub="mensagens"          icon={Send}         color="text-[#3fb950]"  trend={12} />
        <StatCard label="Taxa de Entrega" value="96.2%"               sub="média do período"   icon={TrendingUp}   color="text-[#d29922]"  trend={2}  />
        <StatCard label="Em Risco"        value="1"                   sub="chips para revisar" icon={AlertTriangle} color="text-[#f85149]" trend={-1} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Area chart */}
        <div className="col-span-2 bg-[#161b22] border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Disparos do Mês</h3>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#2ea043]" />Enviados</span>
              <span className="flex items-center gap-1.5 text-[#7d8590]"><span className="w-2 h-2 rounded-full bg-[#f85149]" />Falhas</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={MOCK_AREA}>
              <defs>
                <linearGradient id="sent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2ea043" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2ea043" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="failed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f85149" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f85149" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="day" stroke="#7d8590" tick={{ fontSize: 11 }} />
              <YAxis stroke="#7d8590" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background:"#161b22", border:"1px solid #30363d", borderRadius:"8px", color:"#e6edf3" }} />
              <Area type="monotone" dataKey="sent"   stroke="#2ea043" fill="url(#sent)"   strokeWidth={2} />
              <Area type="monotone" dataKey="failed" stroke="#f85149" fill="url(#failed)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Por Canal</h3>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={MOCK_PIE} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" strokeWidth={0}>
                {MOCK_PIE.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background:"#161b22", border:"1px solid #30363d", borderRadius:"8px", color:"#e6edf3" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {MOCK_PIE.map(m => (
              <div key={m.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                  <span className="text-[#7d8590]">{m.name}</span>
                </div>
                <span className="font-mono text-white">{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team table */}
      <div className="bg-[#161b22] border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Equipe</h3>
          <span className="text-xs text-[#7d8590]">{dispatchers.length} disparadores</span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {dispatchers.length === 0 ? (
            <div className="p-8 text-center text-[#7d8590] text-sm">Nenhum disparador. Vá em Equipe para adicionar.</div>
          ) : dispatchers.map((u: any) => (
            <div key={u.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {u.display_name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white">{u.display_name}</div>
                <div className="text-xs text-[#7d8590]">{u.email}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className={`w-3.5 h-3.5 ${u.active ? "text-[#3fb950]" : "text-[#f85149]"}`} />
                <span className={`text-xs ${u.active ? "text-[#3fb950]" : "text-[#f85149]"}`}>{u.active ? "ativo" : "inativo"}</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-white">—</div>
                <div className="text-[10px] text-[#7d8590]">hoje</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
