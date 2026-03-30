import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Technician {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  specialty: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TechnicianInsert {
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  specialty?: string | null;
  notes?: string | null;
  status?: string;
}

export function useTechnicians() {
  return useQuery({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technicians" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as unknown as Technician[];
    },
  });
}

export function useCreateTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tech: TechnicianInsert) => {
      const { data, error } = await supabase
        .from("technicians" as any)
        .insert(tech as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Technician;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}

export function useUpdateTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TechnicianInsert>) => {
      const { data, error } = await supabase
        .from("technicians" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Technician;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["technicians"] }),
  });
}
