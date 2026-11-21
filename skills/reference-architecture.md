# Reference Architecture

Architectural reference extracted from the PH Healthcare backend
(Express 5 + TypeScript + Prisma 7 + PostgreSQL + Redis). This document
describes the structure and flows to follow in the new project. It is a
pattern guide, not code to clone — adapt domain specifics to the new
project's requirements.

## 1. Runtime Stack

| Concern | Choice |
| --- | --- |
| Runtime | Node.js 20+, ESM (`"type": "module"`) |
| Framework | Express 5 |
| Language | TypeScript (strict), run with `tsx` in dev |
| ORM | Prisma 7 (driver adapter `@prisma/adapter-pg`), multi-file schema |
| Database | PostgreSQL 14+ |
| Cache/State | Redis (OTP, pending payloads, gateway tokens) |
| Auth | JWT access + refresh tokens, bcrypt hashing |
| Validation | zod |
| Uploads | multer (memory) → Cloudinary |
| Email | nodemailer + ejs templates (+ pdfkit attachments) |
| Scheduling | node-cron |
| Lint/Format | Biome (tabs, double quotes, recommended rules) |

## 2. Directory Map

```
src/
├── server.ts                  Boot sequence: DB → Redis → seeds → mailer → cron → listen
├── app.ts                     Express app assembly + route mounts + error middleware
├── generated/prisma/          Prisma client output (git-ignored)
└── app/
    ├── config/index.ts        All env vars exposed as one flat object
    ├── interfaces/            Cross-cutting shared types (IQuery)
    ├── lib/                   External system singletons (one file per integration)
    ├── middleware/            Cross-cutting request middleware
    ├── templates/             ejs email templates
    ├── utils/                 Framework helpers (error, async wrapper, response, jwt)
    └── module/<feature>/      Vertical feature slices
prisma/
├── schema/                    Multi-file schema: schema.prisma + per-model files + enums
└── migrations/                Committed SQL migrations
```

### Directory responsibilities

- **`config/`** — the ONLY place `process.env` is read. Flat export, snake_case
  keys. Feature code imports `config`, never touches `process.env`.
- **`lib/`** — every external dependency wrapped behind a singleton module:
  `prisma`, `redis`, `multer`, `cloudinary`, `nodemailer`, `bkash`,
  `googleAuth`, `cron`. Feature code imports the client; it never constructs
  clients inline.
- **`middleware/`** — concerns that apply across modules: authentication
  (`checkAuth`), body validation (`validateRequest`), error conversion
  (`globalErrorHandler`), unmatched routes (`notFound`).
- **`utils/`** — pure helpers with no external state: `AppError`, `catchAsync`,
  `sendResponse`, `jwt`, seeds.
- **`module/<feature>/`** — self-contained feature slice owning its routes,
  controllers, services, interfaces, and zod schemas. Mounts itself into
  `app.ts` as `app.use("/api/v1/<feature>", <Feature>Routes)`.

## 3. Request Lifecycle

```
HTTP request
  → app-level middleware (cors, urlencoded, json, cookieParser)
  → module router
      → auth(...roles)            JWT verify + role check + DB user check → req.user
      → validateRequest(schema)   zod safeParse(req.body) → 400 on first issue
      → multer (if multipart)     memory storage, buffers on req.file(s)
  → controller (catchAsync)       extracts inputs, calls ONE service function
  → service                       guards (exists → status → rules) → prisma ops
      → throw AppError(status, message) on any violation
  → sendResponse(res, { statusCode, success, message, data, meta? })
  → res.redirect(url) for gateway callbacks

Failure at ANY point:
  → catchAsync catches → next(error)
  → globalErrorHandler maps Prisma/AppError/generic → JSON error envelope
  → notFound handles unmatched routes (registered last)
```

## 4. Module Layer Contract

Every feature module follows the same four-file pattern:

| File | Contains | Never contains |
| --- | --- | --- |
| `<m>.route.ts` | `Router()`, `auth()` guards, `validateRequest`, multer wiring | business logic |
| `<m>.controller.ts` | `catchAsync` handlers: extract inputs → call service → `sendResponse` | Prisma calls, business rules |
| `<m>.service.ts` | All business logic and every Prisma call; throws `AppError` | `req`/`res`, HTTP concepts |
| `<m>.interface.ts` | Payload/request types for the module | runtime code |
| `<m>.validation.ts` | zod schemas exported as a `<Name>Validation` namespace | Prisma, services |

Identity crosses the layer boundary as the small `RequestUser` shape
(`{ userId, name, email, role }`), never as the full request object.

## 5. Data Model Conventions

- One `.prisma` file per model plus a shared `enums.prisma`; `schema.prisma`
  holds only the generator + datasource.
- Generated client output → `src/generated/prisma` (git-ignored); imports come
  from `generated/prisma/enums`, `generated/prisma/models`, `generated/prisma/client`.
- Every model: `@@map("<plural-table-name>")`, `createdAt/updatedAt`, indexes
  on filtered columns, `isDeleted` + `deletedAt` for soft-deletable entities.
- Relation style: child holds the FK (`userId @unique` on profile tables,
  `doctorId`/`patientId`/`scheduleId` on Appointment) with
  `onDelete: Cascade, onUpdate: Cascade`.
- Unique business constraints enforced at schema level with named composite
  uniques (e.g. one booking per patient/doctor/schedule, one schedule per
  doctor-day).

### Reference entity graph

```
User 1─1 Patient 1─N Appointment
User 1─1 Doctor  1─N Schedule 1─N Appointment
                     Doctor 1─N Appointment
Appointment 1─1 Payment
```

## 6. Transaction Rule

Any operation performing two or more dependent writes runs inside
`prisma.$transaction(async (tx) => {...})`, and ALL reads/writes inside the
block use `tx`, not `prisma`. Slot arithmetic (decrement on booking, increment
on cancel) happens in the same transaction as the status change. Long
transactions containing unavoidable external calls pass explicit
`{ maxWait, timeout }` options. External HTTP should be kept out of DB
transactions when the flow allows.

## 7. Authentication Architecture

- Two-token design: short-lived access token, long-lived refresh token,
  separate secrets, both returned in the response body AND set as httpOnly
  cookies (access 1d, refresh 7d).
- Token payload: `{ userId, name, email, role }` — role frozen at issuance.
- `auth(...roles)` pipeline order: token from cookie → Bearer header fallback
  → signature verify → role allowlist → DB identity match
  (`findUnique({ id, email, name, role })`) → BLOCKED/DELETED/isDeleted checks
  → attach `req.user`.
- Two authorization tiers:
  1. **Role-level** at the route: `auth(Role.ADMIN, Role.SUPER_ADMIN)`.
  2. **Row-level** in the service: fetch the record with its related
     `patient.userId` / `doctor.userId` and compare with `req.user` for
     PATIENT/DOCTOR roles; admins bypass.
- Patient/doctor-scoped list endpoints resolve the caller's profile row by
  `userId` first and filter by the profile's own `id`.
- OTP flows: `crypto.randomInt` 6-digit code → Redis with `EX` TTL under a
  namespaced key → verify → `del`. Verified at boot by seeds for
  SUPER_ADMIN/ADMIN/test roles.

## 8. Error Handling Architecture

```
service throws AppError(status, message)
   → catchAsync forwards to next()
   → globalErrorHandler:
       AppError                         → its own status/message
       PrismaClientKnownRequestError    → P2002/P2003/P2025 → 400 friendly message
       PrismaClientValidationError      → 400
       PrismaClientInitializationError  → P1000 → 401, P1001 → 400
       other Error                      → 500
   → JSON: { success: false, statusCode, name, message, error?, stack? }
     (name/message/error/stack stripped in production)
```

`notFound` is registered after `globalErrorHandler`. Cron jobs and other
out-of-request work catch their own errors.

## 9. API Response Architecture

- Success: `sendResponse` envelope `{ success, statusCode, message, data, meta? }`.
  Status codes via `http-status` (200 reads, 201 writes, 409 conflicts,
  400/401/403/404 as appropriate). `data` may be `null` for side-effect-only
  actions (OTP sent).
- Lists always include `meta: { page, limit, total, totalPages }`.
- Payment-gateway callbacks return redirects (`res.redirect(redirectUrl)`)
  instead of the JSON envelope.

## 9.1 API Consumption Contract

Condensed client-facing contract. Full endpoint catalog and end-to-end
example live in `SKILL.md` §8.1.

- **Base URL:** `http://localhost:<PORT>` locally, env-driven in production;
  every module mounts under `/api/v1/<module>`, actions in kebab-case,
  path params camelCase.
- **Auth transport:** primary `Authorization: Bearer <accessToken>`; the
  `accessToken` httpOnly cookie is the browser fallback. Tokens are returned
  in `data.accessToken` / `data.refreshToken` from login, verification, and
  Google login; `POST /api/v1/auth/refresh-token` exchanges the
  `refreshToken` cookie for a fresh pair. `401` = not authenticated,
  `403` = wrong role/owner/blocked.
- **Request formats:** JSON bodies for normal endpoints; multipart for
  uploads (named file fields + a `data` field containing a JSON string);
  list endpoints take `page`, `limit`, `sortBy`, `sortOrder`, `searchTerm`
  plus module filters (defaults: page 1, limit 10, createdAt desc).
- **Response shapes to consume:** single item (`data` object), paginated
  list (`data` array + `meta`), side-effect action (`data: null`), error
  (`success: false` + `statusCode` + `message`; internals stripped in
  production). Branch on `success`/`statusCode`, read `message` for humans,
  use `data`/`meta` for logic.
- **Status codes:** 200 reads/updates, 201 created, 400 validation/business
  rule, 401 unauthenticated, 403 forbidden, 404 not found, 409
  duplicate/conflict.
- **Callback exception:** payment-gateway callbacks respond with a redirect
  (3xx) to the frontend, not JSON.

## 10. Integration Architecture (lib/ singletons)

- **Cloudinary**: promise-wrapped `upload_stream`; store `secure_url` +
  `public_id`; destroy the old `public_id` after a successful replacement.
- **Email**: render `templates/<name>.ejs` → `Transporter.sendMail`;
  attachments built in-memory with pdfkit when needed.
- **Redis**: TTL-scoped state (OTPs, pending registration payloads, gateway
  token cache). Keys are namespaced (`Verify-Registration-OTP:<email>`).
- **Gateway tokens**: cache token + refresh token in Redis with TTLs; refresh
  near expiry, grant anew otherwise; app key via custom header.
- **Google**: verify ID token with audience check; `sub` is the `googleId`;
  link existing verified accounts or create new ones.
- **Cron**: scheduled maintenance (e.g. purging stale unverified accounts);
  callback catches its own errors.

## 11. Boot Sequence (server.ts)

1. `prisma.$connect()` → log.
2. `redisClient.connect()` → log.
3. Seeds: super admin, tester admin, tester doctor (idempotent).
4. `Transporter.verify()` → log.
5. Start cron jobs.
6. `app.listen(port)`.
7. On any failure: log, `prisma.$disconnect()`, `process.exit(1)`.

## 12. Deliberate Deviations for the New Project

The following reference weaknesses are documented so the new project fixes
them while keeping the architecture:

1. Add fail-fast env validation at boot (reference boots with `undefined`
   secrets).
2. Cookies: `secure: true, sameSite: "none"` outside development.
3. `checkAuth` must check `isDeleted` and `DELETED` status, not only `BLOCKED`.
4. Extract shared pagination (limit/page/skip/count/meta) into a reusable
   helper instead of duplicating per service.
5. Extract the Cloudinary `upload_stream` promise wrapper into one helper.
6. Always send the computed `statusCode` in error responses (reference bug
   sent 500 regardless).
7. Route paths always start with `/`; a single `auth(...)` call with all
   allowed roles (never stacked `auth()` calls).
8. No debug `console.log` in committed code; correct cron usage.
9. Consistent spellings and export names (`AuthController`, `*.interface.ts`).
