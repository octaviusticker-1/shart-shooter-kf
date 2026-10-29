-- Shart Shooter KF content and admin setup.
-- Run this file in the Supabase SQL Editor before publishing the site.
-- Never put a Supabase service_role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

drop policy if exists "Admins can view their own admin record" on public.site_admins;
create policy "Admins can view their own admin record"
  on public.site_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.site_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 1200),
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 100),
  jersey_number text not null default '',
  position text not null default '',
  bio text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  opponent text not null check (char_length(opponent) between 1 and 120),
  game_date timestamptz not null,
  location text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed')),
  home_score integer check (home_score is null or home_score >= 0),
  opponent_score integer check (opponent_score is null or opponent_score >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (
    status <> 'completed'
    or (home_score is not null and opponent_score is not null)
  )
);

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  caption text not null default '',
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;
alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.gallery_photos enable row level security;

drop policy if exists "Published announcements are public" on public.announcements;
create policy "Published announcements are public"
  on public.announcements for select to anon, authenticated
  using (is_published);
drop policy if exists "Admins can view all announcements" on public.announcements;
create policy "Admins can view all announcements"
  on public.announcements for select to authenticated
  using ((select public.is_site_admin()));
drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements"
  on public.announcements for all to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Roster is public" on public.players;
create policy "Roster is public"
  on public.players for select to anon, authenticated
  using (true);
drop policy if exists "Admins manage roster" on public.players;
create policy "Admins manage roster"
  on public.players for all to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Schedule and scores are public" on public.games;
create policy "Schedule and scores are public"
  on public.games for select to anon, authenticated
  using (true);
drop policy if exists "Admins manage games" on public.games;
create policy "Admins manage games"
  on public.games for all to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "Gallery is public" on public.gallery_photos;
create policy "Gallery is public"
  on public.gallery_photos for select to anon, authenticated
  using (true);
drop policy if exists "Admins manage gallery" on public.gallery_photos;
create policy "Admins manage gallery"
  on public.gallery_photos for all to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

grant select on public.announcements, public.players, public.games, public.gallery_photos
  to anon, authenticated;
grant select on public.site_admins to authenticated;
grant insert, update, delete on public.announcements, public.players, public.games, public.gallery_photos
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-gallery',
  'team-gallery',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Team gallery photos are public" on storage.objects;
create policy "Team gallery photos are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'team-gallery');

drop policy if exists "Admins upload team photos" on storage.objects;
create policy "Admins upload team photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-gallery'
    and (select public.is_site_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Admins remove team photos" on storage.objects;
create policy "Admins remove team photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-gallery'
    and (select public.is_site_admin())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- One-time admin setup:
-- 1. In Supabase Authentication > Users, create the admin account.
-- 2. Replace the email below and run this query in the SQL Editor.
-- 3. Do not enable public sign-ups for this site.
--
-- insert into public.site_admins (user_id)
-- select id from auth.users where lower(email) = lower('admin@example.com')
-- on conflict (user_id) do nothing;
