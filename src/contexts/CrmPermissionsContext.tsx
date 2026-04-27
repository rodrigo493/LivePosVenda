// src/contexts/CrmPermissionsContext.tsx
import { createContext, useContext } from "react";
import { useMyPermissions } from "@/hooks/useMyPermissions";

interface CrmPermissionsContextType {
  hasPermission: (key: string) => boolean;
  isAdmin: boolean;
}

const CrmPermissionsContext = createContext<CrmPermissionsContextType>({
  hasPermission: () => true,
  isAdmin: false,
});

export function CrmPermissionsProvider({ children }: { children: React.ReactNode }) {
  const { perms, isAdmin, loading } = useMyPermissions();

  const hasPermission = (key: string): boolean => {
    if (isAdmin) return true;
    if (loading || perms === null) return true; // permissivo enquanto carrega
    return perms.has(key);
  };

  return (
    <CrmPermissionsContext.Provider value={{ hasPermission, isAdmin }}>
      {children}
    </CrmPermissionsContext.Provider>
  );
}

export function useCrmPermissionsContext() {
  return useContext(CrmPermissionsContext);
}
