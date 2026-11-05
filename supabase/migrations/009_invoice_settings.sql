create table if not exists public.invoice_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Velfrok',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  gst_number text not null default '',
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 100),
  tax_label text not null default '',
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  terms text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.invoice_settings enable row level security;
revoke all on public.invoice_settings from anon, authenticated;
