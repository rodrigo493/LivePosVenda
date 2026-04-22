import { Package, Shield, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { notifySquad } from "@/lib/squadNotify";

type ApprovalQuote = {
  id: string;
  quote_number: string;
  ticket_id: string | null;
  client_id: string | null;
  equipment_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: ApprovalQuote | null;
};

export function ApprovalActionDialog({ open, onOpenChange, quote }: Props) {
  const qc = useQueryClient();
  if (!quote) return null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["client-quotes"] });
    qc.invalidateQueries({ queryKey: ["service_requests_pa"] });
    qc.invalidateQueries({ queryKey: ["warranty_claims_pg"] });
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  };

  const createPa = async () => {
    if (!quote.ticket_id) { toast.error("Orçamento sem chamado vinculado."); return; }
    const { data: numData } = await supabase.rpc("generate_pa_number");
    const paNumber = numData || quote.quote_number.replace(/^OC\./, "PA.");
    const { data: paData, error } = await supabase.from("service_requests").insert({
      ticket_id: quote.ticket_id,
      request_type: "troca_peca" as any,
      notes: "Gerado a partir de orçamento aprovado",
      request_number: paNumber,
    }).select().single();
    if (error) { toast.error(error.message || "Erro ao criar PA"); return; }
    await supabase.from("quotes").update({ service_request_id: paData.id } as any).eq("id", quote.id);
    void notifySquad({ recordType: "pa", recordId: paData.id, reference: paNumber });
    toast.success(`Pedido de Acessório ${paNumber} criado!`);
    invalidate();
    onOpenChange(false);
  };

  const createPg = async () => {
    if (!quote.ticket_id) { toast.error("Orçamento sem chamado vinculado."); return; }
    const { data: numData } = await supabase.rpc("generate_pg_number");
    const pgNumber = numData || quote.quote_number.replace(/^OC\./, "PG.");
    const { data: pgData, error } = await supabase.from("warranty_claims").insert({
      ticket_id: quote.ticket_id,
      defect_description: "Gerado a partir de orçamento aprovado",
      claim_number: pgNumber,
    }).select().single();
    if (error) { toast.error(error.message || "Erro ao criar PG"); return; }
    await supabase.from("quotes").update({ warranty_claim_id: pgData.id } as any).eq("id", quote.id);
    void notifySquad({ recordType: "pg", recordId: pgData.id, reference: pgNumber });
    toast.success(`Pedido de Garantia ${pgNumber} criado!`);
    invalidate();
    onOpenChange(false);
  };

  const createOs = async () => {
    if (!quote.client_id || !quote.equipment_id) {
      toast.error("Orçamento sem cliente ou equipamento vinculado — não é possível criar OS.");
      return;
    }
    const { data: numData } = await supabase.rpc("generate_work_order_number");
    const orderNumber = numData || quote.quote_number.replace(/^OC\./, "OS.");
    const { data: woData, error } = await supabase.from("work_orders").insert({
      client_id: quote.client_id,
      equipment_id: quote.equipment_id,
      order_number: orderNumber,
      order_type: "pos_venda" as any,
      status: "aberta" as any,
      internal_notes: `Gerado a partir do orçamento ${quote.quote_number}`,
    }).select().single();
    if (error) { toast.error(error.message || "Erro ao criar OS"); return; }
    await supabase.from("quotes").update({ status: "convertido_os" as any } as any).eq("id", quote.id);
    toast.success(`Ordem de Serviço ${orderNumber} criada!`);
    invalidate();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Orçamento aprovado</DialogTitle>
          <DialogDescription>O que deseja criar a partir deste orçamento?</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button className="w-full gap-2" onClick={createOs}>
            <Wrench className="h-4 w-4" /> Ordem de Serviço (OS)
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={createPa}>
            <Package className="h-4 w-4" /> Pedido de Acessório (PA)
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={createPg}>
            <Shield className="h-4 w-4" /> Pedido de Garantia (PG)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Apenas aprovar, sem criar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
