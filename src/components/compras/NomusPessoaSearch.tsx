// src/components/compras/NomusPessoaSearch.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useNomusPessoas, type NomusPessoa } from "@/hooks/useNomusLookup";

interface Props {
  categoria: "fornecedor" | "comprador";
  value: string | null;            // nome atualmente selecionado
  onSelect: (pessoa: NomusPessoa) => void;
  placeholder?: string;
}

export function NomusPessoaSearch({ categoria, value, onSelect, placeholder }: Props) {
  const [termo, setTermo] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useNomusPessoas(termo, categoria);

  return (
    <div className="relative">
      <Input
        value={open ? termo : (value ?? "")}
        placeholder={placeholder ?? `Buscar ${categoria}...`}
        onFocus={() => { setOpen(true); setTermo(""); }}
        onChange={(e) => setTermo(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (termo.trim().length >= 2) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onMouseDown={() => { onSelect(p); setOpen(false); }}
            >
              {p.nome} {p.codigo ? <span className="text-xs text-muted-foreground">({p.codigo})</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
