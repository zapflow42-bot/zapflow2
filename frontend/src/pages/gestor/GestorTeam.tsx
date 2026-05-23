import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "../../lib/api"
import { toast } from "sonner"
import { UserPlus, Loader2, CheckCircle, XCircle, Search } from "lucide-react"

export function GestorTeam() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ email:"", displayName:"", password:"" })
  const [role, setRole] = useState<"disparador"|"gestor">("disparador")
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useQuery({ queryKey:["users"], queryFn: () => apiFetch("/api/users") })

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch(`/api/users/${role}`, { method:"POST", body:JSON.stringify(body) }),
    onSuccess: () => { toast.success(`${role === "gestor" ? "Gestor" : "Disparador"} criado!`); qc.invalidateQueries({queryKey:["users"]}); setForm({email:"",displayName:"",password:""}); setShowForm(false) },
    onError: (e: any) => toast.error(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: (uid: string) => apiFetch(`/api/users/${uid}/toggle`, { method:"PATCH" }),
    onSuccess: () => qc.invalidateQueries({queryKey:["users"]}),
    onError: (e: any) => toast.error(e.message),
  })

  const users = (data?.users ?? []).filter((u: any) =>
    u.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Equipe</h1>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 bg-[#2ea043] hover:bg-[#238636] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <UserPlus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {showForm && (
        <div className="bg-[#161b22] border border-white/[0.07] rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Adicionar Usuário</h3>
          <div className="flex gap-2">
            {([["disparador","Disparador"],["gestor","Gestor"]] as const).map(([v,l]) => (
              <button key={v} onClick={() => setRole(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${role===v?"bg-[#2ea043] text-white":"bg-[#0d1117] text-[#7d8590] border border-white/10 hover:text-white"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["displayName","Nome","text"],["email","Email","email"],["password","Senha (mín. 8 chars)","password"]].map(([f,p,t]) => (
              <input key={f} type={t} placeholder={p} value={(form as any)[f]} onChange={e => setForm(prev => ({...prev,[f]:e.target.value}))}
                className="bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}
              className="flex items-center gap-2 bg-[#2ea043] hover:bg-[#238636] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-[#7d8590] hover:text-white px-4 py-2 rounded-lg transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7d8590]" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuário..."
          className="w-full bg-[#161b22] border border-white/[0.07] rounded-lg pl-9 pr-4 py-2.5 text-white text-sm outline-none focus:border-[#2ea043]/50" />
      </div>

      <div className="bg-[#161b22] border border-white/[0.07] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#7d8590]" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="bg-[#0d1117] border-b border-white/[0.07]">
              {["Usuário","Email","Função","Status","Ação"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-mono uppercase tracking-wider text-[#7d8590]">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-white/[0.04]">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${u.role==="gestor"?"bg-gradient-to-br from-[#bc8cff] to-[#a371f7]":"bg-gradient-to-br from-[#58a6ff] to-[#1f6feb]"}`}>
                        {u.display_name?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-white">{u.display_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#7d8590]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role==="gestor"?"bg-[#bc8cff]/20 text-[#bc8cff]":"bg-[#58a6ff]/20 text-[#58a6ff]"}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {u.active ? <CheckCircle className="w-3.5 h-3.5 text-[#3fb950]" /> : <XCircle className="w-3.5 h-3.5 text-[#f85149]" />}
                      <span className={`text-xs ${u.active?"text-[#3fb950]":"text-[#f85149]"}`}>{u.active?"ativo":"inativo"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleMutation.mutate(u.id)}
                      className={`text-xs border px-2.5 py-1 rounded-lg transition-colors ${u.active?"text-[#f85149] border-[#f85149]/20 hover:bg-[#f85149]/10":"text-[#3fb950] border-[#2ea043]/20 hover:bg-[#2ea043]/10"}`}>
                      {u.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
