// src/hooks/useLossReasons.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface LossReason {
  id: string;
  label: string;
  active: boolean;
  position: number;
  created_at: string;
  ticket_count?: number;
}

export interface TicketLossReason {
  ticket_id: string;
  loss_reason_id: string;
  created_at: string;
}

// ── useLossReasons ────────────────────────────────────────────────────────────
// Todos os motivos (ativos + inativos) com contagem — para página de gestão

export function useLossReasons() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loss_reasons_with_count")
        .select("id, label, active, position, created_at, ticket_count")
        .order("active", { ascending: false })
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useLossReasonsActive ──────────────────────────────────────────────────────
// Apenas ativos, sem contagem — para o seletor de chips no card de ticket

export function useLossReasonsActive() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons-active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loss_reasons")
        .select("id, label, active, position, created_at")
        .eq("active", true)
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useLossReasonsStats ───────────────────────────────────────────────────────
// Top 10 com count > 0, ordenados decrescente — para o widget do dashboard

export function useLossReasonsStats() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons-stats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("loss_reasons_with_count")
        .select("id, label, ticket_count")
        .gt("ticket_count", 0)
        .order("ticket_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useTicketLossReasons ──────────────────────────────────────────────────────
// Motivos vinculados a um ticket específico

export function useTicketLossReasons(ticketId: string | undefined) {
  return useQuery<TicketLossReason[]>({
    queryKey: ["ticket-loss-reasons", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ticket_loss_reasons")
        .select("ticket_id, loss_reason_id, created_at")
        .eq("ticket_id", ticketId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useCreateLossReason ───────────────────────────────────────────────────────

export function useCreateLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const { error } = await (supabase as any)
        .from("loss_reasons")
        .insert({ label: label.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-active"] });
    },
  });
}

// ── useUpdateLossReason ───────────────────────────────────────────────────────

export function useUpdateLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<LossReason, "label" | "active">> }) => {
      const { error } = await (supabase as any)
        .from("loss_reasons")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-active"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-stats"] });
    },
  });
}

// ── useToggleLossReason ───────────────────────────────────────────────────────
// INSERT se não selecionado, DELETE se já selecionado

export function useToggleLossReason(ticketId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reasonId, isSelected }: { reasonId: string; isSelected: boolean }) => {
      if (!ticketId) return;
      if (isSelected) {
        const { error } = await (supabase as any)
          .from("ticket_loss_reasons")
          .delete()
          .eq("ticket_id", ticketId)
          .eq("loss_reason_id", reasonId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("ticket_loss_reasons")
          .insert({ ticket_id: ticketId, loss_reason_id: reasonId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-loss-reasons", ticketId] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-stats"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
    },
  });
}
