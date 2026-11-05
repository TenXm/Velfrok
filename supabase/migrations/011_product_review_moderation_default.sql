-- Existing installations: newly submitted reviews must wait for admin moderation.
alter table public.product_reviews
  alter column is_approved set default false;
