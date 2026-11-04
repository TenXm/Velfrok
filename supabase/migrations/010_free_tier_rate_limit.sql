-- Free-tier database-backed rate limiting when Upstash is not configured.
begin;
create table if not exists public.velfrok_rate_limits (
  bucket_key text primary key,
  request_count integer not null,
  window_started_at timestamptz not null
);
alter table public.velfrok_rate_limits enable row level security;
revoke all on table public.velfrok_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.velfrok_rate_limits to service_role;

create or replace function public.velfrok_rate_limit_increment(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if p_key is null or length(p_key)=0 or length(p_key)>240
     or p_limit<1 or p_limit>10000
     or p_window_seconds<1 or p_window_seconds>86400 then
    raise exception 'Invalid rate limit arguments';
  end if;

  insert into public.velfrok_rate_limits(bucket_key,request_count,window_started_at)
  values(p_key,1,now())
  on conflict(bucket_key) do update
    set request_count = case
          when public.velfrok_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
          else public.velfrok_rate_limits.request_count + 1
        end,
        window_started_at = case
          when public.velfrok_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
          else public.velfrok_rate_limits.window_started_at
        end
  returning request_count into v_count;

  delete from public.velfrok_rate_limits
   where window_started_at < now() - interval '2 days';

  return v_count;
end;
$$;
revoke all on function public.velfrok_rate_limit_increment(text,integer,integer) from public, anon, authenticated;
grant execute on function public.velfrok_rate_limit_increment(text,integer,integer) to service_role;
commit;
