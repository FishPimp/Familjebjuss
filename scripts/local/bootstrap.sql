-- Lokal testmiljö: efterliknar det som redan finns i en ny Supabase-databas
-- (roller, scheman och lagringstabeller) så att våra migreringar kan testas här.
-- Körs INTE mot riktiga Supabase.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password 'postgres';
grant anon, authenticated, service_role to authenticator;
create role supabase_auth_admin login createrole noinherit password 'postgres';
create role supabase_storage_admin login createrole noinherit password 'postgres';
alter role postgres password 'postgres';

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists postgis with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant create, usage on schema auth to postgres;
alter role supabase_auth_admin set search_path = auth;

-- Samma standardrättigheter som Supabase ger schemat public
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Förenklad kopia av Supabase Storage-schemat
create schema storage authorization supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  owner_id text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  avif_autodetection boolean default false,
  type text default 'STANDARD',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  owner_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  user_metadata jsonb,
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

create function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

create function storage.filename(name text) returns text
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;

grant all on storage.buckets, storage.objects to anon, authenticated, service_role, postgres;
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;

create publication supabase_realtime;
