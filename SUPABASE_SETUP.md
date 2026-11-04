# Velfrok Supabase setup

The admin and order workflows require the database migrations in this repository to be applied in order.

## Apply migrations

1. Open the Supabase project linked to Velfrok.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run the contents of these files in order:
   - `supabase/migrations/001_store_schema.sql`
   - `supabase/migrations/002_admin_operations.sql`
   - `supabase/migrations/003_order_workflows.sql`
   - `supabase/migrations/004_product_image_storage.sql`

Do not paste any service-role key into GitHub files, browser code, or chat.

## Authorize the store owner as an admin

After signing in to the Velfrok website once with the account that should administer the store, run this SQL in the Supabase SQL Editor. Replace the email with the exact email used for that account:

```sql
insert into public.velfrok_admins (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL')
on conflict (user_id) do nothing;
```

The admin dashboard also requires Supabase Auth MFA to be enrolled and verified. The app checks for the verified administrator membership and the `aal2` assurance level before allowing admin API operations.

## Product image uploads

The image upload endpoint accepts JPG, PNG, and WebP images up to 2 MB each. The storage migration creates the public-read `product-images` bucket; only verified administrators can upload, update, or delete objects through the app.

## Important

The migrations create database structures and functions; committing them to GitHub does not execute them in the Supabase project. Until they are applied and an administrator is authorized, protected admin operations will return an authorization or database setup error.
