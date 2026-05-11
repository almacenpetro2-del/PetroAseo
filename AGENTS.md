# AGENTS.md - PETRO ASEO Sistema de Gestión

## Project Type
Plain static SPA (HTML + ES modules). No build system, no package.json.

## Entry Points
- `index.html` - Login page
- `dashboard.html` - Main SPA (requires auth)

## Tech Stack
- Frontend: Vanilla JS (ES modules), hash-based routing (#/ruta)
- Backend: Supabase (PostgreSQL + Auth + Storage)
- Dependencies via CDN: Chart.js, SheetJS (xlsx), PDF.js, pdf-lib, mammoth, html2pdf

## Commands
- Run locally: Open `index.html` in browser or serve with any static server
- No build, lint, or test commands exist

## Database
- Schema: `schema.sql` (execute in Supabase SQL Editor)
- Tables: usuarios, productos, movimientos, hidr lavadoras, epp_herramientas, operaciones_documentos, operaciones_actas, personal_activo, personal_cesado
- Key functions: `registrar_movimiento()`, `eliminar_movimiento()`, `actualizar_movimiento()`, `cesar_personal()`

## Config
- `js/config.js` - Supabase URL, anon key, app version (1.0)

## Access Control
Roles: admin, rrhh, logistica, operaciones
- Default routes by rol defined in `js/router.js:rutaDefaultPorRol()`
- Visibility via `nav-hidden` CSS class checked against user permissions

## Known Quirks
- RLS policies grant full access to any authenticated user (production should restrict)
- Storage bucket "operaciones" is private (use signed URLs)
- Stock validation in `registrar_movimiento()` prevents negative stock