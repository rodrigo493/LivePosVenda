import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CrmClient {
  name?: string;
  contact_person?: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName?: string;
  crmClient?: CrmClient;
  vendedorOptions: { id: number; nome: string }[];
  onCreated: (id: number, nome: string) => void;
}

const TIPO_LOGRADOURO_MAP: Record<string, string> = {
  RUA: "RUA", RUA_: "RUA",
  AV: "AV", AVENIDA: "AV",
  AL: "AL", ALAMEDA: "AL",
  PC: "PC", PRAÇA: "PC", PRACA: "PC",
  TV: "TV", TRAVESSA: "TV",
  EST: "EST", ESTRADA: "EST",
  ROD: "ROD", RODOVIA: "ROD",
  TRV: "TV",
};

function extractTipoLogradouro(address: string): { tipo: string; resto: string } {
  const trimmed = address.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return { tipo: "RUA", resto: trimmed };
  const first = parts[0].toUpperCase().replace(/[.,]/g, "");
  const mapped = TIPO_LOGRADOURO_MAP[first];
  if (mapped) return { tipo: mapped, resto: parts.slice(1).join(" ") };
  return { tipo: "RUA", resto: trimmed };
}

function cleanCep(cep: string) {
  return cep.replace(/\D/g, "");
}

function detectTipoPessoa(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) return "1"; // CPF → Pessoa Física
  if (digits.length === 14) return "2"; // CNPJ → Pessoa Jurídica
  return "1";
}

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

export function CreateNomusClientDialog({ open, onOpenChange, defaultName, crmClient, vendedorOptions, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [vendedorSearch, setVendedorSearch] = useState("");
  const [vendedorId, setVendedorId] = useState<number | null>(null);

  const [fields, setFields] = useState({
    nome: "",
    tipoPessoa: "1",
    telefone: "",
    cep: "",
    tipoLogradouro: "RUA",
    endereco: "",
    numero: "",
    bairro: "",
    municipio: "",
    uf: "",
    pais: "BRASIL",
    codigoIBGEMunicipio: "",
    dataInicioRelacionamento: today(),
  });

  const set = (k: string, v: string) => setFields(p => ({ ...p, [k]: v }));

  // Pre-populate from crmClient when dialog opens
  useEffect(() => {
    if (!open) return;
    const c = crmClient || {};
    const name = defaultName || c.name || "";
    const doc = c.document || "";
    const phone = c.phone || c.whatsapp || "";
    const rawAddress = c.address || "";
    const { tipo, resto } = extractTipoLogradouro(rawAddress);
    setFields({
      nome: name,
      tipoPessoa: doc ? detectTipoPessoa(doc) : "1",
      telefone: phone.replace(/\D/g, "").slice(0, 15),
      cep: cleanCep(c.zip_code || ""),
      tipoLogradouro: tipo,
      endereco: resto,
      numero: "",
      bairro: "",
      municipio: c.city || "",
      uf: c.state || "",
      pais: "BRASIL",
      codigoIBGEMunicipio: "",
      dataInicioRelacionamento: today(),
    });
    setVendedorId(null);
    setVendedorSearch("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchViaCep = async (cep: string) => {
    const cleaned = cleanCep(cep);
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.erro) return;
      const { tipo, resto } = extractTipoLogradouro(data.logradouro || "");
      setFields(p => ({
        ...p,
        tipoLogradouro: tipo,
        endereco: resto,
        bairro: data.bairro || p.bairro,
        municipio: data.localidade || p.municipio,
        uf: data.uf || p.uf,
        codigoIBGEMunicipio: data.ibge || p.codigoIBGEMunicipio,
      }));
    } catch { /* ignore */ }
    finally { setCepLoading(false); }
  };

  const filteredVendedores = vendedorOptions.filter(v =>
    v.nome.toLowerCase().includes(vendedorSearch.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!fields.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!fields.cep.trim()) { toast.error("CEP é obrigatório"); return; }
    if (!fields.municipio.trim()) { toast.error("Município é obrigatório"); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        nome: fields.nome.trim(),
        tipoPessoa: Number(fields.tipoPessoa),
        telefone: fields.telefone || undefined,
        cep: fields.cep,
        tipoLogradouro: fields.tipoLogradouro,
        endereco: fields.endereco.trim() || undefined,
        numero: fields.numero.trim() || undefined,
        bairro: fields.bairro.trim() || undefined,
        municipio: fields.municipio.trim(),
        uf: fields.uf.trim() || undefined,
        pais: fields.pais,
        codigoIBGEMunicipio: fields.codigoIBGEMunicipio || undefined,
        dataInicioRelacionamento: fields.dataInicioRelacionamento,
        vendedores: vendedorId ? [{ id: vendedorId }] : [],
        representantes: [],
      };

      const res = await fetch("/api/nomus/rest/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(`Erro ao criar cliente: ${body?.message || body?.error || res.status}`);
        return;
      }

      const createdId = body?.id ? Number(body.id) : null;
      const createdNome = body?.nome || fields.nome.trim();

      if (!createdId) {
        toast.error("Cliente criado mas ID não retornado pela API.");
        return;
      }

      toast.success(`Cliente "${createdNome}" criado no Nomus (ID ${createdId})`);
      onCreated(createdId, createdNome);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(`Erro: ${e instanceof Error ? e.message : "Desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">Criar Cliente no Nomus ERP</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1">
          {/* Nome */}
          <div className="col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nome *</Label>
            <Input value={fields.nome} onChange={e => set("nome", e.target.value)} placeholder="Nome ou Razão Social" className="mt-1 h-9 text-xs" />
          </div>

          {/* Tipo Pessoa */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tipo Pessoa</Label>
            <Select value={fields.tipoPessoa} onValueChange={v => set("tipoPessoa", v)}>
              <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Física (CPF)</SelectItem>
                <SelectItem value="2">Jurídica (CNPJ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Telefone */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Telefone</Label>
            <Input value={fields.telefone} onChange={e => set("telefone", e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Somente números" className="mt-1 h-9 text-xs font-mono" />
          </div>

          {/* CEP */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CEP *</Label>
            <div className="relative mt-1">
              <Input
                value={fields.cep}
                onChange={e => set("cep", cleanCep(e.target.value).slice(0, 8))}
                onBlur={e => fetchViaCep(e.target.value)}
                placeholder="Somente números"
                className="h-9 text-xs font-mono pr-7"
              />
              {cepLoading && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Tipo Logradouro */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tipo Logradouro</Label>
            <Select value={fields.tipoLogradouro} onValueChange={v => set("tipoLogradouro", v)}>
              <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["RUA","AV","AL","PC","TV","EST","ROD","VL","PQ","CJ"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Endereço */}
          <div className="col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Endereço (sem tipo)</Label>
            <Input value={fields.endereco} onChange={e => set("endereco", e.target.value)} placeholder="Nome da rua/avenida..." className="mt-1 h-9 text-xs" />
          </div>

          {/* Número */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Número</Label>
            <Input value={fields.numero} onChange={e => set("numero", e.target.value)} placeholder="S/N" className="mt-1 h-9 text-xs" />
          </div>

          {/* Bairro */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Bairro</Label>
            <Input value={fields.bairro} onChange={e => set("bairro", e.target.value)} className="mt-1 h-9 text-xs" />
          </div>

          {/* Município */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Município *</Label>
            <Input value={fields.municipio} onChange={e => set("municipio", e.target.value)} className="mt-1 h-9 text-xs" />
          </div>

          {/* UF */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">UF</Label>
            <Input value={fields.uf} onChange={e => set("uf", e.target.value.toUpperCase().slice(0, 2))} placeholder="SP" className="mt-1 h-9 text-xs font-mono" maxLength={2} />
          </div>

          {/* IBGE */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cód. IBGE Município</Label>
            <Input value={fields.codigoIBGEMunicipio} onChange={e => set("codigoIBGEMunicipio", e.target.value.replace(/\D/g, ""))} placeholder="Auto-preenchido pelo CEP" className="mt-1 h-9 text-xs font-mono" />
          </div>

          {/* Data Início Relacionamento */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Início Relacionamento</Label>
            <Input value={fields.dataInicioRelacionamento} onChange={e => set("dataInicioRelacionamento", e.target.value)} placeholder="dd/MM/yyyy" className="mt-1 h-9 text-xs font-mono" />
          </div>

          {/* Vendedor */}
          <div className="col-span-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Vendedor{vendedorId ? <span className="ml-2 text-green-600 font-normal">✓ ID {vendedorId}</span> : null}
            </Label>
            {vendedorOptions.length > 0 ? (
              <Select
                value={vendedorId ? String(vendedorId) : ""}
                onValueChange={v => setVendedorId(v ? Number(v) : null)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Selecione um vendedor (opcional)" /></SelectTrigger>
                <SelectContent>
                  {vendedorOptions.map(v => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={vendedorSearch} onChange={e => setVendedorSearch(e.target.value)} placeholder="Vendedor (opcional)" className="mt-1 h-9 text-xs" />
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar Cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
