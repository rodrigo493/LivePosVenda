// src/hooks/useNomusLookup.ts
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NomusPessoa {
  id: number;
  nome: string;
  codigo: string | null;
  cnpj: string | null;
  email: string | null;
  contatos: any[];
}

export interface NomusTipoMov {
  codigo: number;
  nome: string;
  natureza: number;
}

async function callNomusSearch(payload: Record<string, unknown>): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("nomus-search", { body: payload });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Busca pessoas (fornecedor/comprador) no Nomus com debounce. */
export function useNomusPessoas(termo: string, categoria: "fornecedor" | "comprador") {
  const [results, setResults] = useState<NomusPessoa[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (termo.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      callNomusSearch({ type: "pessoas", query: termo, categoria })
        .then((r) => { if (!cancelled) setResults(r as NomusPessoa[]); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [termo, categoria]);
  return { results, loading };
}

/** Busca tipos de movimentação (natureza Compra) no Nomus com debounce. */
export function useNomusTiposMovimentacao(termo: string) {
  const [results, setResults] = useState<NomusTipoMov[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      callNomusSearch({ type: "tiposMovimentacao", query: termo })
        .then((r) => { if (!cancelled) setResults(r as NomusTipoMov[]); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [termo]);
  return { results, loading };
}
