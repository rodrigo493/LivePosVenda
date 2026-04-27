-- Fix: deleting an auth user fails with "Database error deleting user"
-- because several columns reference auth.users without ON DELETE SET NULL.
-- Postgres refuses to delete the user while any row points to it.
-- Fix: drop and recreate each FK with ON DELETE SET NULL so data is preserved
-- but the user reference is cleared on deletion.

-- clients.created_by
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
ALTER TABLE public.clients ADD CONSTRAINT clients_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- tickets.assigned_to
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- tickets.created_by
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_created_by_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- work_orders.technician_id
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_technician_id_fkey;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_technician_id_fkey
  FOREIGN KEY (technician_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- work_orders.created_by
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_created_by_fkey;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- maintenance_events.performed_by
ALTER TABLE public.maintenance_events DROP CONSTRAINT IF EXISTS maintenance_events_performed_by_fkey;
ALTER TABLE public.maintenance_events ADD CONSTRAINT maintenance_events_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- attachments.uploaded_by
ALTER TABLE public.attachments DROP CONSTRAINT IF EXISTS attachments_uploaded_by_fkey;
ALTER TABLE public.attachments ADD CONSTRAINT attachments_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- activity_logs.performed_by
ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_performed_by_fkey;
ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_performed_by_fkey
  FOREIGN KEY (performed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- engineering_reports.generated_by
ALTER TABLE public.engineering_reports DROP CONSTRAINT IF EXISTS engineering_reports_generated_by_fkey;
ALTER TABLE public.engineering_reports ADD CONSTRAINT engineering_reports_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- system_settings.updated_by
ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_updated_by_fkey;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- pipelines.created_by
ALTER TABLE public.pipelines DROP CONSTRAINT IF EXISTS pipelines_created_by_fkey;
ALTER TABLE public.pipelines ADD CONSTRAINT pipelines_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
