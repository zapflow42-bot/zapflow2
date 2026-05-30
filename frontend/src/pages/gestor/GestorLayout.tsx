import { Routes, Route, NavLink, useNavigate } from "react-router-dom"
import { useAuthStore } from "../../store/authStore"
import {
  LayoutDashboard, Users, BarChart3, Bot, LogOut, Zap,
  Send, Smartphone, ChevronDown
} from "lucide-react"
import { useState } from "react"
import { GestorDashboard } from "./GestorDashboard"
import { GestorTeam } from "./GestorTeam"
import { GestorReports } from "./GestorReports"
import { GestorAI } from "./GestorAI"
import { DispatchPage } from "../shared/DispatchPage"
import { ChannelsPage } from "../shared/ChannelsPage"

const navItems = [
  { to: "/gestor",             icon: LayoutDashboard, label: "Dashboard",    end: true },
  { to: "/gestor/disparar",    icon: Send,            label: "Disparar"              },
  { to: "/gestor/canais",      icon: Smartphone,      label: "Canais"                },
  { to: "/gestor/equipe",      icon: Users,           label: "Equipe"                },
  { to: "/gestor/relatorios",  icon: BarChart3,       label: "Relatórios"            },
  { to: "/gestor/ia",          icon: Bot,             label: "IA Analista"           },
]

export function GestorLayout() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-60"} transition-all duration-200 bg-[#161b22] border-r border-white/[0.07] flex flex-col flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-3 p-4 border-b border-white/[0.07] h-14">
          <div className="w-7 h-7 bg-[#2ea043] rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="font-bold text-white text-sm">ZapFlow</span>}
          <button onClick={() => setCollapsed(s => !s)} className="ml-auto text-[#7d8590] hover:text-white transition-colors">
            <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
          </button>
        </div>

        {/* User info */}
        {!collapsed && (
          <div className="px-4 py-3 border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#2ea043] to-[#1a7f37] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {user?.displayName?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white truncate">{user?.displayName}</div>
                <div className="text-[10px] text-[#2ea043] font-mono">GESTOR</div>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all
                ${isActive
                  ? "bg-[#2ea043]/15 text-[#3fb950] border border-[#2ea043]/20"
                  : "text-[#7d8590] hover:text-[#e6edf3] hover:bg-white/[0.04]"}`
              }>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && item.label}
            </NavLink>
          ))}
        </nav>

        {/* Status dos módulos */}
        {!collapsed && (
          <div className="px-3 pb-2">
            <div className="bg-[#0d1117] rounded-lg p-2 space-y-1">
              <div className="text-[10px] text-[#7d8590] font-mono uppercase mb-1.5 px-1">Módulos</div>
              {[
                { name: "WhatsApp", color: "bg-[#3fb950]" },
                { name: "Email",    color: "bg-[#3fb950]" },
                { name: "Telegram", color: "bg-[#3fb950]" },
                { name: "SMS",      color: "bg-[#d29922]" },
              ].map(m => (
                <div key={m.name} className="flex items-center gap-2 px-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${m.color}`} />
                  <span className="text-xs text-[#7d8590]">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={async () => { await signOut(); navigate("/login") }}
          title={collapsed ? "Sair" : undefined}
          className="m-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#7d8590] hover:text-[#f85149] hover:bg-[#f85149]/10 transition-colors">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && "Sair"}
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<GestorDashboard />} />
          <Route path="disparar"   element={<DispatchPage />} />
          <Route path="canais"     element={<ChannelsPage />} />
          <Route path="equipe"     element={<GestorTeam />} />
          <Route path="relatorios" element={<GestorReports />} />
          <Route path="ia"         element={<GestorAI />} />
        </Routes>
      </main>
    </div>
  )
}