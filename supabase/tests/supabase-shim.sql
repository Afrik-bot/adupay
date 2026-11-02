-- Minimal stand-in for what a Supabase database provides before migrations run:
-- the anon/authenticated/service_role roles, default grants, and the parts of the
-- auth schema our migrations and seed touch. Used only by the PGlite test harness.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text,
  phone text unique,
  phone_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  confirmation_token text,
  recovery_token text,
  email_change_token_new text,
  email_change text,
  created_at timestamptz,
  updated_at timestamptz
);

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

create function auth.role() returns text
language sql stable as $$
  select current_setting('request.jwt.claims', true)::json ->> 'role';
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
