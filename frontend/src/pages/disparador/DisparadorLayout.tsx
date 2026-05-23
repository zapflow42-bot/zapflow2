import { Routes, Route, NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import { Send, Smartphone, BarChart3, LogOut, Zap, ChevronDown } from "lucide-react"
import { useState } from "react"
import { DispatchPage } from "../shared/DispatchPage"
import { ChannelsPage } from "../shared/ChannelsPage"
import { DisparadorReports } from "./DisparadorReports"

const navItems = [
  { to: "/disparador",            icon: Send,        label: "Disparar",    end: true },
  { to: "/disparador/canais",     icon: Smartphone,  label: "Meus Canais"           },
  { to: "/disparador/relatorios", icon: BarChart3,   label: "Meus Relatórios"       },
]

export function DisparadorLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      <aside className={`${collapsed ? "w-16" : "w-60"} transition-all duration-200 bg-[#161b22] border-r border-white/[0.07] flex flex-col flex-shrink-0`}>
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.07] h-14">
          <div className="w-7 h-7 bg-[#2ea043] rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="font-bold text-white text-sm">ZapFlow</span>}
          <button onClick={() => setCollapsed(s => !s)} className="ml-auto text-[#7d8590] hover:text-white transition-colors">
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
          </button>
        </div>

        {!collapsed && (
          <div className="px-4 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] flex items-center justify-center text-xs font-bold text-white">
                {user?.displayName?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{user?.displayName}</div>
                <div className="text-[10px] text-[#58a6ff] font-mono">DISPARADOR</div>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                ${isActive ? "bg-[#2ea043]/15 text-[#3fb950] border border-[#2ea043]/20" : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-white/[0.04]"}`
              }>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        <button onClick={async () => { await signOut(); navigate("/login") }}
          className="m-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#7d8590] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && "Sair"}
        </button>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<DispatchPage />} />
          <Route path="canais"     element={<ChannelsPage />} />
          <Route path="relatorios" element={<DisparadorReports />} />
        </Routes>
      </main>
    </div>
  )
}
