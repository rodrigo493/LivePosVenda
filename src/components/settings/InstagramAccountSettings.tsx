import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { CheckCircle, AlertCircle, RefreshCw, Unlink } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const INSTAGRAM_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID;
const REDIRECT_URI = `${window.location.origin}/configuracoes?tab=instagram`;
const OAUTH_URL = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=instagram_business_basic,instagram_manage_comments,instagram_manage_messages&response_type=code`;

async function callOAuth(code: string) {
  const { data: session } = await supabase.auth.getSession();
  const token = session?.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/instagram-oauth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro ao conectar");
  return data;
}

export function InstagramAccountSettings() {
  const qc = useQueryClient();

  const { data: account, isLoading } = useQuery({
    queryKey: ["instagram_account"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("instagram_account")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const connectMut = useMutation({
    mutationFn: (code: string) => callOAuth(code),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram_account"] });
      toast.success("Conta Instagram conectada com sucesso!");
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("instagram_account")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram_account"] });
      toast.success("Conta desconectada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const tab = url.searchParams.get("tab");
    if (code && tab === "instagram" && !connectMut.isPending) {
      connectMut.mutate(code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tokenExpiresAt = account?.token_expires_at ? new Date(account.token_expires_at) : null;
  const daysLeft = tokenExpiresAt
    ? Math.floor((tokenExpiresAt.getTime() - Date.now()) / 86400000)
    : null;

  if (isLoading) return <p className="text-xs text-muted-foreground">Carregando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ChannelIcon channel="instagram" size={18} />
        <h3 className="font-semibold text-sm">Instagram Business</h3>
      </div>

      {account ? (
        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
          <div className="flex items-center gap-3">
            {account.picture_url ? (
              <img src={account.picture_url} className="h-10 w-10 rounded-full" alt="Instagram" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-orange-400 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                IG
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">@{account.username}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Conectado
              </p>
            </div>
          </div>

          {daysLeft !== null && (
            <p className={`text-xs flex items-center gap-1 ${daysLeft < 10 ? "text-orange-500" : "text-muted-foreground"}`}>
              {daysLeft < 10 && <AlertCircle className="h-3 w-3" />}
              Token expira em {daysLeft} dias
            </p>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              onClick={() => window.location.href = OAUTH_URL}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Renovar token
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => disconnectMut.mutate()}
              disabled={disconnectMut.isPending}
            >
              <Unlink className="h-3.5 w-3.5" />
              Desconectar
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-lg border border-dashed text-center space-y-3">
          <ChannelIcon channel="instagram" size={32} className="mx-auto" />
          <div>
            <p className="text-sm font-medium">Conta não conectada</p>
            <p className="text-xs text-muted-foreground mt-1">
              Conecte @liveequipamentos para receber comentários e DMs no chat.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => window.location.href = OAUTH_URL}
            disabled={connectMut.isPending}
          >
            <ChannelIcon channel="instagram" size={14} />
            {connectMut.isPending ? "Conectando..." : "Conectar Instagram"}
          </Button>
        </div>
      )}
    </div>
  );
}
