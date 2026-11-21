# Coding Conventions

Rules for writing code in the new project, distilled from the reference
backend. Apply them to every file; when a rule conflicts with existing code
in the new project, follow what's already there and flag the inconsistency
instead of silently diverging.

## 1. Formatting & Tooling

- Biome with tabs for indentation, double quotes, recommended rule preset.
- Run before delivering work:
  - `npm run lint:check` / `npm run lint:fix`
  - `npm run format:check` / `npm run format:fix`
- `npm run build` is the typecheck gate — it must pass with zero errors.
- No debug `console.log` statements in committed code.

## 2. TypeScript

- `strict: true`; no `any` unless unavoidable (`noExplicitAny` is warn-level —
  justify or avoid).
- Import types with `import type { ... }` when only used as types.
- Module payload/request types use the `I` prefix:
  `IRegisterPatientPayload`, `ICancelAppointmentPayload`, `IQuery`.
- Shared query params type: `IQuery` with `searchTerm`, `page`, `limit`,
  `sortOrder`, `sortBy` (all optional strings) plus an index signature for
  module-specific filters.
- `req.user` is typed globally as `RequestUser` via module augmentation in
  `middleware/checkAuth.ts` — do not redeclare it per module.
- Non-null assertions (`req.user!`) are tolerated after a guard middleware;
  avoid them where a real check is possible.
- Status codes come from `http-status`, never raw numbers.

## 3. Naming

| Item | Convention | Example |
| --- | --- | --- |
| Module files | `<module>.<layer>.ts` | `appointment.service.ts` |
| Router export | PascalCase + `Routes`/`Route` | `AuthRoutes`, `AppointmentRoutes` |
| Service export | PascalCase + `Services`/`Service` | `AuthService`, `DoctorServices` |
| Controller export | PascalCase + `Controller` | `AuthController` |
| Zod schema export | PascalCase + `Validation` namespace | `export const UserValidation = {...}` |
| Interface types | `I`-prefixed | `IQuery`, `RequestUser` |
| Route paths | kebab-case verbs | `/book-appointment`, `/my-payments` |
| Route params | camelCase | `:appointmentId`, `:scheduleId` |
| Config keys | snake_case | `jwt_access_secret` |
| Service functions | camelCase verbs | `bookAppointment`, `getAllPayments` |
| Route path prefix | versioned mount | `app.use("/api/v1/user", UserRoutes)` |

Spelling discipline: use correct spellings (`patient`, `verify`, `reviewed`,
`appointment`, `interface`) — the reference contains typos that must not be
inherited. DB `@@map` names are excluded: once a migration exists, table names
are frozen.

## 4. File Layout (module skeleton)

New feature = new folder `src/app/module/<name>/` with:

```
<name>.route.ts
<name>.controller.ts
<name>.service.ts
<name>.interface.ts
<name>.validation.ts   (when the module accepts request bodies)
```

Then mount in `src/app.ts`. Route declaration order: `auth(...)` →
`validateRequest(...)` → multer → controller. Route paths always begin with
`/`. Exactly one `auth(...)` call per route listing every allowed role.

## 5. Controllers

- Every handler wrapped in `catchAsync`.
- Only three jobs: extract inputs, call one service function, respond.
- Inputs: `req.body`, `req.params`, `req.query`, `req.user`, `req.file(s)`.
- Success responses only via `sendResponse(res, { statusCode, success: true,
  message, data, meta? })`.
- List handlers destructure `{ data, meta }` from the service and pass both.
- Callback handlers (payment gateways) call the service and `res.redirect(url)`.
- Never call Prisma, never throw business errors beyond re-throwing,
  never build JSON by hand.

```ts
const createThing = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await ThingServices.createThing(req.body, user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Thing created successfully",
    data: result,
  });
});
```

## 6. Services

- Plain async functions; no Express types imported.
- Guard order before any write:
  1. Existence of referenced entities → `AppError(404/409)`.
  2. Caller status/ownership (`isDeleted`, `DELETED`, `BLOCKED`, row ownership)
     → `AppError(403)`.
  3. Business rules (state machine, thresholds, duplicates) → `AppError(400)`.
- Throw `AppError(statusCode, message)` — never plain `Error`, never `res.json`.
- Normalize emails before lookup: `payload.email.trim().toLowerCase()`.
- Never spread `req.body` (or a validated payload) into Prisma `create`/`update`
  — destructure the exact fields expected.
- Two or more dependent writes → `prisma.$transaction(async (tx) => {...})`;
  everything inside uses `tx`.
- Keep counters consistent transactionally; prefer `increment`/`decrement`.
- User-bearing reads use `omit: { password: true }`; lists use `select` to trim
  relations.
- Soft-deleted rows filtered with `isDeleted: false` in every list/guard query.
- Return plain data; list endpoints return `{ data, meta }`.
- Validate state transitions explicitly (one `AppError` per illegal
  transition); never skip states.

## 7. Validation (zod)

- Schemas live in `<module>.validation.ts`, grouped in one exported namespace:
  `export const ThingValidation = { CreateThingSchema, UpdateThingSchema }`.
- Passwords: min 8 / max 32 with regexes for upper, lower, number, special.
- OTPs: `z.string().length(6)`.
- Email normalization: `.transform()` in zod or explicit lowercase/trim in the
  service (pick one approach and stay consistent per module).
- Optional nested objects use `.optional()`.
- Multipart payloads: client sends a `data` field containing JSON; the
  controller runs `Schema.safeParse(JSON.parse(req.body.data))` and throws
  `AppError(httpStatus.BAD_REQUEST, result.error.issues[0].message)`.
- The generic `validateRequest(schema)` middleware validates `req.body` only.

## 8. Routes

- One `Router()` per module; kebab-case path names; explicit verbs
  (`/create-...`, `/update-.../ :id`, `/my-...`, `/all-...`).
- Role guard on every non-public route; public routes (register, login,
  refresh, callbacks) are the exception, not the default.
- Ownership-flavored endpoints get `auth()` with the exact role set, and the
  service enforces row-level ownership.
- Dynamic `:id` routes are declared AFTER static paths in the same router.

## 8.1 Consuming the API

Client-facing rules when exposing or calling endpoints (full contract and
endpoint catalog: `SKILL.md` §8.1):

- Endpoints live under the versioned mount `/api/v1/<module>` with
  kebab-case action paths and camelCase path params.
- Clients authenticate with `Authorization: Bearer <accessToken>`;
  the httpOnly cookie is the browser fallback. Refresh via
  `POST /api/v1/auth/refresh-token` (cookie).
- Normal requests send JSON bodies; upload requests send
  `multipart/form-data` with named file fields plus a `data` field
  containing a JSON string payload.
- List endpoints consume `page`, `limit`, `sortBy`, `sortOrder`,
  `searchTerm`, and module filters (defaults: page 1, limit 10,
  createdAt desc).
- Consume responses by branching on `success`/`statusCode`; `message` is
  for humans, `data`/`meta` carry the logic (single item vs list + `meta`).
- Remember the exception: payment-gateway callbacks redirect (3xx) to the
  frontend instead of returning JSON.

## 9. Errors

- Never write try/catch in controllers; `catchAsync` handles forwarding.
- Never send error JSON manually — only `globalErrorHandler` does.
- Prisma-specific handling stays centralized in `globalErrorHandler`
  (P2002, P2003, P2025, validation errors, init errors).
- Dev vs prod: internals (name, message detail, stack) only in development.
- Out-of-request async work (cron) catches and logs its own errors.

## 10. Config & Environment

- New env var → add to `src/app/config/index.ts` and document it in
  `.env.example` with a placeholder. `.env` is never committed.
- Never log or hardcode secret values; never return secrets in API responses
  (tokens in the body are the established exception).
- No other file may read `process.env` directly.

## 11. External Integrations

- One singleton per integration under `src/app/lib/`; feature code imports it.
- Cloudinary uploads go through the shared promise wrapper; persist
  `secure_url` + `public_id`; destroy replaced assets after success.
- Email flows render an ejs template from `src/app/templates/` and send via
  the shared `Transporter`; PDF attachments are generated in-memory.
- Redis state is TTL-scoped and deleted after successful verification.
- Gateway callbacks resolve to `{ redirectUrl }` and redirect.

## 12. Schema & Migrations

- New model → new file in `prisma/schema/`; enums → `enums.prisma`;
  `schema.prisma` untouched except generator/datasource.
- After schema edits: `npx prisma generate`, then `npx prisma migrate dev`
  (migration SQL is committed).
- Add indexes for any column used in filters or lookups; name them
  (`idx_<table>_<column>`).
- Soft-deletable entities get `isDeleted` + `deletedAt`; hard deletes are
  reserved for cleanup jobs.

## 13. Dependencies

- No new package without explaining its purpose and getting approval.
- Prefer existing utilities (`catchAsync`, `sendResponse`, `AppError`,
  `jwtUtils`, lib singletons) over adding libraries that duplicate them.

## 14. Workflow Discipline

- Implement only the explicitly requested task; one feature at a time.
- Before coding: inspect related files, schema relations, and existing
  utilities — never invent a helper that may already exist.
- Announce the plan (files to create/modify) before writing code.
- After coding: verify imports, run `npm run build` + lint, list the manual
  test cases, then stop and wait for review.
- Never commit, refactor unrelated modules, or start the next feature unless
  asked.
