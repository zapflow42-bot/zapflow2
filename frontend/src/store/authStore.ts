import { create } from "zustand"
import { supabase } from "../lib/supabase"

interface User {
  uid: string
  email: string
  displayName: string
  role: "gestor" | "disparador"
  tenantId: string
}

interface AuthState {
  user: User | null
  loading: boolean
  setUser: (u: User | null) => void
  setLoading: (v: boolean) => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user:    null,
  loading: true,
  setUser:    (user)    => set({ user }),
  setLoading: (loading) => set({ loading }),
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null })
  },
}))
