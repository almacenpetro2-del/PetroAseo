-- ============================================================
-- Petro Aseo v1.0 - Esquema Supabase (PostgreSQL)
-- Ejecutar en SQL Editor del proyecto Supabase.
-- ============================================================

-- Extensión para gen_random_uuid()
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Tabla USUARIOS (perfil vinculado a auth.users)
-- La contraseña real vive en Supabase Auth; columna opcional legacy.
-- ------------------------------------------------------------
create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  usuario text not null unique,
  contraseña text,
  rol text not null check (rol in ('admin', 'rrhh', 'logistica', 'operaciones')),
  created_at timestamptz not null default now()
);

create index if not exists idx_usuarios_rol on public.usuarios (rol);

-- ------------------------------------------------------------
-- PRODUCTOS
-- ------------------------------------------------------------
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  unidad_medida text not null,
  categoria text not null,
  cantidad_stock integer not null default 0 check (cantidad_stock >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_productos_categoria on public.productos (categoria);

-- ------------------------------------------------------------
-- MOVIMIENTOS (entrada / salida; stock vía RPC transaccional)
-- ------------------------------------------------------------
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete restrict,
  cantidad integer not null check (cantidad > 0),
  tipo text not null check (tipo in ('entrada', 'salida')),
  fecha date not null,
  asignado_a text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_movimientos_fecha on public.movimientos (fecha);
create index if not exists idx_movimientos_producto on public.movimientos (producto_id);

-- ------------------------------------------------------------
-- HIDROLAVADORAS (no afecta stock)
-- ------------------------------------------------------------
create table if not exists public.hidrolavadoras (
  id uuid primary key default gen_random_uuid(),
  hidrolavadora text not null,
  producto text not null,
  cantidad integer not null check (cantidad > 0),
  fecha date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_hidrolavadoras_fecha on public.hidrolavadoras (fecha);

-- ------------------------------------------------------------
-- EPP / HERRAMIENTAS (no afecta stock; activo=false = baja personal)
-- ------------------------------------------------------------
create table if not exists public.epp_herramientas (
  id uuid primary key default gen_random_uuid(),
  trabajador text not null,
  producto text not null,
  fecha_entrega date not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_epp_trabajador on public.epp_herramientas (trabajador);
create index if not exists idx_epp_activo on public.epp_herramientas (activo);

-- ============================================================
-- FUNCIONES DE STOCK (security definer para consistencia)
-- ============================================================

/**
 * Aplica un movimiento y actualiza cantidad_stock del producto.
 * ENTRADA suma; SALIDA resta si hay stock suficiente.
 */
create or replace function public.registrar_movimiento(
  p_producto_id uuid,
  p_cantidad integer,
  p_tipo text,
  p_fecha date,
  p_asignado_a text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
  v_stock integer;
begin
  select cantidad_stock into v_stock from productos where id = p_producto_id for update;
  if not found then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  if p_tipo = 'entrada' then
    update productos
      set cantidad_stock = cantidad_stock + p_cantidad
      where id = p_producto_id;
  elsif p_tipo = 'salida' then
    if v_stock < p_cantidad then
      raise exception 'STOCK_INSUFICIENTE';
    end if;
    update productos
      set cantidad_stock = cantidad_stock - p_cantidad
      where id = p_producto_id;
  else
    raise exception 'TIPO_INVALIDO';
  end if;

  insert into movimientos (producto_id, cantidad, tipo, fecha, asignado_a)
  values (p_producto_id, p_cantidad, p_tipo, p_fecha, coalesce(p_asignado_a, ''))
  returning id into v_new_id;

  return v_new_id;
end;
$$;

/**
 * Elimina un movimiento y revierte el efecto sobre el stock.
 */
create or replace function public.eliminar_movimiento(p_movimiento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  select * into r from movimientos where id = p_movimiento_id for update;
  if not found then
    raise exception 'MOVIMIENTO_NO_ENCONTRADO';
  end if;

  if r.tipo = 'entrada' then
    update productos
      set cantidad_stock = greatest(0, cantidad_stock - r.cantidad)
      where id = r.producto_id;
  else
    update productos
      set cantidad_stock = cantidad_stock + r.cantidad
      where id = r.producto_id;
  end if;

  delete from movimientos where id = p_movimiento_id;
end;
$$;

/**
 * Actualiza movimiento: revierte el anterior y aplica el nuevo en una transacción lógica.
 */
create or replace function public.actualizar_movimiento(
  p_movimiento_id uuid,
  p_producto_id uuid,
  p_cantidad integer,
  p_tipo text,
  p_fecha date,
  p_asignado_a text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_stock integer;
begin
  select * into r from movimientos where id = p_movimiento_id for update;
  if not found then
    raise exception 'MOVIMIENTO_NO_ENCONTRADO';
  end if;

  -- Revertir efecto anterior
  if r.tipo = 'entrada' then
    update productos
      set cantidad_stock = greatest(0, cantidad_stock - r.cantidad)
      where id = r.producto_id;
  else
    update productos
      set cantidad_stock = cantidad_stock + r.cantidad
      where id = r.producto_id;
  end if;

  -- Aplicar nuevo efecto (mismo producto o distinto)
  select cantidad_stock into v_stock from productos where id = p_producto_id for update;
  if not found then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  if p_tipo = 'entrada' then
    update productos
      set cantidad_stock = cantidad_stock + p_cantidad
      where id = p_producto_id;
  elsif p_tipo = 'salida' then
    if v_stock < p_cantidad then
      raise exception 'STOCK_INSUFICIENTE';
    end if;
    update productos
      set cantidad_stock = cantidad_stock - p_cantidad
      where id = p_producto_id;
  else
    raise exception 'TIPO_INVALIDO';
  end if;

  update movimientos
    set producto_id = p_producto_id,
        cantidad = p_cantidad,
        tipo = p_tipo,
        fecha = p_fecha,
        asignado_a = coalesce(p_asignado_a, '')
    where id = p_movimiento_id;
end;
$$;

grant execute on function public.registrar_movimiento(uuid, integer, text, date, text) to authenticated;
grant execute on function public.eliminar_movimiento(uuid) to authenticated;
grant execute on function public.actualizar_movimiento(uuid, uuid, integer, text, date, text) to authenticated;

/**
 * Descuenta stock de productos (logística) al usar repuesto en correctivo.
 * No permite stock negativo.
 */
create or replace function public.descontar_stock_producto(p_producto_id uuid, p_cantidad integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return;
  end if;
  select cantidad_stock into v_stock from public.productos where id = p_producto_id for update;
  if not found then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;
  if v_stock < p_cantidad then
    raise exception 'STOCK_INSUFICIENTE';
  end if;
  update public.productos
    set cantidad_stock = cantidad_stock - p_cantidad
    where id = p_producto_id;
end;
$$;

grant execute on function public.descontar_stock_producto(uuid, integer) to authenticated;

-- ============================================================
-- Row Level Security (acceso para usuarios autenticados)
-- Ajustar políticas en producción según rol JWT si lo desea.
-- ============================================================
alter table public.usuarios enable row level security;
alter table public.productos enable row level security;
alter table public.movimientos enable row level security;
alter table public.hidrolavadoras enable row level security;
alter table public.epp_herramientas enable row level security;

create policy "usuarios_authenticated_all"
  on public.usuarios for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "productos_authenticated_all"
  on public.productos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "movimientos_authenticated_all"
  on public.movimientos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "hidrolavadoras_authenticated_all"
  on public.hidrolavadoras for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "epp_authenticated_all"
  on public.epp_herramientas for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- OPERACIONES — documentos y actas (metadatos + Storage bucket "operaciones")
-- ------------------------------------------------------------
create table if not exists public.operaciones_documentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_documento text not null check (tipo_documento in ('PDF', 'EXCEL', 'WORD')),
  fecha date not null,
  archivo_path text not null,
  archivo_nombre text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_op_doc_fecha on public.operaciones_documentos (fecha);
create index if not exists idx_op_doc_tipo on public.operaciones_documentos (tipo_documento);

create table if not exists public.operaciones_actas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('PDF', 'EXCEL', 'WORD', 'IMAGEN', 'OTRO')),
  fecha date not null,
  responsable text not null,
  archivo_path text not null,
  archivo_nombre text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_op_acta_fecha on public.operaciones_actas (fecha);
create index if not exists idx_op_acta_tipo on public.operaciones_actas (tipo);
create index if not exists idx_op_acta_resp on public.operaciones_actas (responsable);

-- ------------------------------------------------------------
-- OPERACIONES — mantenimiento (preventivo, correctivo, repuestos)
-- ------------------------------------------------------------
create table if not exists public.mant_equipos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  numero_serie_placa text not null,
  ubicacion text not null,
  marca text not null,
  caracteristicas text not null default '',
  sede text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (numero_serie_placa)
);

create index if not exists idx_mant_equipo_sede on public.mant_equipos (sede);

create table if not exists public.mant_planes (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.mant_equipos (id) on delete cascade,
  titulo text not null,
  anio integer not null check (anio >= 2000 and anio <= 2100),
  mes integer not null check (mes >= 1 and mes <= 12),
  created_at timestamptz not null default now(),
  unique (equipo_id, anio, mes)
);

create index if not exists idx_mant_plan_equipo on public.mant_planes (equipo_id);

create table if not exists public.mant_actividades_plan (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.mant_planes (id) on delete cascade,
  item_orden integer not null check (item_orden > 0),
  actividad text not null,
  fecha_programada date not null,
  frecuencia text not null,
  responsable text not null,
  estado text not null check (estado in ('Pendiente', 'En Proceso', 'Completado', 'Cancelado')),
  fecha_completado date,
  created_at timestamptz not null default now()
);

create index if not exists idx_mant_act_plan on public.mant_actividades_plan (plan_id);
create index if not exists idx_mant_act_fecha on public.mant_actividades_plan (fecha_programada);

create table if not exists public.mant_repuestos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  unidad text not null check (unidad in ('Unidad', 'Litro', 'Metro', 'Juego', 'Kit', 'Par')),
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_mant_repuesto_nombre on public.mant_repuestos (nombre);

create table if not exists public.mant_correctivos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.mant_equipos (id) on delete cascade,
  fecha_falla timestamptz not null,
  descripcion_falla text not null,
  actividad_realizada text not null default '',
  responsable text not null default '',
  estado text not null check (estado in ('Pendiente', 'En Reparación', 'Reparado')),
  fecha_reparado date,
  created_at timestamptz not null default now()
);

create index if not exists idx_mant_corr_equipo on public.mant_correctivos (equipo_id);
create index if not exists idx_mant_corr_estado on public.mant_correctivos (estado);
create index if not exists idx_mant_corr_fecha on public.mant_correctivos (fecha_falla);

create table if not exists public.mant_correctivo_repuestos (
  id uuid primary key default gen_random_uuid(),
  correctivo_id uuid not null references public.mant_correctivos (id) on delete cascade,
  repuesto_id uuid references public.mant_repuestos (id) on delete restrict,
  nombre_snapshot text not null,
  cantidad integer not null check (cantidad > 0)
);

create index if not exists idx_mant_corr_rep on public.mant_correctivo_repuestos (correctivo_id);
create index if not exists idx_mant_corr_repuesto on public.mant_correctivo_repuestos (repuesto_id);

-- ------------------------------------------------------------
-- RECURSOS HUMANOS — personal activo / cesado
-- ------------------------------------------------------------
create table if not exists public.personal_activo (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  dni text not null unique,
  celular text not null,
  turno text not null check (turno in ('Mañana', 'Tarde', 'Noche')),
  area text not null check (area in ('Barrido', 'Lavado', 'Conductor', 'Operaciones')),
  modalidad text not null check (modalidad in ('planilla', 'rh')),
  talla_zapato text not null default '',
  talla_polo text not null default '',
  talla_pantalon text not null default '',
  fecha_ingreso date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_personal_activo_area on public.personal_activo (area);
create index if not exists idx_personal_activo_turno on public.personal_activo (turno);
create index if not exists idx_personal_activo_modalidad on public.personal_activo (modalidad);

create table if not exists public.personal_cesado (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  dni text not null,
  celular text not null,
  turno text not null,
  area text not null,
  modalidad text not null,
  talla_zapato text not null default '',
  talla_polo text not null default '',
  talla_pantalon text not null default '',
  fecha_ingreso date not null,
  fecha_cese date not null,
  motivo text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_personal_cesado_dni on public.personal_cesado (dni);
create index if not exists idx_personal_cesado_area on public.personal_cesado (area);
create index if not exists idx_personal_cesado_fecha_cese on public.personal_cesado (fecha_cese);

create table if not exists public.asistencia (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  fecha date not null,
  turno text not null check (turno in ('Mañana', 'Tarde', 'Noche')),
  estado text not null check (estado in ('Presente', 'Ausente')) default 'Ausente',
  es_extra boolean not null default false,
  created_at timestamptz not null default now(),
  unique(personal_id, fecha, turno)
);

create index if not exists idx_asistencia_fecha on public.asistencia (fecha);
create index if not exists idx_asistencia_turno on public.asistencia (turno);
create index if not exists idx_asistencia_personal on public.asistencia (personal_id);

create table if not exists public.vacaciones (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  dni text not null,
  nombre text not null,
  fecha_salida date not null,
  dias_vacaciones integer not null check (dias_vacaciones > 0),
  fecha_regreso date not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vacaciones_personal on public.vacaciones (personal_id);
create index if not exists idx_vacaciones_fecha_regreso on public.vacaciones (fecha_regreso);

/**
 * Traslada un registro de personal_activo a personal_cesado y lo elimina de activo (transacción).
 */
create or replace function public.cesar_personal(p_id uuid, p_fecha_cese date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.personal_activo%rowtype;
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'MOTIVO_REQUERIDO';
  end if;
  select * into r from public.personal_activo where id = p_id for update;
  if not found then
    raise exception 'PERSONAL_NO_ENCONTRADO';
  end if;

  insert into public.personal_cesado (
    nombres, dni, celular, turno, area, modalidad,
    talla_zapato, talla_polo, talla_pantalon,
    fecha_ingreso, fecha_cese, motivo
  )
  values (
    r.nombres, r.dni, r.celular, r.turno, r.area, r.modalidad,
    coalesce(r.talla_zapato, ''), coalesce(r.talla_polo, ''), coalesce(r.talla_pantalon, ''),
    r.fecha_ingreso, p_fecha_cese, btrim(p_motivo)
  );

  delete from public.personal_activo where id = p_id;
end;
$$;

grant execute on function public.cesar_personal(uuid, date, text) to authenticated;

/**
 * Reincorpora un registro de personal_cesado a personal_activo y lo elimina de cesado (transacción).
 */
create or replace function public.incorporar_personal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.personal_cesado%rowtype;
begin
  select * into r from public.personal_cesado where id = p_id for update;
  if not found then
    raise exception 'PERSONAL_CESADO_NO_ENCONTRADO';
  end if;

  insert into public.personal_activo (
    nombres, dni, celular, turno, area, modalidad,
    talla_zapato, talla_polo, talla_pantalon,
    fecha_ingreso
  )
  values (
    r.nombres, r.dni, r.celular, r.turno, r.area, r.modalidad,
    coalesce(r.talla_zapato, ''), coalesce(r.talla_polo, ''), coalesce(r.talla_pantalon, ''),
    r.fecha_ingreso
  );

  delete from public.personal_cesado where id = p_id;
end;
$$;

grant execute on function public.incorporar_personal(uuid) to authenticated;

alter table public.operaciones_documentos enable row level security;
alter table public.operaciones_actas enable row level security;
alter table public.mant_equipos enable row level security;
alter table public.mant_planes enable row level security;
alter table public.mant_actividades_plan enable row level security;
alter table public.mant_repuestos enable row level security;
alter table public.mant_correctivos enable row level security;
alter table public.mant_correctivo_repuestos enable row level security;
alter table public.personal_activo enable row level security;
alter table public.personal_cesado enable row level security;
alter table public.asistencia enable row level security;

create policy "op_doc_authenticated_all"
  on public.operaciones_documentos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "op_acta_authenticated_all"
  on public.operaciones_actas for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_equipos_authenticated_all"
  on public.mant_equipos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_planes_authenticated_all"
  on public.mant_planes for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_actividades_authenticated_all"
  on public.mant_actividades_plan for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_repuestos_authenticated_all"
  on public.mant_repuestos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_correctivos_authenticated_all"
  on public.mant_correctivos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "mant_correctivo_rep_authenticated_all"
  on public.mant_correctivo_repuestos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "personal_activo_authenticated_all"
  on public.personal_activo for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "personal_cesado_authenticated_all"
  on public.personal_cesado for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "asistencia_authenticated_all"
  on public.asistencia for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "vacaciones_authenticated_all"
  on public.vacaciones for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter table public.vacaciones enable row level security;

create table if not exists public.incidencias (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  dni text not null,
  nombre text not null,
  tipo text not null check (tipo in ('Amonestación', 'Permiso', 'Falta', 'Suspensión', 'Otro')),
  gravedad text not null check (gravedad in ('Leve', 'Grave', 'Muy grave')),
  fecha_incidencia date not null,
  descripcion text not null default '',
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Resuelta', 'Archivada')),
  fecha_resolucion date,
  documento_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_incidencias_personal on public.incidencias (personal_id);
create index if not exists idx_incidencias_estado on public.incidencias (estado);
create index if not exists idx_incidencias_fecha on public.incidencias (fecha_incidencia);

alter table public.incidencias enable row level security;

create policy "incidencias_authenticated_all"
  on public.incidencias for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create table if not exists public.descansos_medicos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal_activo (id) on delete cascade,
  dni text not null,
  nombre text not null,
  motivo text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  dias_descanso integer not null,
  diagnostico text not null default '',
  medico_tratante text not null default '',
  nro_certificado text not null default '',
  documento_url text,
  estado text not null default 'Activo' check (estado in ('Activo', 'Finalizado')),
  created_at timestamptz not null default now()
);

create index if not exists idx_descansos_personal on public.descansos_medicos (personal_id);
create index if not exists idx_descansos_fecha_fin on public.descansos_medicos (fecha_fin);

alter table public.descansos_medicos enable row level security;

create policy "descansos_medicos_authenticated_all"
  on public.descansos_medicos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Bucket Storage (privado; URLs firmadas desde el cliente). Límite ~10MB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('operaciones', 'operaciones', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('incidencias', 'incidencias', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('descansos', 'descansos', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "storage_operaciones_select" on storage.objects;
drop policy if exists "storage_operaciones_insert" on storage.objects;
drop policy if exists "storage_operaciones_update" on storage.objects;
drop policy if exists "storage_operaciones_delete" on storage.objects;

create policy "storage_operaciones_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'operaciones');

create policy "storage_operaciones_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'operaciones');

create policy "storage_operaciones_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'operaciones')
  with check (bucket_id = 'operaciones');

create policy "storage_operaciones_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'operaciones');

drop policy if exists "storage_incidencias_select" on storage.objects;
drop policy if exists "storage_incidencias_insert" on storage.objects;
drop policy if exists "storage_incidencias_update" on storage.objects;
drop policy if exists "storage_incidencias_delete" on storage.objects;

create policy "storage_incidencias_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'incidencias');

create policy "storage_incidencias_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'incidencias');

create policy "storage_incidencias_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'incidencias')
  with check (bucket_id = 'incidencias');

create policy "storage_incidencias_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'incidencias');

drop policy if exists "storage_descansos_select" on storage.objects;
drop policy if exists "storage_descansos_insert" on storage.objects;
drop policy if exists "storage_descansos_update" on storage.objects;
drop policy if exists "storage_descansos_delete" on storage.objects;

create policy "storage_descansos_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'descansos');

create policy "storage_descansos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'descansos');

create policy "storage_descansos_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'descansos')
  with check (bucket_id = 'descansos');

create policy "storage_descansos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'descansos');

-- ============================================================
-- FLOTA — Seguimiento de vehículos (ciclo: turno → mercado → lavado → mercado)
-- ============================================================
create table if not exists public.flota_vehiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  chofer text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.flota_eventos (
  id uuid primary key default gen_random_uuid(),
  vehiculo_id uuid not null references public.flota_vehiculos (id) on delete cascade,
  evento text not null check (evento in ('inicio_turno', 'salida_mercado', 'llega_lavado', 'salida_lavado', 'llega_mercado')),
  chofer text not null,
  viaje integer not null check (viaje > 0),
  tiket_emmsa_numero text,
  tiket_emmsa_hora text,
  tiket_emmsa_peso text,
  tiket_petromas_numero text,
  tiket_petromas_peso text,
  tiket_ingreso text,
  numero_guia text,
  incidencias text,
  tiempo_desde_anterior real not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_flota_eventos_vehiculo on public.flota_eventos (vehiculo_id);
create index if not exists idx_flota_eventos_created on public.flota_eventos (created_at desc);

alter table public.flota_vehiculos enable row level security;
alter table public.flota_eventos enable row level security;

create policy "flota_vehiculos_authenticated_all"
  on public.flota_vehiculos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "flota_eventos_authenticated_all"
  on public.flota_eventos for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ============================================================
-- PRIMER ADMINISTRADOR (después de crear el usuario en Authentication)
-- Reemplace :uuid y correo por los valores reales de auth.users:
--
-- insert into public.usuarios (id, nombre, usuario, rol)
-- values ('UUID_DE_AUTH_USERS', 'ADMINISTRADOR', 'admin@su-dominio.com', 'admin');
-- ============================================================
