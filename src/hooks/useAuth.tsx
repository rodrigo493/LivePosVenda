import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types/database";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isStaff: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_roles");
      if (!error && data) setRoles(data as AppRole[]);
    } finally {
      setRolesLoading(false);
    }
  };

  useEffect(() => {
    // Usa apenas onAuthStateChange como fonte de verdade para evitar
    // chamadas duplicadas de fetchRoles (getSession + onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles();
      } else {
        setRoles([]);
        setRolesLoading(false);
      }
      setLoading(false);
    });

    // Dispara a sessão inicial manualmente (onAuthStateChange pode não disparar INITIAL_SESSION em todos os ambientes)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setRolesLoading(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.protocol}//${window.location.host}` },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setRolesLoading(false);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isStaff = () => roles.some((r) => r !== "cliente");

  return (
    <AuthContext.Provider value={{ user, session, roles, loading, rolesLoading, signIn, signUp, signOut, hasRole, isStaff }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
