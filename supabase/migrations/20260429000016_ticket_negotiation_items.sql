create table if not exists ticket_negotiation_items (
  id          uuid        primary key default gen_random_uuid(),
  ticket_id   uuid        not null references tickets(id) on delete cascade,
  product_id  uuid        references deal_catalog_products(id) on delete set null,
  product_name text       not null,
  unit_price  numeric(12,2) not null default 0,
  quantity    integer     not null default 1,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists ticket_negotiation_items_ticket_id_idx
  on ticket_negotiation_items(ticket_id);

alter table ticket_negotiation_items enable row level security;

create policy "authenticated users can manage negotiation items"
  on ticket_negotiation_items for all
  to authenticated
  using (true)
  with check (true);
