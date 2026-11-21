---
name: backend-development
description: >-
  Guide for building Express + TypeScript + Prisma backends following the
  conventions of the PH Healthcare reference backend (modular architecture,
  layered routes/controllers/services, JWT auth, zod validation, unified error
  handling and response envelope). Use when implementing any feature, module,
  middleware, or schema change in the new project.
---

# Backend Development Skill

This skill encodes the architecture and engineering conventions of the
reference backend so new features are built consistently without needing to
re-read the reference codebase. Treat it as the project rulebook.

## 0. Golden Rules (read first)

1. **Modular architecture, strict layering.** Every feature lives in
   `src/app/module/<name>/` with route → controller → service files. Business
   logic never lives in controllers; Prisma calls never live outside services;
   services never touch `req`/`res`.
2. **One shared Prisma client.** Always `import { prisma } from "../lib/prisma"`.
   Never instantiate `new PrismaClient()` elsewhere.
3. **Config is the only place `process.env` is read.** Import values from
   `src/app/config`. Never read env vars ad hoc in feature code.
4. **Never spread `req.body` into Prisma calls.** Destructure or validate the
   exact fields you expect. This is the mass-assignment defense.
5. **Throw `AppError`, never res.json errors.** Services throw; the global
   error handler formats. Every async route/middleware is wrapped by
   `catchAsync` — never write manual try/catch in controllers.
6. **One response envelope.** All success responses go through `sendResponse`.
   Errors come from `globalErrorHandler`. Never hand-roll response shapes.
7. **Validate with zod before a controller runs** via the `validateRequest`
   middleware and per-module `<module>.validation.ts` schemas.
8. **Ask before deviating.** Architectural changes, new dependencies, and
   schema changes are proposed first, implemented after approval.
9. **Human-controlled workflow.** Implement only the explicitly requested
   task, incrementally, with exact file paths, then stop and wait for review.
   Never implement multiple features unprompted.

## 1. Project Setup & Stack

- **Stack:** Node 20+, Express 5, TypeScript (strict), Prisma 7 + PostgreSQL,
  Redis, JWT auth, zod validation, Biome for lint/format.
- **ESM:** `"type": "module"`. Run dev with `tsx watch src/server.ts`.
  Use extensionless relative imports (`from "./app"`) like the reference.
- **Scripts:** `dev`, `build` (tsc typecheck), `start`, plus
  `lint:check` / `lint:fix` / `format:check` / `format:fix` (Biome).
  There are no unit tests in the reference; verify with `npm run build`
  (typecheck) and manual API testing.
- **Biome config:** tabs, double quotes, recommended rules. Keep it.
- **Prisma multi-file schema:** `prisma/schema/` contains `schema.prisma`
  (generator + datasource only), one file per model (`user.prisma`,
  `enums.prisma`, ...), and committed SQL in `prisma/migrations/`.
  `prisma.config.ts` at the root wires schema path + `DATABASE_URL`.
- **Generated client:** output goes to `src/generated/prisma` (git-ignored).
  Run `npx prisma generate` after any schema change; imports come from
  `../../generated/prisma/enums` and `../../generated/prisma/models`.
- **Soft deletes:** mutable entities carry `isDeleted Boolean @default(false)`
  and `deletedAt DateTime?`. Queries must filter `isDeleted: false`;
  "delete" endpoints set the flags. Some models (e.g. User) also have a
  `status` enum containing `DELETED` — check both when gating access.
- **Table mapping:** every model uses `@@map("<plural>")` (users, patients...)
  and indexes on frequently-filtered columns (`@@index`).

### Folder structure

```
src/
├── server.ts                  # connect DB/Redis, seeds, cron, listen
├── app.ts                     # express app: cors, parsers, routes, error handler
├── generated/prisma/          # git-ignored prisma client output
└── app/
    ├── config/index.ts        # ALL env vars, one object export
    ├── interfaces/            # cross-cutting interfaces (IQuery)
    ├── lib/                   # external clients & integrations (one file each)
    │   ├── prisma.ts  redis.ts  multer.ts  cloudinary.ts
    │   ├── nodemailer.ts  bkash.ts  googleAuth.ts  cron.ts
    ├── middleware/
    │   ├── checkAuth.ts       # auth(...roles) JWT + role guard
    │   ├── validateRequest.ts # zod body validation
    │   ├── globalErrorHandler.ts
    │   └── notFound.ts
    ├── templates/             # ejs email templates
    ├── utils/
    │   ├── AppError.ts  catchAsync.ts  sendResponse.ts  jwt.ts  seed.ts
    └── module/<name>/
        ├── <name>.route.ts        # Router + auth() + validateRequest wiring
        ├── <name>.controller.ts   # reads req, calls service, sends response
        ├── <name>.service.ts      # business logic + all Prisma calls
        ├── <name>.interface.ts    # module payload types
        └── <name>.validation.ts   # zod schemas
```

Naming conventions (follow exactly):
- Files: `<module>.route.ts`, `<module>.service.ts`, etc.
- Exports: `const <Name>Routes = router`, `export const <Name>Services = { ... }`
  (controller export name is inconsistent in the reference — prefer
  `<Name>Controller` and be consistent), `export const auth`,
  `export const sendResponse`.
- Types: `I`-prefixed interfaces (`IQuery`, `IRegisterPatientPayload`).
- Route names: kebab-case verbs (`/book-appointment`, `/my-payments`,
  `/update-schedule/:scheduleId`). Mount modules under `/api/v1/<module>`.
- File `*.interface.ts` vs `*.intrface.ts`: the reference has a typo
  (`appointment.intrface.ts`, `interfaces/intex.ts`). Use the correct
  `interface` spelling in the new project.

## 2. Module Skeleton (copy this pattern)

```ts
// <name>.route.ts
import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { <Name>Controller } from "./<name>.controller";
import { CreateXValidationZodSchema } from "./<name>.validation";

const router = Router();

router.post(
  "/create-thing",
  auth(Role.DOCTOR),
  validateRequest(CreateXValidationZodSchema),
  <Name>Controller.createThing,
);
export const <Name>Routes = router;
```

```ts
// <name>.controller.ts
import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { <Name>Services } from "./<name>.service";

const createThing = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;
  const result = await <Name>Services.createThing(req.body, user);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Thing created successfully",
    data: result,
  });
});

export const <Name>Controller = { createThing };
```

```ts
// <name>.service.ts
const createThing = async (payload: ICreateThingPayload, user: RequestUser) => {
  // 1. look up related entities, 2. guard with AppError,
  // 3. prisma writes (transaction if multi-write), 4. return result
};
export const <Name>Services = { createThing };
```

Controller rules:
- Controllers only: extract `req.body` / `req.params` / `req.query` /
  `req.user`, call one service function, call `sendResponse` (or `res.redirect`
  for gateway callbacks). No business logic, no Prisma.
- Services needing identity receive the small `RequestUser`
  `{ userId, name, email, role }` shape (defined in `checkAuth.ts`), never the
  full `req`.
- List endpoints: controllers destructure `{ data, meta }` from the service and
  pass both to `sendResponse`.

Route rules:
- Guard order: `auth(...roles)` first, then `validateRequest(schema)`, then
  multer middleware if applicable, then controller.
- Mount in `app.ts`: `app.use("/api/v1/<name>", <Name>Routes);`
- ⚠️ Reference bugs to NOT repeat: a route path missing its leading `/`
  (`"create-schedule"` in schedule.route.ts), and stacking two `auth()` calls
  (`auth(Role.PATIENT), auth(Role.DOCTOR)`) which narrows access to the last
  role only — pass all allowed roles to one `auth(...)` call.

## 3. Core Utilities (existing — reuse, never re-invent)

| Utility | File | Usage |
| --- | --- | --- |
| `AppError` | `utils/AppError.ts` | `throw new AppError(statusCode, message)` — the only error type services throw |
| `catchAsync` | `utils/catchAsync.ts` | wraps every async route handler/middleware; forwards errors to `next()` |
| `sendResponse` | `utils/sendResponse.ts` | success envelope `{ success, statusCode, message, data, meta? }` |
| `jwtUtils` | `utils/jwt.ts` | `createToken(payload, secret, expiresIn)` / `verifyToken(token, secret)` returning `{ success, data, error }` |
| `auth(...roles)` | `middleware/checkAuth.ts` | JWT verify → role check → DB user lookup → sets `req.user`; adds `RequestUser` to `Express.Request` via global declaration |
| `validateRequest(schema)` | `middleware/validateRequest.ts` | `safeParse(req.body)`, throws 400 with first issue message, replaces `req.body` with parsed data |
| `prisma` | `lib/prisma.ts` | shared PrismaClient with pg adapter |
| `redisClient` | `lib/redis.ts` | OTP storage, gateway token caching |
| `Transporter` | `lib/nodemailer.ts` | email sending; verify at startup |
| `cloudinary` | `lib/cloudinary.ts` | file uploads via `upload_stream` promise wrapper |
| `upload` | `lib/multer.ts` | memory storage; `upload.single()` / `upload.fields([...])` |
| `googleClient` | `lib/googleAuth.ts` | Google ID token verification |
| `IQuery` | `interfaces/` | shared query params type (`searchTerm`, `page`, `limit`, `sortOrder`, `sortBy`, index signature for filters) |
| `RequestUser` | `middleware/checkAuth.ts` | identity shape attached to `req.user` |

## 4. Authentication Flow

- **Two tokens:** access (short) + refresh (long), both signed with separate
  secrets from config. Payload: `{ userId, name, email, role }` — role is baked
  in at token-creation time.
- **Login/refresh:** set tokens BOTH as httpOnly cookies (access 1d,
  refresh 7d) and return them in the response body `data`.
- **`auth(...roles)` pipeline** (in order): token from `accessToken` cookie →
  fallback `Authorization: Bearer` header → verify signature → role check
  against allowed roles → DB lookup `findUnique({ where: { id, email, name,
  role } })` (rejects if any identity field changed since issuance) → reject
  BLOCKED accounts → attach `req.user`.
- **Authorization patterns:**
  - Role-level: `auth(Role.ADMIN, Role.SUPER_ADMIN)` on the route.
  - Row-level (in service): fetch record with the related `patient.userId` /
    `doctor.userId` and compare to `user.userId` for PATIENT/DOCTOR roles;
    admins pass. (See `getSingleAppointment`, `getSinglePayment`.)
  - Ownership scoping: patient/doctor list endpoints resolve their profile
    first (`prisma.patient.findUnique({ where: { userId } })`) and filter by
    that `id`.
- **Password rules:** bcrypt hash with `Number(config.bcrypt_salt_rounds)`;
  zod enforces 8–32 chars with upper/lower/number/special regexes. Users with
  `googleId` may have `password: null` — branch on `authProvider`/`googleId`
  before comparing.
- **Email verification / OTP:** random 6-digit code via
  `crypto.randomInt(100000, 1000000)` stored in Redis with 5-min TTL under a
  namespaced key (`Verify-Registration-OTP:<email>`), verified then deleted.
  Pending registration payloads can be stashed in Redis instead of creating
  the DB row until verification.
- **Unverified user cleanup:** cron job deletes stale unverified accounts
  (`lib/cron.ts`, node-cron). Cron callbacks must catch their own errors —
  they run outside the request pipeline.
- ⚠️ Do NOT repeat: `secure: false, sameSite: "none"` cookies (invalid combo —
  browsers drop them). Use `secure: true, sameSite: "none"` in production.
- ⚠️ Do NOT repeat: `checkAuth` only blocks `status === BLOCKED`; also check
  `isDeleted` and `status === DELETED`.

## 5. Validation Conventions

- One zod schema object per module in `<name>.validation.ts`, exported as a
  namespace: `export const <Name>Validation = { CreateXSchema, UpdateXSchema }`
  (the reference mixes namespace styles: `UserValidation`, bare named exports —
  pick `<Name>Validation` and stay consistent).
- Register/login schemas enforce password complexity with `.regex()` chains.
- Optional fields use `.optional()`; normalization (e.g. lowercasing emails)
  happens in the service (`payload.email.trim().toLowerCase()`), while zod
  `.transform()` is acceptable too.
- For multipart requests, validate a JSON string field: client sends
  `data: JSON.stringify(payload)`, controller does
  `Schema.safeParse(JSON.parse(req.body.data))` and throws `AppError(400,
  issues[0].message)` (see `doctor.controller.ts applyAsDoctor`).
- The generic `validateRequest` middleware only validates `req.body`; use the
  controller-side pattern above for multipart payloads.
- ⚠️ Do NOT repeat: `console.log(result)` inside the validation middleware —
  remove debug logs from committed code.

## 6. Error Handling Flow

1. Service throws `AppError(status, message)` (or a Prisma error bubbles up).
2. `catchAsync` wrapper catches and calls `next(error)`.
3. `globalErrorHandler` maps errors:
   - `AppError` → its own status/message.
   - `PrismaClientKnownRequestError` P2002 (unique) / P2003 (FK) / P2025
     (record not found) → 400 with friendly message.
   - `PrismaClientValidationError` → 400.
   - Prisma init errors P1000/P1001 → 401/400.
   - Otherwise → 500.
4. Response: `{ success: false, statusCode, name, message, error?, stack? }` —
   internals (name/message/error/stack) only in development, generic
   "Internal Server Error" in production.
5. `notFound` handles unmatched routes (registered LAST in `app.ts`, after
   `globalErrorHandler`).

Rules: never try/catch in controllers (wrap with `catchAsync` instead); never
send error JSON manually; log the error only in development mode inside the
handler.

⚠️ Do NOT repeat: reference bug where error responses were sent with a
hardcoded 500 regardless of computed status — always send the computed
`statusCode`.

## 7. Database Access Patterns

- **Reads:**
  - Single: `findUnique` with `where: { id }` (or email); check `isDeleted`
    in code or include it in `where`.
  - Lists: paginated with `findMany` + `count` pair:

    ```ts
    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.limit ? Number(query.limit) : 1;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const andConditions: XWhereInput[] = [ /* required filters */ ];
    if (query.status) andConditions.push({ status: query.status });
    if (query.searchTerm) andConditions.push({
      OR: [{ name: { contains: q, mode: "insensitive" } }, /* ... */],
    });
    andConditions.push({ isDeleted: false });

    const data = await prisma.x.findMany({
      where: { AND: andConditions },
      take: limit, skip,
      orderBy: { [sortBy]: sortOrder },
      include: { related: { select: { ... } } },
    });
    const total = await prisma.x.count({ where: { AND: andConditions } });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    ```

    Extract this into a reusable pagination helper in the new project instead
    of copy-pasting the limit/page/skip block into every service (the
    reference duplicates it ~8 times — do not repeat).
- **Select/omit:** always `omit: { password: true }` for user payloads; use
  `select` to trim related entities in lists.
- **Writes:** guard order in services = existence check → status/deleted
  check → business rule check → write. All checks throw `AppError`.
- **Transactions:** `prisma.$transaction(async (tx) => { ... })` whenever two
  or more writes must be atomic (booking appointment + payment row + schedule
  slot decrement; cancellation + refund + slot increment). Pass options
  `{ maxWait, timeout }` for long transactions containing external HTTP calls.
- **External calls inside transactions:** the reference calls the payment
  gateway inside `$transaction`. Prefer keeping external HTTP out of DB
  transactions when possible; if unavoidable, set an explicit timeout.
- **State-machine transitions** (e.g. appointment status): validate the
  current status before allowing a transition, one `AppError` per illegal
  transition, never skip states.
- **Slot arithmetic:** keep counters (`totalSlots`/`availableSlots`) consistent
  inside the same transaction; use `increment`/`decrement` where possible.
- ⚠️ Do NOT repeat: the reference sometimes writes `patientId: user.userId`
  where the patient's own `id` was required (IDs of `User` vs `Patient` differ)
  and queries doctor by `where: { id: user.userId }` (works only because of a
  data coincidence). Always join through the relation: get the
  `patient`/`doctor` row by `userId` first, then use **its** `id`.

## 8. API Response Conventions

- Success: `sendResponse(res, { statusCode, success: true, message, data, meta? })`
  → HTTP status matches `statusCode`; `data` may be `null` for fire-and-forget
  actions (e.g. OTP sent).
- Status codes via `http-status`: 200 OK reads, 201 CREATED writes, 400 bad
  request, 401 unauthenticated, 403 forbidden/role, 404 not found, 409
  conflict (duplicate email, already-verified, already-exists).
- Message strings: human-readable sentences ("Appointment booked
  successfully", "Doctors Retrieved Successfully"). Consistent casing per
  module; keep verbs ("Retrieved", "Created", "Updated").
- List responses always include `meta: { page, limit, total, totalPages }`.
- Payment gateway callbacks redirect instead of JSON: controller gets
  `{ redirectUrl }` from the service and `res.redirect(redirectUrl)`.
- Errors: see section 6; never invent a different error shape.

## 8.1 API Consumption & Endpoint Contract

How clients call this API and how to consume what it returns. The endpoint
examples below come from the reference backend — treat them as a **pattern
reference and adapt paths/roles to the new domain**.

### Base URL & routing

- Local base: `http://localhost:<PORT>` (PORT comes from config/env).
- Every module mounts under a versioned prefix:
  `app.use("/api/v1/<module>", <Module>Routes)`.
- Endpoint shape: `/api/v1/<module>/<kebab-case-action>`.
  Path params are camelCase: `:appointmentId`, `:scheduleId`, `:paymentId`.
- Health check: `GET /` (outside `/api/v1`).

### Auth transport

- **Primary:** send the access token in the header:
  `Authorization: Bearer <accessToken>`.
- **Fallback:** the `accessToken` httpOnly cookie (browser clients).
- Tokens are returned in the response body of register-verification,
  login, and Google login: `data.accessToken` and `data.refreshToken`
  (they are also set as cookies).
- Refresh: `POST /api/v1/auth/refresh-token` — reads the `refreshToken`
  cookie and returns a fresh token pair.
- Meaning of failures: `401` = missing/invalid token (not logged in);
  `403` = logged in but wrong role / not the owner / blocked account.

### Request conventions

- Normal endpoints: `Content-Type: application/json` with a JSON body.
- Upload endpoints: `multipart/form-data` — files in named fields, and the
  structured payload as a `data` field containing a JSON string
  (e.g. apply-as-doctor: `resume` + `additionalFiles` + `data`).
- List endpoints accept query params: `page`, `limit`, `sortBy`,
  `sortOrder`, `searchTerm`, plus module-specific filters (`status`,
  `email`, `doctorId`, `verificationStatus`, ...).
  Defaults: page 1, limit 10, sorted by `createdAt` descending.
- Path params: camelCase (`:appointmentId`), never snake_case.

### Response consumption (what clients read)

Success — single item:

```json
{ "success": true, "statusCode": 200, "message": "Appointment Retrieved Successfully", "data": { "id": "..." } }
```

Success — paginated list (note the `meta` block):

```json
{
  "success": true, "statusCode": 200, "message": "Payments Retrieved Successfully",
  "data": [ { "id": "..." } ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Success — side-effect only action (no payload):

```json
{ "success": true, "statusCode": 201, "message": "Verification OTP sent to your email", "data": null }
```

Error (internals like `error`/`stack` appear only in development):

```json
{ "success": false, "statusCode": 400, "name": "AppError", "message": "Otp doesn't match" }
```

Consumers branch on `success`/`statusCode`, show `message` to humans, use
`data` for logic, and use `meta` for pagination controls.

### Endpoint catalog (reference surface — pattern reference only)

| Method | Path | Roles | Input |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | public | body: name, email, password, patient? |
| POST | `/api/v1/auth/verify-email` | public | body: email, otp |
| POST | `/api/v1/auth/google` | public | body: idToken |
| POST | `/api/v1/auth/login` | public | body: email, password |
| GET | `/api/v1/auth/me` | any authenticated | – |
| POST | `/api/v1/auth/refresh-token` | public (uses cookie) | – |
| POST | `/api/v1/auth/forgot-password` | public | body: email |
| POST | `/api/v1/auth/reset-password` | public | body: email, newPassword, otp |
| PATCH | `/api/v1/user/profile-image` | any authenticated | multipart: `profileImage` |
| POST | `/api/v1/doctor/apply-as-doctor` | public | multipart: `resume`, `additionalFiles`, `data` (JSON string) |
| POST | `/api/v1/doctor/verify-doctor-email` | public | body: email, otp |
| POST | `/api/v1/doctor/approve-doctor` | ADMIN, SUPER_ADMIN | body: doctorId, verificationStatus, rejectionReason? |
| POST | `/api/v1/doctor/all-doctors` | ADMIN, SUPER_ADMIN | query: page, limit, sort*, searchTerm, specialization, email, licenseNumber, verificationStatus |
| POST | `/api/v1/schedule/create-schedule` | DOCTOR | body: startDateTime, endDateTime, meetingLink |
| GET | `/api/v1/schedule/my-schedules` | DOCTOR | query: page, limit, sort*, status |
| GET | `/api/v1/schedule/all-schedules` | ADMIN, SUPER_ADMIN | query: page, limit, sort*, status, doctorId, email, searchTerm |
| GET | `/api/v1/schedule/todays-schedule` | public | query: doctorId (required), page, limit |
| PATCH | `/api/v1/schedule/update-schedule/:scheduleId` | DOCTOR | body: startDateTime?, endDateTime?, meetingLink? |
| PATCH | `/api/v1/schedule/publish-schedule/:scheduleId` | DOCTOR | – |
| GET | `/api/v1/schedule/:scheduleId` | DOCTOR, ADMIN, SUPER_ADMIN | – |
| DELETE | `/api/v1/schedule/:scheduleId` | DOCTOR | – |
| POST | `/api/v1/appointment/book-appointment` | PATIENT | body: scheduleId |
| POST | `/api/v1/appointment/pay-appointment` | PATIENT, ADMIN, SUPER_ADMIN | body: appointmentId |
| POST | `/api/v1/appointment/cancel-appointment` | PATIENT, ADMIN, SUPER_ADMIN | body: appointmentId |
| PUT | `/api/v1/appointment/update-appointment-status` | DOCTOR | body: status |
| GET | `/api/v1/appointment/book-appointment/payment/callback` | PATIENT | query: paymentID, status → **redirects** to frontend |
| GET | `/api/v1/appointment/my-appointments` | PATIENT | query: page, limit, sort*, status |
| GET | `/api/v1/appointment/doctor-appointments` | DOCTOR | query: page, limit, sort*, status |
| GET | `/api/v1/appointment/all-appointments` | ADMIN, SUPER_ADMIN | query: page, limit, sort*, status, doctorId, patientId, doctorEmail, patientEmail |
| GET | `/api/v1/appointment/:appointmentId` | PATIENT, DOCTOR, ADMIN, SUPER_ADMIN | – |
| GET | `/api/v1/payment/my-payments` | PATIENT | query: page, limit, sort* |
| GET | `/api/v1/payment/all-payments` | ADMIN, SUPER_ADMIN | query: page, limit, sort*, patientEmail |
| GET | `/api/v1/payment/:paymentId` | PATIENT, ADMIN, SUPER_ADMIN | – |
| POST | `/api/v1/prescription/create-prescription` | DOCTOR | body: appointmentId, findings, medicines[] |
| GET | `/api/v1/prescription/:appointmentId` | PATIENT, DOCTOR, ADMIN, SUPER_ADMIN | – |
| GET | `/api/v1/analytics/patient-analytics` | PATIENT | – |
| GET | `/api/v1/analytics/doctor-analytics` | DOCTOR | – |
| GET | `/api/v1/analytics/admin-analytics` | ADMIN, SUPER_ADMIN | – |

Reference bugs visible in this catalog — do NOT copy them: the double
`auth()` stacking on `book-appointment`, `POST` used for read-only listings
(`all-doctors`), the unguarded `PATCH /update-status/:appointmentId`, and
`create-schedule` missing its leading `/`.

### End-to-end consumption example

```bash
# 1. Register (public) — response says OTP was emailed, data is null
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"t@example.com","password":"Passw0rd!"}'

# 2. Verify email (public) — returns the token pair in data
curl -X POST http://localhost:5000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"t@example.com","otp":"123456"}'

# 3. Login (public) — also returns data.accessToken / data.refreshToken
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"t@example.com","password":"Passw0rd!"}'

# 4. Protected call — send the access token as Bearer
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"

# 5. Paginated list with filters
curl "http://localhost:5000/api/v1/appointment/my-appointments?page=1&limit=10&status=CONFIRMED" \
  -H "Authorization: Bearer <accessToken>"
```

### Status codes & callbacks

- `200` OK — reads and successful updates.
- `201` CREATED — new records created.
- `400` — validation failure or a business-rule violation.
- `401` — missing/invalid token.
- `403` — wrong role, not the owner, or blocked account.
- `404` — record/route not found.
- `409` — duplicates and conflicts (email taken, already verified,
  already booked).
- **Gateway callbacks are the exception:** payment callbacks respond with a
  **redirect (3xx)** to the frontend, not a JSON envelope.

## 9. Configuration & Environment

- `src/app/config/index.ts` exports one flat object, snake_case keys
  (`jwt_access_secret`, `cloudinary_api_secret`, ...), built from
  `process.env` exactly once. Add new variables there; document them in
  `.env.example` (placeholders only, never real secrets; `.env` is
  git-ignored).
- Never log or commit secret values. Never return tokens/secrets in
  responses beyond the established token pattern.
- No startup validation exists in the reference — the new project SHOULD add
  a fail-fast check (throw at boot if a required var is missing). Propose
  this improvement during setup.
- Secrets needed per environment: DB URL, JWT access/refresh secrets +
  expiries, bcrypt rounds, Redis credentials, SMTP creds + sender, CORS
  frontend URL, and any third-party gateway creds.

## 10. External Integrations (`lib/`)

One file per integration, each exporting a singleton client:

- **Cloudinary upload promise wrapper** (used repeatedly — extract to
  `lib/uploadImage.ts` helper in the new project):

  ```ts
  const uploadToCloudinary = (buffer: Buffer, opts = { resource_type: "auto" }) =>
    new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload_stream(opts, (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new AppError(500, "No result returned from Cloudinary"));
        resolve(result);
      }).end(buffer);
    });
  ```

  Store `secure_url` + `public_id`; destroy the old `public_id` after a
  successful replace (profile image pattern in `user.service.ts`).
- **Nodemailer + EJS templates:** render `src/app/templates/<name>.ejs` with
  `ejs.renderFile(path.join(process.cwd(), "src/app/templates/...", ...))`,
  send via `Transporter.sendMail({ from: config.email_sender, ... })`.
  Emails are sent inline in services after the DB write; keep them
  non-blocking in failure-sensitive flows (invoices, prescriptions use
  PDF attachments built with `pdfkit`).
- **Redis:** OTPs (`EX` TTL), pending-registration payloads, gateway token
  cache. Always `del` keys after successful verification.
- **Gateway tokens (bkash pattern):** cache token + refresh token in Redis
  with TTLs; refresh when close to expiry, else grant anew. Pass token via
  `Authorization` header and app key via custom header.
- **Google login:** verify ID token with `googleClient.verifyIdToken({
  idToken, audience: config.google_client_id })`, use `payload.sub` as
  `googleId`, link to existing email-verified accounts or create new ones.

## 11. Security Checklist (apply to every feature)

- [ ] Route protected with `auth(...)` listing only legitimate roles.
- [ ] Row-level ownership check for patient/doctor-scoped resources.
- [ ] Body validated by zod; exact fields destructured (no spread into Prisma).
- [ ] `password` omitted from every user-bearing query.
- [ ] Status + `isDeleted`/`DELETED` checks on guarded operations.
- [ ] Emails lowercased/trimmed before lookup.
- [ ] OTPs random, time-limited, deleted after use.
- [ ] No secrets in logs; error internals hidden in production.
- [ ] Soft-delete respected in all list queries.
- [ ] New deps proposed with justification before install.

## 12. Development Workflow (per task)

1. **Inspect:** relevant module files, `app.ts` mounts, schema relations,
   existing utilities. Check whether the utility you need already exists
   (section 3) before writing anything.
2. **Plan:** list files to create/modify, the schema impact, and which roles
   can access the endpoint. State the plan briefly before coding.
3. **Implement incrementally:** schema → `prisma generate` + migration →
   validation schema → service → controller → route → mount in `app.ts`.
   Keep each file focused; no comments unless necessary.
4. **Verify:** `npm run build` (typecheck), `npx biome lint ./src`, then
   manual curl/Postman checks for each new route including unauthorized and
   forbidden cases.
5. **Report:** exact file paths, key decisions, and required manual tests.
   Then STOP. Do not start the next feature, do not refactor unrelated code,
   do not commit unless asked. Wait for developer feedback.

## 13. Known Reference Weaknesses (fix in new project, don't clone)

1. No startup env validation; add fail-fast config checks.
2. Cookie `secure:false` + `sameSite:"none"`; use `secure:true` outside dev.
3. `checkAuth` misses `isDeleted`/`DELETED` checks.
4. globalErrorHandler computed-but-sent-500 bug (now fixed in the pattern in
   section 6 — keep it correct).
5. Duplicate pagination boilerplate across services → extract helper.
6. Route path typo (`"create-schedule"`) and double-`auth()` stacking bugs.
7. `console.log` debug statements in committed code (validation middleware,
   controllers, services) — strip them.
8. `cron.ts` registers a throwaway every-5-seconds schedule and never
   schedules the actual cleanup; write cron correctly (schedule inside, work
   inside the callback).
9. Typos in names (`Paitent`, `vefiryDoctorEmail`, `reviewdAt`,
   `apppointment`, `intrface`) — use correct spellings; keep DB `@@map` names
   stable once migrated.
10. Analytics revenue/refund aggregates are identical queries; compute both
    sides properly. Import generated enums/models consistently from
    `generated/prisma/enums` (not `generated/prisma/browser`).
11. Seed functions delete users in their catch block (dangerous) — make
    seeds idempotent and non-destructive.
