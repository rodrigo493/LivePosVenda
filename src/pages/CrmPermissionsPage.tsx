import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAllUsers } from "@/hooks/useUserAccess";
import { useCrmModulePermissions, useSaveCrmPermissions } from "@/hooks/useCrmPermissions";
import { CRM_MODULES, CRM_SECTIONS } from "@/lib/crmModules";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const CrmPermissionsPage = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasRole("admin")) navigate("/");
  }, [hasRole, navigate]);

  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { data: userPerms } = useCrmModulePermissions(selectedUserId);
  const savePerms = useSaveCrmPermissions();

  useEffect(() => {
    if (userPerms !== undefined) {
      setChecked(new Set(userPerms));
    }
  }, [userPerms, selectedUserId]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSection(section: string) {
    const sectionKeys = CRM_MODULES.filter((m) => m.section === section).map((m) => m.key);
    const allChecked = sectionKeys.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        sectionKeys.forEach((k) => next.delete(k));
      } else {
        sectionKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function handleSave() {
    if (!selectedUserId) return;
    savePerms.mutate({ userId: selectedUserId, grantedKeys: [...checked] });
  }

  const selectedUser = users.find((u) => u.user_id === selectedUserId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissões CRM"
        description="Controle quais módulos cada usuário pode acessar"
        icon={Shield}
      />

      <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[400px]">
        {/* Painel de usuários */}
        <div className="w-64 flex-shrink-0 border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuários</p>
          </div>
          <ScrollArea className="h-full">
            {usersLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum usuário encontrado</div>
            ) : (
              users.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => setSelectedUserId(u.user_id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 transition-colors hover:bg-muted/50 ${
                    selectedUserId === u.user_id ? "bg-primary/10 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-primary">
                      {getInitials(u.full_name || u.email)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Painel de módulos */}
        <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card flex flex-col">
          {!selectedUserId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione um usuário para gerenciar as permissões
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Permissões de{" "}
                  <span className="text-foreground font-medium">
                    {selectedUser?.full_name || selectedUser?.email}
                  </span>
                </p>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={savePerms.isPending}
                  className="h-8"
                >
                  {savePerms.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-5 space-y-6">
                  {CRM_SECTIONS.map((section) => {
                    const modules = CRM_MODULES.filter((m) => m.section === section);
                    const allChecked = modules.every((m) => checked.has(m.key));

                    return (
                      <div key={section}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {section}
                          </span>
                          <button
                            onClick={() => toggleSection(section)}
                            className="text-xs text-primary hover:underline"
                          >
                            {allChecked ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {modules.map((m) => (
                            <button
                              key={m.key}
                              onClick={() => toggle(m.key)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                                checked.has(m.key)
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                              }`}
                            >
                              <div
                                className={`h-4 w-4 rounded flex items-center justify-center border flex-shrink-0 ${
                                  checked.has(m.key)
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {checked.has(m.key) && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrmPermissionsPage;
