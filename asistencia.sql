-- ============================================================
-- Petro Aseo v1.0 - Submódulo ASISTENCIA (pase de lista)
-- Ejecutar en SQL Editor de Supabase.
-- ATENCIÓN: ELIMINA y recrea la tabla asistencia.
-- ============================================================

create extension if not exists "pgcrypto";

-- Eliminar constraint y tabla previos
alter table if exists public.asistencia drop constraint if exists asistencia_estado_check cascade;
drop table if exists public.asistencia cascade;

-- ------------------------------------------------------------
-- ASISTENCIA (registro diario por turno)
-- ------------------------------------------------------------
create table public.asistencia (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  fecha date not null,
  turno text not null check (turno in ('Mañana', 'Tarde', 'Noche')),
  estado text not null check (estado in ('Presente', 'Ausente', 'Descanso')) default 'Ausente',
  es_extra boolean not null default false,
  created_at timestamptz not null default now(),
  unique(personal_id, fecha, turno)
);

create index if not exists idx_asistencia_fecha on public.asistencia (fecha);
create index if not exists idx_asistencia_turno on public.asistencia (turno);
create index if not exists idx_asistencia_personal on public.asistencia (personal_id);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.asistencia enable row level security;

create policy "asistencia_authenticated_all"
  on public.asistencia for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
