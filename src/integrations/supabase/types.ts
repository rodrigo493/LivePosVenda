export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
        }
        Relationships: []
      }
      ai_daily_reports: {
        Row: {
          created_at: string
          id: string
          report_content: string
          report_date: string
          total_actions: number | null
          total_delays: number | null
          total_tickets: number | null
          total_users: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          report_content: string
          report_date: string
          total_actions?: number | null
          total_delays?: number | null
          total_tickets?: number | null
          total_users?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          report_content?: string
          report_date?: string
          total_actions?: number | null
          total_delays?: number | null
          total_tickets?: number | null
          total_users?: number | null
        }
        Relationships: []
      }
      ai_user_reports: {
        Row: {
          classification: string | null
          created_at: string
          id: string
          report_date: string
          total_actions: number | null
          total_completed: number | null
          total_delays: number | null
          total_pending: number | null
          user_id: string
          user_summary: string
        }
        Insert: {
          classification?: string | null
          created_at?: string
          id?: string
          report_date: string
          total_actions?: number | null
          total_completed?: number | null
          total_delays?: number | null
          total_pending?: number | null
          user_id: string
          user_summary: string
        }
        Update: {
          classification?: string | null
          created_at?: string
          id?: string
          report_date?: string
          total_actions?: number | null
          total_completed?: number | null
          total_delays?: number | null
          total_pending?: number | null
          user_id?: string
          user_summary?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      client_service_history: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          device: string | null
          history_notes: string | null
          id: string
          invoice_number: string | null
          pa_number: string | null
          parts_sent: string | null
          pg_number: string | null
          problem_reported: string | null
          service_date: string
          service_status: string
          solution_provided: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          device?: string | null
          history_notes?: string | null
          id?: string
          invoice_number?: string | null
          pa_number?: string | null
          parts_sent?: string | null
          pg_number?: string | null
          problem_reported?: string | null
          service_date?: string
          service_status?: string
          solution_provided?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          device?: string | null
          history_notes?: string | null
          id?: string
          invoice_number?: string | null
          pa_number?: string | null
          parts_sent?: string | null
          pg_number?: string | null
          problem_reported?: string | null
          service_date?: string
          service_status?: string
          solution_provided?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_service_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          client_code: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          document: string | null
          document_type: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          state: string | null
          status: string
          updated_at: string
          user_id: string | null
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_code?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          document?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      engineering_reports: {
        Row: {
          content: Json | null
          created_at: string
          generated_by: string | null
          id: string
          period_end: string | null
          period_start: string | null
          report_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          generated_by?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          report_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      equipment_models: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
          updated_at: string
          warranty_months: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
          warranty_months?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          warranty_months?: number | null
        }
        Relationships: []
      }
      equipments: {
        Row: {
          batch_number: string | null
          client_id: string | null
          created_at: string
          id: string
          installation_date: string | null
          manufacture_date: string | null
          model_id: string | null
          notes: string | null
          sale_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
          warranty_expires_at: string | null
          warranty_status: string
        }
        Insert: {
          batch_number?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          installation_date?: string | null
          manufacture_date?: string | null
          model_id?: string | null
          notes?: string | null
          sale_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires_at?: string | null
          warranty_status?: string
        }
        Update: {
          batch_number?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          installation_date?: string | null
          manufacture_date?: string | null
          model_id?: string | null
          notes?: string | null
          sale_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
          warranty_expires_at?: string | null
          warranty_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipments_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_import_records: {
        Row: {
          client_id: string | null
          client_name: string | null
          created_at: string
          equipment_id: string | null
          id: string
          import_log_id: string | null
          import_status: string | null
          problem_description: string | null
          product_name: string | null
          raw_data: Json | null
          reference_date: string | null
          solution: string | null
          source_file: string | null
          source_row: number | null
          status: string | null
          ticket_id: string | null
        }
        Insert: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          equipment_id?: string | null
          id?: string
          import_log_id?: string | null
          import_status?: string | null
          problem_description?: string | null
          product_name?: string | null
          raw_data?: Json | null
          reference_date?: string | null
          solution?: string | null
          source_file?: string | null
          source_row?: number | null
          status?: string | null
          ticket_id?: string | null
        }
        Update: {
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          equipment_id?: string | null
          id?: string
          import_log_id?: string | null
          import_status?: string | null
          problem_description?: string | null
          product_name?: string | null
          raw_data?: Json | null
          reference_date?: string | null
          solution?: string | null
          source_file?: string | null
          source_row?: number | null
          status?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historical_import_records_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_import_records_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_import_records_import_log_id_fkey"
            columns: ["import_log_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historical_import_records_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          created_at: string
          errors: Json | null
          file_name: string
          id: string
          imported_rows: number | null
          skipped_rows: number | null
          status: string
          total_rows: number | null
          updated_rows: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          errors?: Json | null
          file_name: string
          id?: string
          imported_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
          updated_rows?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          errors?: Json | null
          file_name?: string
          id?: string
          imported_rows?: number | null
          skipped_rows?: number | null
          status?: string
          total_rows?: number | null
          updated_rows?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      maintenance_events: {
        Row: {
          created_at: string
          description: string | null
          equipment_id: string
          event_type: string
          id: string
          maintenance_plan_id: string | null
          notes: string | null
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          equipment_id: string
          event_type?: string
          id?: string
          maintenance_plan_id?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          equipment_id?: string
          event_type?: string
          id?: string
          maintenance_plan_id?: string | null
          notes?: string | null
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_events_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_events_maintenance_plan_id_fkey"
            columns: ["maintenance_plan_id"]
            isOneToOne: false
            referencedRelation: "maintenance_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_plans: {
        Row: {
          client_id: string | null
          component: string
          created_at: string
          delivery_date: string | null
          equipment_id: string
          id: string
          interval_months: number
          last_maintenance_date: string | null
          next_maintenance_date: string | null
          recommendation: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          component: string
          created_at?: string
          delivery_date?: string | null
          equipment_id: string
          id?: string
          interval_months?: number
          last_maintenance_date?: string | null
          next_maintenance_date?: string | null
          recommendation?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          component?: string
          created_at?: string
          delivery_date?: string | null
          equipment_id?: string
          id?: string
          interval_months?: number
          last_maintenance_date?: string | null
          next_maintenance_date?: string | null
          recommendation?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_plans_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_template_parts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_template_parts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_template_parts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "model_maintenance_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      model_maintenance_templates: {
        Row: {
          component: string
          created_at: string
          id: string
          interval_months: number
          model_id: string | null
          procedure_text: string | null
          recommendation: string | null
          updated_at: string
        }
        Insert: {
          component: string
          created_at?: string
          id?: string
          interval_months?: number
          model_id?: string | null
          procedure_text?: string | null
          recommendation?: string | null
          updated_at?: string
        }
        Update: {
          component?: string
          created_at?: string
          id?: string
          interval_months?: number
          model_id?: string | null
          procedure_text?: string | null
          recommendation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_maintenance_templates_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
        ]
      }
      product_compatibility: {
        Row: {
          created_at: string
          id: string
          model_id: string
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          model_id: string
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          model_id?: string
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_compatibility_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "equipment_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_compatibility_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_cost: number
          category: string | null
          code: string
          cofins_percent: number | null
          compatibility: string | null
          created_at: string
          created_by: string | null
          csll_percent: number | null
          description: string | null
          estoque_indisponivel: boolean | null
          family: string | null
          icms_percent: number | null
          id: string
          ipi_percent: number | null
          irpj_percent: number | null
          margin_percent: number | null
          name: string
          pis_percent: number | null
          product_group: string | null
          product_type: string | null
          ressuprimento: string | null
          secondary_code: string | null
          status: string
          stock_current: number | null
          stock_minimum: number | null
          subcategory: string | null
          suggested_price: number | null
          supplier: string | null
          technical_notes: string | null
          technician_id: string | null
          unit: string | null
          updated_at: string
          useful_life_months: number | null
        }
        Insert: {
          base_cost?: number
          category?: string | null
          code: string
          cofins_percent?: number | null
          compatibility?: string | null
          created_at?: string
          created_by?: string | null
          csll_percent?: number | null
          description?: string | null
          estoque_indisponivel?: boolean | null
          family?: string | null
          icms_percent?: number | null
          id?: string
          ipi_percent?: number | null
          irpj_percent?: number | null
          margin_percent?: number | null
          name: string
          pis_percent?: number | null
          product_group?: string | null
          product_type?: string | null
          ressuprimento?: string | null
          secondary_code?: string | null
          status?: string
          stock_current?: number | null
          stock_minimum?: number | null
          subcategory?: string | null
          suggested_price?: number | null
          supplier?: string | null
          technical_notes?: string | null
          technician_id?: string | null
          unit?: string | null
          updated_at?: string
          useful_life_months?: number | null
        }
        Update: {
          base_cost?: number
          category?: string | null
          code?: string
          cofins_percent?: number | null
          compatibility?: string | null
          created_at?: string
          created_by?: string | null
          csll_percent?: number | null
          description?: string | null
          estoque_indisponivel?: boolean | null
          family?: string | null
          icms_percent?: number | null
          id?: string
          ipi_percent?: number | null
          irpj_percent?: number | null
          margin_percent?: number | null
          name?: string
          pis_percent?: number | null
          product_group?: string | null
          product_type?: string | null
          ressuprimento?: string | null
          secondary_code?: string | null
          status?: string
          stock_current?: number | null
          stock_minimum?: number | null
          subcategory?: string | null
          suggested_price?: number | null
          supplier?: string | null
          technical_notes?: string | null
          technician_id?: string | null
          unit?: string | null
          updated_at?: string
          useful_life_months?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: Database["public"]["Enums"]["quote_item_type"]
          notes: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          item_type?: Database["public"]["Enums"]["quote_item_type"]
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: Database["public"]["Enums"]["quote_item_type"]
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          discount: number
          equipment_id: string | null
          freight: number
          id: string
          notes: string | null
          quote_number: string
          service_request_id: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          ticket_id: string | null
          total: number
          updated_at: string
          valid_until: string | null
          warranty_claim_id: string | null
          work_order_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          discount?: number
          equipment_id?: string | null
          freight?: number
          id?: string
          notes?: string | null
          quote_number?: string
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          ticket_id?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          warranty_claim_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          discount?: number
          equipment_id?: string | null
          freight?: number
          id?: string
          notes?: string | null
          quote_number?: string
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          ticket_id?: string | null
          total?: number
          updated_at?: string
          valid_until?: string | null
          warranty_claim_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_warranty_claim_id_fkey"
            columns: ["warranty_claim_id"]
            isOneToOne: false
            referencedRelation: "warranty_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          approved_by_client: boolean | null
          created_at: string
          estimated_cost: number | null
          id: string
          notes: string | null
          request_number: string | null
          request_type: Database["public"]["Enums"]["service_request_type"]
          status: Database["public"]["Enums"]["service_request_status"]
          ticket_id: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          approved_by_client?: boolean | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          notes?: string | null
          request_number?: string | null
          request_type?: Database["public"]["Enums"]["service_request_type"]
          status?: Database["public"]["Enums"]["service_request_status"]
          ticket_id: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          approved_by_client?: boolean | null
          created_at?: string
          estimated_cost?: number | null
          id?: string
          notes?: string | null
          request_number?: string | null
          request_type?: Database["public"]["Enums"]["service_request_type"]
          status?: Database["public"]["Enums"]["service_request_status"]
          ticket_id?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string
          id: string
          key: string
          label: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          category?: string
          id?: string
          key: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          category?: string
          id?: string
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      technical_history: {
        Row: {
          created_at: string
          description: string
          equipment_id: string
          event_date: string
          event_type: string
          id: string
          metadata: Json | null
          performed_by: string | null
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          created_at?: string
          description: string
          equipment_id: string
          event_date?: string
          event_type: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          equipment_id?: string
          event_date?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technical_history_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          specialty: string | null
          state: string | null
          status: string
          updated_at: string
          whatsapp: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          specialty?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      tickets: {
        Row: {
          ai_triage: Json | null
          assigned_to: string | null
          channel: string | null
          client_id: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          equipment_id: string | null
          estimated_value: number | null
          id: string
          internal_notes: string | null
          last_interaction_at: string | null
          origin: string | null
          pipeline_stage: string
          priority: string
          problem_category: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          ticket_type: Database["public"]["Enums"]["ticket_type_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          ai_triage?: Json | null
          assigned_to?: string | null
          channel?: string | null
          client_id: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment_id?: string | null
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          last_interaction_at?: string | null
          origin?: string | null
          pipeline_stage?: string
          priority?: string
          problem_category?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number: string
          ticket_type: Database["public"]["Enums"]["ticket_type_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          ai_triage?: Json | null
          assigned_to?: string | null
          channel?: string | null
          client_id?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          equipment_id?: string | null
          estimated_value?: number | null
          id?: string
          internal_notes?: string | null
          last_interaction_at?: string | null
          origin?: string | null
          pipeline_stage?: string
          priority?: string
          problem_category?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          ticket_number?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type_enum"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warranty_claims: {
        Row: {
          approval_reason: string | null
          claim_number: string | null
          covered_labor: boolean | null
          covered_parts: string | null
          created_at: string
          defect_description: string | null
          final_verdict: string | null
          id: string
          installation_date: string | null
          internal_cost: number | null
          purchase_date: string | null
          rejection_reason: string | null
          technical_analysis: string | null
          ticket_id: string
          updated_at: string
          warranty_period_months: number | null
          warranty_status: Database["public"]["Enums"]["warranty_status"]
          work_order_id: string | null
        }
        Insert: {
          approval_reason?: string | null
          claim_number?: string | null
          covered_labor?: boolean | null
          covered_parts?: string | null
          created_at?: string
          defect_description?: string | null
          final_verdict?: string | null
          id?: string
          installation_date?: string | null
          internal_cost?: number | null
          purchase_date?: string | null
          rejection_reason?: string | null
          technical_analysis?: string | null
          ticket_id: string
          updated_at?: string
          warranty_period_months?: number | null
          warranty_status?: Database["public"]["Enums"]["warranty_status"]
          work_order_id?: string | null
        }
        Update: {
          approval_reason?: string | null
          claim_number?: string | null
          covered_labor?: boolean | null
          covered_parts?: string | null
          created_at?: string
          defect_description?: string | null
          final_verdict?: string | null
          id?: string
          installation_date?: string | null
          internal_cost?: number | null
          purchase_date?: string | null
          rejection_reason?: string | null
          technical_analysis?: string | null
          ticket_id?: string
          updated_at?: string
          warranty_period_months?: number | null
          warranty_status?: Database["public"]["Enums"]["warranty_status"]
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranty_claims_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_intake_logs: {
        Row: {
          ai_model: string | null
          ai_response: Json | null
          ai_success: boolean | null
          client_name: string | null
          client_phone: string
          created_at: string
          equipment_informed: string | null
          id: string
          manychat_response: Json | null
          original_message: string
          serial_number: string | null
          ticket_id: string | null
        }
        Insert: {
          ai_model?: string | null
          ai_response?: Json | null
          ai_success?: boolean | null
          client_name?: string | null
          client_phone: string
          created_at?: string
          equipment_informed?: string | null
          id?: string
          manychat_response?: Json | null
          original_message: string
          serial_number?: string | null
          ticket_id?: string | null
        }
        Update: {
          ai_model?: string | null
          ai_response?: Json | null
          ai_success?: boolean | null
          client_name?: string | null
          client_phone?: string
          created_at?: string
          equipment_informed?: string | null
          id?: string
          manychat_response?: Json | null
          original_message?: string
          serial_number?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_intake_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          client_id: string
          created_at: string
          direction: string
          id: string
          manychat_message_id: string | null
          manychat_subscriber_id: string | null
          message_text: string
          sender_name: string | null
          sender_phone: string | null
          status: string
          ticket_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          direction: string
          id?: string
          manychat_message_id?: string | null
          manychat_subscriber_id?: string | null
          message_text: string
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
          ticket_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          direction?: string
          id?: string
          manychat_message_id?: string | null
          manychat_subscriber_id?: string | null
          message_text?: string
          sender_name?: string | null
          sender_phone?: string | null
          status?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      work_order_items: {
        Row: {
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["work_order_item_type"]
          notes: string | null
          product_id: string
          quantity: number
          unit_cost: number
          unit_price: number
          work_order_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["work_order_item_type"]
          notes?: string | null
          product_id: string
          quantity?: number
          unit_cost?: number
          unit_price?: number
          work_order_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["work_order_item_type"]
          notes?: string | null
          product_id?: string
          quantity?: number
          unit_cost?: number
          unit_price?: number
          work_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_order_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          cause: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          equipment_id: string
          id: string
          internal_notes: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["work_order_type"]
          service_time_hours: number | null
          solution: string | null
          status: Database["public"]["Enums"]["work_order_status"]
          technician_id: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          cause?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          equipment_id: string
          id?: string
          internal_notes?: string | null
          order_number: string
          order_type?: Database["public"]["Enums"]["work_order_type"]
          service_time_hours?: number | null
          solution?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          technician_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          cause?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          equipment_id?: string
          id?: string
          internal_notes?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["work_order_type"]
          service_time_hours?: number | null
          solution?: string | null
          status?: Database["public"]["Enums"]["work_order_status"]
          technician_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_pa_number: { Args: never; Returns: string }
      generate_pg_number: { Args: never; Returns: string }
      get_my_client_ids: { Args: never; Returns: string[] }
      get_my_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      nomus_http_post: {
        Args: { auth_header: string; payload: Json; timeout_ms?: number }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "atendimento"
        | "tecnico"
        | "engenharia"
        | "financeiro"
        | "cliente"
      quote_item_type:
        | "peca_garantia"
        | "peca_cobrada"
        | "servico_garantia"
        | "servico_cobrado"
        | "frete"
        | "desconto"
      quote_status:
        | "rascunho"
        | "aguardando_aprovacao"
        | "aprovado"
        | "reprovado"
        | "convertido_os"
        | "cancelado"
      service_request_status:
        | "aberto"
        | "orcamento_enviado"
        | "agendado"
        | "em_andamento"
        | "resolvido"
        | "cancelado"
      service_request_type:
        | "corretiva"
        | "preventiva"
        | "inspecao"
        | "troca_peca"
        | "suporte"
      ticket_status:
        | "aberto"
        | "em_analise"
        | "aguardando_informacoes"
        | "aguardando_peca"
        | "agendado"
        | "em_atendimento"
        | "aprovado"
        | "reprovado"
        | "resolvido"
        | "fechado"
      ticket_type_enum:
        | "chamado_tecnico"
        | "garantia"
        | "assistencia"
        | "pos_venda"
        | "comprar_acessorios"
      warranty_status: "em_analise" | "aprovada" | "reprovada" | "convertida_os"
      work_order_item_type:
        | "peca_garantia"
        | "peca_cobrada"
        | "servico_garantia"
        | "servico_cobrado"
        | "frete"
        | "desconto"
      work_order_status:
        | "aberta"
        | "agendada"
        | "em_andamento"
        | "concluida"
        | "cancelada"
      work_order_type: "garantia" | "pos_venda" | "preventiva" | "assistencia"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "atendimento",
        "tecnico",
        "engenharia",
        "financeiro",
        "cliente",
      ],
      quote_item_type: [
        "peca_garantia",
        "peca_cobrada",
        "servico_garantia",
        "servico_cobrado",
        "frete",
        "desconto",
      ],
      quote_status: [
        "rascunho",
        "aguardando_aprovacao",
        "aprovado",
        "reprovado",
        "convertido_os",
        "cancelado",
      ],
      service_request_status: [
        "aberto",
        "orcamento_enviado",
        "agendado",
        "em_andamento",
        "resolvido",
        "cancelado",
      ],
      service_request_type: [
        "corretiva",
        "preventiva",
        "inspecao",
        "troca_peca",
        "suporte",
      ],
      ticket_status: [
        "aberto",
        "em_analise",
        "aguardando_informacoes",
        "aguardando_peca",
        "agendado",
        "em_atendimento",
        "aprovado",
        "reprovado",
        "resolvido",
        "fechado",
      ],
      ticket_type_enum: [
        "chamado_tecnico",
        "garantia",
        "assistencia",
        "pos_venda",
        "comprar_acessorios",
      ],
      warranty_status: ["em_analise", "aprovada", "reprovada", "convertida_os"],
      work_order_item_type: [
        "peca_garantia",
        "peca_cobrada",
        "servico_garantia",
        "servico_cobrado",
        "frete",
        "desconto",
      ],
      work_order_status: [
        "aberta",
        "agendada",
        "em_andamento",
        "concluida",
        "cancelada",
      ],
      work_order_type: ["garantia", "pos_venda", "preventiva", "assistencia"],
    },
  },
} as const
