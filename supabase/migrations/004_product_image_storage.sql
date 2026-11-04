-- Public product image bucket; uploads are accepted only through the verified admin API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view product images" on storage.objects;
create policy "public can view product images"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "verified admins upload product images" on storage.objects;
create policy "verified admins upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images' and public.is_verified_admin());

drop policy if exists "verified admins update product images" on storage.objects;
create policy "verified admins update product images"
on storage.objects for update
to authenticated
using (bucket_id = 'product-images' and public.is_verified_admin())
with check (bucket_id = 'product-images' and public.is_verified_admin());

drop policy if exists "verified admins delete product images" on storage.objects;
create policy "verified admins delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images' and public.is_verified_admin());
