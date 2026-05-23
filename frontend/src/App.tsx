import { useEffect } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { supabase } from "./lib/supabase"
import { useAuthStore } from "./store/authStore"
import { LoginPage } from "./pages/LoginPage"
import { GestorLayout } from "./pages/gestor/GestorLayout"
import { DisparadorLayout } from "./pages/disparador/DisparadorLayout"

function RequireAuth({ children, role }: { children: React.ReactNode; role?: string }) {
  const { user, loading } = useAuthStore()
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0d1117]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#2ea043]/30 border-t-[#2ea043] rounded-full animate-spin" />
        <span className="text-[#7d8590] text-sm">Carregando...</span>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const m = session.user.user_metadata
        setUser({ uid:session.user.id, email:session.user.email!, displayName:m?.displayName??session.user.email!, role:m?.role, tenantId:m?.tenantId })
      }
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) {
        const m = session.user.user_metadata
        setUser({ uid:session.user.id, email:session.user.email!, displayName:m?.displayName??session.user.email!, role:m?.role, tenantId:m?.tenantId })
      } else {
        setUser(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/gestor/*"     element={<RequireAuth role="gestor"><GestorLayout /></RequireAuth>} />
      <Route path="/disparador/*" element={<RequireAuth role="disparador"><DisparadorLayout /></RequireAuth>} />
      <Route path="/" element={<RedirectByRole />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function RedirectByRole() {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === "gestor" ? "/gestor" : "/disparador"} replace />
}
