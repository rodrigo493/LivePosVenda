import { useState, useEffect } from "react";
import { User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { supabase } from "@/integrations/supabase/client";
import { useCreateClient } from "@/hooks/useClients";

interface ContactData {
  name: string;
  phone: string;
  raw_vcard?: string;
}

interface ContactCardProps {
  contactData: ContactData;
}

const clientFields = [
  { name: "name", label: "Nome / Razão Social", required: true, placeholder: "Nome do cliente" },
  { name: "document", label: "CPF / CNPJ", placeholder: "00.000.000/0000-00" },
  { name: "document_type", label: "Tipo Documento", type: "select" as const,
    options: [{ value: "cpf", label: "CPF" }, { value: "cnpj", label: "CNPJ" }] },
  { name: "email", label: "Email", type: "email" as const, placeholder: "email@exemplo.com" },
  { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(11) 99999-9999" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(11) 99999-9999" },
  { name: "contact_person", label: "Responsável", placeholder: "Nome do responsável" },
  { name: "address", label: "Endereço", placeholder: "Rua, número, bairro" },
  { name: "city", label: "Cidade", placeholder: "São Paulo" },
  { name: "state", label: "Estado", placeholder: "SP" },
  { name: "zip_code", label: "CEP", placeholder: "00000-000" },
  { name: "notes", label: "Observações", type: "textarea" as const },
];

export function ContactCard({ contactData }: ContactCardProps) {
  const [clientExists, setClientExists] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const createClient = useCreateClient();

  useEffect(() => {
    if (!contactData.phone) {
      setClientExists(false);
      return;
    }
    let cancelled = false;
    const suffix = contactData.phone.replace(/\D/g, "").slice(-8);
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .or(`phone.ilike.%${suffix},whatsapp.ilike.%${suffix}`)
      .then(({ count }) => { if (!cancelled) setClientExists((count ?? 0) > 0); });
    return () => { cancelled = true; };
  }, [contactData.phone]);

  const handleCreate = async (values: Record<string, any>) => {
    await createClient.mutateAsync(values);
    setClientExists(true);
  };

  const displayPhone = contactData.phone
    ? contactData.phone.replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 $2 $3-$4")
    : "";

  return (
    <>
      <div className="flex items-center gap-2.5 p-2 rounded-lg bg-black/10 min-w-[180px] max-w-[240px]">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-black/10 flex items-center justify-center">
          <User size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{contactData.name}</p>
          {displayPhone && <p className="text-xs opacity-70">{displayPhone}</p>}
        </div>
        {clientExists === false && (
          <Button
            size="icon"
            variant="ghost"
            className="flex-shrink-0 h-8 w-8 hover:bg-white/20"
            title="Criar cliente"
            onClick={() => setDialogOpen(true)}
          >
            <UserPlus size={15} />
          </Button>
        )}
      </div>

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Novo Cliente"
        fields={clientFields}
        initialValues={{
          name: contactData.name,
          phone: contactData.phone,
          whatsapp: contactData.phone,
        }}
        onSubmit={handleCreate}
      />
    </>
  );
}
