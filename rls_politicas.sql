-- ============================================================
-- Petro Aseo v1.0 - POLÍTICAS RLS POR ROL
-- Ejecutar en SQL Editor de Supabase.
-- ELIMINA políticas anteriores y crea las nuevas basadas en rol.
-- ============================================================

-- ------------------------------------------------------------
-- Función auxiliar: rol de la aplicación del usuario autenticado
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.usuarios where id = auth.uid();
$$;

grant execute on function public.current_user_role() to authenticated;

-- ------------------------------------------------------------
-- ELIMINAR TODAS LAS POLÍTICAS ANTERIORES
-- ------------------------------------------------------------
drop policy if exists "usuarios_authenticated_all" on public.usuarios;
drop policy if exists "productos_authenticated_all" on public.productos;
drop policy if exists "movimientos_authenticated_all" on public.movimientos;
drop policy if exists "hidrolavadoras_authenticated_all" on public.hidrolavadoras;
drop policy if exists "epp_authenticated_all" on public.epp_herramientas;
drop policy if exists "op_doc_authenticated_all" on public.operaciones_documentos;
drop policy if exists "op_acta_authenticated_all" on public.operaciones_actas;
drop policy if exists "mant_equipos_authenticated_all" on public.mant_equipos;
drop policy if exists "mant_planes_authenticated_all" on public.mant_planes;
drop policy if exists "mant_actividades_authenticated_all" on public.mant_actividades_plan;
drop policy if exists "mant_repuestos_authenticated_all" on public.mant_repuestos;
drop policy if exists "mant_correctivos_authenticated_all" on public.mant_correctivos;
drop policy if exists "mant_correctivo_rep_authenticated_all" on public.mant_correctivo_repuestos;
drop policy if exists "personal_activo_authenticated_all" on public.personal_activo;
drop policy if exists "personal_cesado_authenticated_all" on public.personal_cesado;
drop policy if exists "asistencia_authenticated_all" on public.asistencia;
drop policy if exists "vacaciones_authenticated_all" on public.vacaciones;
drop policy if exists "incidencias_authenticated_all" on public.incidencias;
drop policy if exists "descansos_medicos_authenticated_all" on public.descansos_medicos;
drop policy if exists "flota_vehiculos_authenticated_all" on public.flota_vehiculos;
drop policy if exists "flota_eventos_authenticated_all" on public.flota_eventos;
drop policy if exists "prog_desc_authenticated_all" on public.programacion_descansos;
drop policy if exists "notificaciones_authenticated_all" on public.notificaciones;

-- ============================================================
-- 1. USUARIOS
--    Cada autenticado puede leer su propio registro (login/carga de perfil)
--    Solo admin puede modificar
-- ============================================================
create policy "usuarios_select_own" on public.usuarios for select
  using (id = auth.uid());
create policy "usuarios_insert_admin" on public.usuarios for insert
  with check (
    (select count(*) from public.usuarios) = 0
    or
    (select rol from public.usuarios where id = auth.uid()) = 'admin'
  );
create policy "usuarios_update_admin" on public.usuarios for update
  using ((select rol from public.usuarios where id = auth.uid()) = 'admin');
create policy "usuarios_delete_admin" on public.usuarios for delete
  using ((select rol from public.usuarios where id = auth.uid()) = 'admin');

-- ============================================================
-- 2. LOGÍSTICA (productos, movimientos, hidrolavadoras, epp_herramientas)
--    admin: todo | logistica: SELECT + INSERT
-- ============================================================

-- PRODUCTOS
create policy "prod_select" on public.productos for select
  using (current_user_role() in ('admin', 'logistica'));
create policy "prod_insert" on public.productos for insert
  with check (current_user_role() in ('admin', 'logistica'));
create policy "prod_update" on public.productos for update
  using (current_user_role() = 'admin');
create policy "prod_delete" on public.productos for delete
  using (current_user_role() = 'admin');

-- MOVIMIENTOS
create policy "mov_select" on public.movimientos for select
  using (current_user_role() in ('admin', 'logistica'));
create policy "mov_insert" on public.movimientos for insert
  with check (current_user_role() in ('admin', 'logistica'));
create policy "mov_update" on public.movimientos for update
  using (current_user_role() = 'admin');
create policy "mov_delete" on public.movimientos for delete
  using (current_user_role() = 'admin');

-- HIDROLAVADORAS
create policy "hidro_select" on public.hidrolavadoras for select
  using (current_user_role() in ('admin', 'logistica'));
create policy "hidro_insert" on public.hidrolavadoras for insert
  with check (current_user_role() in ('admin', 'logistica'));
create policy "hidro_update" on public.hidrolavadoras for update
  using (current_user_role() = 'admin');
create policy "hidro_delete" on public.hidrolavadoras for delete
  using (current_user_role() = 'admin');

-- EPP / HERRAMIENTAS
create policy "epp_select" on public.epp_herramientas for select
  using (current_user_role() in ('admin', 'logistica'));
create policy "epp_insert" on public.epp_herramientas for insert
  with check (current_user_role() in ('admin', 'logistica'));
create policy "epp_update" on public.epp_herramientas for update
  using (current_user_role() = 'admin');
create policy "epp_delete" on public.epp_herramientas for delete
  using (current_user_role() = 'admin');

-- ============================================================
-- 3. RRHH (personal_activo, personal_cesado, asistencia, vacaciones,
--          incidencias, descansos_medicos)
--    admin: todo | rrhh: todo | operaciones: SELECT solo personal_activo
-- ============================================================

-- PERSONAL ACTIVO
create policy "pa_select" on public.personal_activo for select
  using (current_user_role() in ('admin', 'rrhh', 'operaciones'));
create policy "pa_insert" on public.personal_activo for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "pa_update" on public.personal_activo for update
  using (current_user_role() in ('admin', 'rrhh'));
create policy "pa_delete" on public.personal_activo for delete
  using (current_user_role() in ('admin', 'rrhh'));

-- PERSONAL CESADO
create policy "pc_select" on public.personal_cesado for select
  using (current_user_role() in ('admin', 'rrhh'));
create policy "pc_insert" on public.personal_cesado for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "pc_update" on public.personal_cesado for update
  using (current_user_role() in ('admin', 'rrhh'));
create policy "pc_delete" on public.personal_cesado for delete
  using (current_user_role() in ('admin', 'rrhh'));

-- ASISTENCIA
create policy "asist_select" on public.asistencia for select
  using (current_user_role() in ('admin', 'rrhh', 'operaciones'));
create policy "asist_insert" on public.asistencia for insert
  with check (current_user_role() in ('admin', 'rrhh', 'operaciones'));
create policy "asist_update" on public.asistencia for update
  using (current_user_role() in ('admin', 'rrhh', 'operaciones'));
create policy "asist_delete" on public.asistencia for delete
  using (current_user_role() in ('admin', 'rrhh', 'operaciones'));

-- VACACIONES
create policy "vac_select" on public.vacaciones for select
  using (current_user_role() in ('admin', 'rrhh'));
create policy "vac_insert" on public.vacaciones for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "vac_update" on public.vacaciones for update
  using (current_user_role() in ('admin', 'rrhh'));
create policy "vac_delete" on public.vacaciones for delete
  using (current_user_role() in ('admin', 'rrhh'));

-- INCIDENCIAS
create policy "inc_select" on public.incidencias for select
  using (current_user_role() in ('admin', 'rrhh'));
create policy "inc_insert" on public.incidencias for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "inc_update" on public.incidencias for update
  using (current_user_role() in ('admin', 'rrhh'));
create policy "inc_delete" on public.incidencias for delete
  using (current_user_role() in ('admin', 'rrhh'));

-- DESCANSOS MÉDICOS
create policy "dm_select" on public.descansos_medicos for select
  using (current_user_role() in ('admin', 'rrhh'));
create policy "dm_insert" on public.descansos_medicos for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "dm_update" on public.descansos_medicos for update
  using (current_user_role() in ('admin', 'rrhh'));
create policy "dm_delete" on public.descansos_medicos for delete
  using (current_user_role() in ('admin', 'rrhh'));

-- ============================================================
-- 4. OPERACIONES (documentos, actas, mantenimiento, flota,
--                 programacion_descansos)
--    admin: todo | operaciones: SELECT + INSERT | rrhh: SELECT
-- ============================================================

-- OPERACIONES DOCUMENTOS
create policy "opdoc_select" on public.operaciones_documentos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "opdoc_insert" on public.operaciones_documentos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "opdoc_update" on public.operaciones_documentos for update
  using (current_user_role() = 'admin');
create policy "opdoc_delete" on public.operaciones_documentos for delete
  using (current_user_role() = 'admin');

-- OPERACIONES ACTAS
create policy "opacta_select" on public.operaciones_actas for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "opacta_insert" on public.operaciones_actas for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "opacta_update" on public.operaciones_actas for update
  using (current_user_role() = 'admin');
create policy "opacta_delete" on public.operaciones_actas for delete
  using (current_user_role() = 'admin');

-- MANT EQUIPOS
create policy "manteq_select" on public.mant_equipos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "manteq_insert" on public.mant_equipos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "manteq_update" on public.mant_equipos for update
  using (current_user_role() = 'admin');
create policy "manteq_delete" on public.mant_equipos for delete
  using (current_user_role() = 'admin');

-- MANT PLANES
create policy "mantplan_select" on public.mant_planes for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "mantplan_insert" on public.mant_planes for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "mantplan_update" on public.mant_planes for update
  using (current_user_role() = 'admin');
create policy "mantplan_delete" on public.mant_planes for delete
  using (current_user_role() = 'admin');

-- MANT ACTIVIDADES PLAN
create policy "mantact_select" on public.mant_actividades_plan for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "mantact_insert" on public.mant_actividades_plan for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "mantact_update" on public.mant_actividades_plan for update
  using (current_user_role() = 'admin');
create policy "mantact_delete" on public.mant_actividades_plan for delete
  using (current_user_role() = 'admin');

-- MANT REPUESTOS
create policy "mantrep_select" on public.mant_repuestos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "mantrep_insert" on public.mant_repuestos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "mantrep_update" on public.mant_repuestos for update
  using (current_user_role() = 'admin');
create policy "mantrep_delete" on public.mant_repuestos for delete
  using (current_user_role() = 'admin');

-- MANT CORRECTIVOS
create policy "mantcorr_select" on public.mant_correctivos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "mantcorr_insert" on public.mant_correctivos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "mantcorr_update" on public.mant_correctivos for update
  using (current_user_role() = 'admin');
create policy "mantcorr_delete" on public.mant_correctivos for delete
  using (current_user_role() = 'admin');

-- MANT CORRECTIVO REPUESTOS
create policy "mantcr_select" on public.mant_correctivo_repuestos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "mantcr_insert" on public.mant_correctivo_repuestos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "mantcr_update" on public.mant_correctivo_repuestos for update
  using (current_user_role() = 'admin');
create policy "mantcr_delete" on public.mant_correctivo_repuestos for delete
  using (current_user_role() = 'admin');

-- FLOTA VEHÍCULOS
create policy "flotav_select" on public.flota_vehiculos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "flotav_insert" on public.flota_vehiculos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "flotav_update" on public.flota_vehiculos for update
  using (current_user_role() = 'admin');
create policy "flotav_delete" on public.flota_vehiculos for delete
  using (current_user_role() = 'admin');

-- FLOTA EVENTOS
create policy "flotae_select" on public.flota_eventos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "flotae_insert" on public.flota_eventos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "flotae_update" on public.flota_eventos for update
  using (current_user_role() = 'admin');
create policy "flotae_delete" on public.flota_eventos for delete
  using (current_user_role() = 'admin');

-- PROGRAMACIÓN DESCANSOS
create policy "progdesc_select" on public.programacion_descansos for select
  using (current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));
create policy "progdesc_insert" on public.programacion_descansos for insert
  with check (current_user_role() in ('admin', 'operaciones'));
create policy "progdesc_update" on public.programacion_descansos for update
  using (current_user_role() = 'admin');
create policy "progdesc_delete" on public.programacion_descansos for delete
  using (current_user_role() = 'admin');

-- ============================================================
-- 5. NOTIFICACIONES
--    Todos los autenticados pueden SELECT + UPDATE (marcar leída)
--    admin: ALL
-- ============================================================
create policy "notif_select" on public.notificaciones for select
  using (current_user_role() in ('admin', 'logistica', 'rrhh', 'operaciones'));
create policy "notif_insert" on public.notificaciones for insert
  with check (current_user_role() in ('admin', 'rrhh'));
create policy "notif_update" on public.notificaciones for update
  using (current_user_role() in ('admin', 'logistica', 'rrhh', 'operaciones'));
create policy "notif_delete" on public.notificaciones for delete
  using (current_user_role() = 'admin');

-- ============================================================
-- 6. BUCKET STORAGE "operaciones" (admin + operaciones: todo)
--    rrhh: solo SELECT
-- ============================================================
drop policy if exists "storage_operaciones_select" on storage.objects;
drop policy if exists "storage_operaciones_insert" on storage.objects;
drop policy if exists "storage_operaciones_update" on storage.objects;
drop policy if exists "storage_operaciones_delete" on storage.objects;

create policy "storage_operaciones_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'operaciones' and current_user_role() in ('admin', 'operaciones', 'rrhh', 'logistica'));

create policy "storage_operaciones_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'operaciones' and current_user_role() in ('admin', 'operaciones'));

create policy "storage_operaciones_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'operaciones' and current_user_role() in ('admin', 'operaciones'))
  with check (bucket_id = 'operaciones' and current_user_role() in ('admin', 'operaciones'));

create policy "storage_operaciones_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'operaciones' and current_user_role() = 'admin');

drop policy if exists "storage_incidencias_select" on storage.objects;
drop policy if exists "storage_incidencias_insert" on storage.objects;
drop policy if exists "storage_incidencias_update" on storage.objects;
drop policy if exists "storage_incidencias_delete" on storage.objects;

create policy "storage_incidencias_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'incidencias' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_incidencias_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'incidencias' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_incidencias_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'incidencias' and current_user_role() in ('admin', 'rrhh'))
  with check (bucket_id = 'incidencias' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_incidencias_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'incidencias' and current_user_role() = 'admin');

drop policy if exists "storage_descansos_select" on storage.objects;
drop policy if exists "storage_descansos_insert" on storage.objects;
drop policy if exists "storage_descansos_update" on storage.objects;
drop policy if exists "storage_descansos_delete" on storage.objects;

create policy "storage_descansos_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'descansos' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_descansos_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'descansos' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_descansos_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'descansos' and current_user_role() in ('admin', 'rrhh'))
  with check (bucket_id = 'descansos' and current_user_role() in ('admin', 'rrhh'));

create policy "storage_descansos_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'descansos' and current_user_role() = 'admin');
