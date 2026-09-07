# Cobranza Venezuela

Aplicación móvil web para gestionar ventas a crédito, cuotas y cobranza en Venezuela con montos base en USD y conversión a BsS.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cobranza-venezuela` — aplicación React/Vite responsive y sus rutas de dashboard, clientes, créditos, reportes, ajustes y contrato.
- `artifacts/api-server/src/routes/collections.ts` — API de clientes, créditos, pagos, actividad, tasa y contratos.
- `lib/api-spec/openapi.yaml` — contrato único de la API; ejecutar codegen después de editarlo.
- `lib/db/src/schema/` — tablas de clientes, créditos, cuotas, pagos, actividad y tasa de cambio.

## Architecture decisions

- Los montos de negocio se calculan en USD; los pagos Pago Móvil guardan también BsS y la tasa aplicada.
- PostgreSQL administrado por el workspace es la fuente persistente para el primer lanzamiento, evitando depender de credenciales externas.
- La interfaz consume hooks generados desde OpenAPI y no mantiene fixtures locales como fuente de verdad.
- La navegación prioriza uso móvil con acceso rápido a clientes, nuevo crédito, reportes y ajustes.

## Product

El producto permite revisar el total por cobrar, buscar clientes, consultar expedientes y cronogramas, crear créditos, registrar pagos directos o en BsS, compartir estados de cuenta y ajustar la tasa BCV.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Después de modificar `lib/api-spec/openapi.yaml`, ejecutar `pnpm --filter @workspace/api-spec run codegen`.
- La API usa `/api`; la aplicación web se sirve en `/`.
- Los valores `numeric` de PostgreSQL se convierten a número antes de validar respuestas con los esquemas generados.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
