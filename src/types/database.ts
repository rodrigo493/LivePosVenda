import { Database } from "@/integrations/supabase/types";

// Aliases for table row types
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
export type Equipment = Database["public"]["Tables"]["equipments"]["Row"];
export type EquipmentInsert = Database["public"]["Tables"]["equipments"]["Insert"];
export type EquipmentModel = Database["public"]["Tables"]["equipment_models"]["Row"];
export type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
export type TicketInsert = Database["public"]["Tables"]["tickets"]["Insert"];
export type WarrantyClaim = Database["public"]["Tables"]["warranty_claims"]["Row"];
export type WarrantyClaimInsert = Database["public"]["Tables"]["warranty_claims"]["Insert"];
export type ServiceRequest = Database["public"]["Tables"]["service_requests"]["Row"];
export type ServiceRequestInsert = Database["public"]["Tables"]["service_requests"]["Insert"];
export type WorkOrder = Database["public"]["Tables"]["work_orders"]["Row"];
export type WorkOrderInsert = Database["public"]["Tables"]["work_orders"]["Insert"];
export type WorkOrderItem = Database["public"]["Tables"]["work_order_items"]["Row"];
export type WorkOrderItemInsert = Database["public"]["Tables"]["work_order_items"]["Insert"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type MaintenancePlan = Database["public"]["Tables"]["maintenance_plans"]["Row"];
export type MaintenanceEvent = Database["public"]["Tables"]["maintenance_events"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_logs"]["Row"];
export type EngineeringReport = Database["public"]["Tables"]["engineering_reports"]["Row"];
export type Attachment = Database["public"]["Tables"]["attachments"]["Row"];

export type AppRole = "admin" | "atendimento" | "tecnico" | "engenharia" | "financeiro" | "cliente";

export type TicketType = "chamado_tecnico" | "garantia" | "assistencia";
export type TicketStatusType = "aberto" | "em_analise" | "aguardando_informacoes" | "aguardando_peca" | "agendado" | "em_atendimento" | "aprovado" | "reprovado" | "resolvido" | "fechado";
export type WorkOrderType = "garantia" | "pos_venda" | "preventiva" | "assistencia";
export type WorkOrderStatusType = "aberta" | "agendada" | "em_andamento" | "concluida" | "cancelada";
