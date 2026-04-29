alter table tasks add column if not exists rd_task_id text unique;
alter table tasks add column if not exists rd_deal_id text;
