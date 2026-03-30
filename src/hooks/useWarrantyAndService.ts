import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WarrantyClaimInsert, ServiceRequestInsert } from "@/types/database";

export function useWarrantyClaims() {
  return useQuery({
    queryKey: ["warranty_claims"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_claims")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWarrantyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (claim: WarrantyClaimInsert) => {
      const { data, error } = await supabase.from("warranty_claims").insert(claim).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warranty_claims"] }),
  });
}

export function useUpdateWarrantyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<WarrantyClaimInsert>) => {
      const { data, error } = await supabase.from("warranty_claims").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warranty_claims"] }),
  });
}

export function useServiceRequests() {
  return useQuery({
    queryKey: ["service_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (req: ServiceRequestInsert) => {
      const { data, error } = await supabase.from("service_requests").insert(req).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_requests"] }),
  });
}

export function useUpdateServiceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ServiceRequestInsert>) => {
      const { data, error } = await supabase.from("service_requests").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["service_requests"] }),
  });
}
