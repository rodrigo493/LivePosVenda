
-- Table for daily team reports (general summary)
CREATE TABLE public.ai_daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  report_content TEXT NOT NULL,
  total_users INTEGER DEFAULT 0,
  total_delays INTEGER DEFAULT 0,
  total_tickets INTEGER DEFAULT 0,
  total_actions INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(report_date)
);

ALTER TABLE public.ai_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view AI daily reports" ON public.ai_daily_reports
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert AI daily reports" ON public.ai_daily_reports
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Table for per-user daily reports
CREATE TABLE public.ai_user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  report_date DATE NOT NULL,
  user_summary TEXT NOT NULL,
  total_actions INTEGER DEFAULT 0,
  total_completed INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  total_delays INTEGER DEFAULT 0,
  classification TEXT DEFAULT 'regular',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, report_date)
);

ALTER TABLE public.ai_user_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view AI user reports" ON public.ai_user_reports
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert AI user reports" ON public.ai_user_reports
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
