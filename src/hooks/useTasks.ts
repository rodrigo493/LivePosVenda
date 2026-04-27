import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  ticket_id: string | null;
  client_id: string | null;
  assigned_to: string;
  due_date: string | null;
  due_time: string | null;
  priority: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  tickets?: { ticket_number: string; title: string } | null;
  clients?: { name: string } | null;
}

export function useTasks(userId?: string) {
  return useQuery({
    queryKey: ["tasks", userId],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select("*, tickets(ticket_number, title), clients(name)")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("due_time", { ascending: true, nullsFirst: false });
      if (userId) q = q.eq("assigned_to", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data as TaskRow[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string;
      ticket_id?: string;
      client_id?: string;
      assigned_to: string;
      due_date?: string;
      due_time?: string;
      priority?: string;
      created_by?: string;
    }) => {
      // due_time not yet in generated types — cast until supabase gen types is rerun
      const { data, error } = await (supabase as any).from("tasks").insert(task).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase.from("tasks").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
