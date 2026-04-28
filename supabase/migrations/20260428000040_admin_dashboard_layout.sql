-- Tabela de layout customizado do Dashboard Admin
CREATE TABLE IF NOT EXISTS user_admin_dashboard_layouts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  layout  JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE user_admin_dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own admin layout"
  ON user_admin_dashboard_layouts FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
