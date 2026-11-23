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
    seeds idempotent and non-destructive.

---

# FSMS Domain Knowledge (Sections 14–21)

> These sections describe WHAT to build for the Field Service Management
> System assignment. Sections 1–13 describe HOW to build it. Both must be
> read together. The authoritative sources are:
> - `requirement-analysis.md` — full business rules & workflows
> - `database_model_relations.md` — Prisma schema + worked example
> - `api_endpoints.md` — role-scoped endpoint list

## 14. FSMS Roles & Authorization Matrix

The system has **four roles** (not three like Healthcare):

| Role | Enum | Key Capability |
| --- | --- | --- |
| Customer | `CUSTOMER` | Creates service requests, pays invoices, submits feedback, can apply to become a Technician |
| Technician | `TECHNICIAN` | Accepts/rejects assignments, sends estimates, submits service reports. **Also retains all Customer capabilities** (can create own requests, pay invoices, give feedback) |
| Manager | `MANAGER` | Approves/declines requests, assigns technicians, schedules appointments, cancels work orders. Cannot manage users or approve Technician applications |
| Admin | `ADMIN` | Superset of Manager + user management, Technician application approvals, service catalog management, full audit log access |

### Role Registration Rule
- Users register as `CUSTOMER` only. The only path to `TECHNICIAN` is the application workflow (Section 17).
- `MANAGER` and `ADMIN` accounts are seeded or promoted via Admin user-management endpoints; they cannot self-register.

### Auth Guards Summary

```
Public (no JWT)         : /auth/*, GET /services, GET /technicians/:id, POST /payments/bkash/callback
Any authenticated       : /users/me, /notifications, GET /health
CUSTOMER or TECHNICIAN  : service-request creation, estimate decisions, bKash checkout, feedback
TECHNICIAN only         : assignment accept/reject, mark arrival, submit estimate, submit report
MANAGER or ADMIN        : request approve/decline, assignment dispatch, scheduling, work-order cancel
ADMIN only              : user management, Technician application review, service catalog CRUD, audit logs
```

Row-level ownership is enforced **in the service layer** after the role check.
A customer can only read/modify their own service requests, invoices, and payments.
A technician can only act on their own assigned jobs.
Unauthorized access returns `403` or `404` per disclosure policy (never leak existence).

---

## 15. FSMS Status Machines

**Read these tables before writing any service that changes a status.
Every transition must be validated; throw `AppError(400, "Invalid status transition")` for illegal moves.**

### 15.1 ServiceRequest Status

```
PENDING_REVIEW  ->  APPROVED | DECLINED | CANCELLED
APPROVED        ->  COMPLETED | CLOSED_NO_WORK | CANCELLED
DECLINED        ->  (terminal)
COMPLETED       ->  (terminal)
CLOSED_NO_WORK  ->  (terminal)
CANCELLED       ->  (terminal)
```

**Rule:** ServiceRequest status is NEVER updated directly. It only changes inside
the same DB transaction as the WorkOrder terminal transition:
- WorkOrder `COMPLETED`       -> ServiceRequest `COMPLETED`
- WorkOrder `CLOSED_NO_WORK`  -> ServiceRequest `CLOSED_NO_WORK`
- WorkOrder `CANCELLED`       -> ServiceRequest `CANCELLED`

### 15.2 WorkOrder Status (11 states)

```
AWAITING_ASSIGNMENT        ->  ASSIGNED | CANCELLED
ASSIGNED                   ->  SCHEDULED | AWAITING_ASSIGNMENT (tech rejects) | CANCELLED
SCHEDULED                  ->  ARRIVED | AWAITING_ASSIGNMENT (tech replaced) | CANCELLED
ARRIVED                    ->  AWAITING_ESTIMATE_APPROVAL | CANCELLED
AWAITING_ESTIMATE_APPROVAL ->  ESTIMATE_APPROVED | CLOSED_NO_WORK | CANCELLED
ESTIMATE_APPROVED          ->  IN_PROGRESS | CLOSED_NO_WORK | CANCELLED
IN_PROGRESS                ->  AWAITING_ESTIMATE_APPROVAL (mid-job revision) | WORK_COMPLETED | CANCELLED
WORK_COMPLETED             ->  COMPLETED  (only via successful payment callback)
COMPLETED                  ->  (terminal)
CLOSED_NO_WORK             ->  (terminal)
CANCELLED                  ->  (terminal)
```

Key rules:
- `WORK_COMPLETED` -> `COMPLETED` happens ONLY inside the bKash success transaction.
- `CLOSED_NO_WORK` is only valid when no work has started (never after `IN_PROGRESS` was reached).

### 15.3 Assignment Status

```
PENDING   ->  ACCEPTED | REJECTED | CANCELLED
ACCEPTED  ->  CANCELLED
REJECTED  ->  (pending reassignment: Manager updates same row, resets to PENDING)
CANCELLED ->  (terminal)
```

One assignment row per WorkOrder (`UNIQUE(workOrderId)`). Reassignment = UPDATE same row (never INSERT a new one). When assignment is `REJECTED` or `CANCELLED`, its linked Appointment is also set to `CANCELLED`.

### 15.4 Estimate Status

```
SENT               ->  REVISION_REQUESTED | APPROVED | REJECTED | EXPIRED
REVISION_REQUESTED ->  SUPERSEDED  (when technician sends next version)
SUPERSEDED         ->  (terminal)
APPROVED           ->  SUPERSEDED  (when a newer version is approved)
REJECTED           ->  (terminal)
EXPIRED            ->  (technician can send new version; WO stays AWAITING_ESTIMATE_APPROVAL)
```

Rules:
- Exactly ONE `SENT` estimate per WorkOrder at a time.
- Each new version auto-increments `versionNumber` per WorkOrder.
- Approving a new version marks the previously `APPROVED` version as `SUPERSEDED`.
- Mid-job revision: technician can send a new estimate while WO is `IN_PROGRESS`; WO transitions back to `AWAITING_ESTIMATE_APPROVAL`.
- If the customer rejects a mid-job revision, the technician completes using the **last approved estimate** — the WO does NOT go to `CLOSED_NO_WORK`.

### 15.5 Invoice Status

```
UNPAID  ->  PAID  (only inside the bKash success transaction; immutable after PAID)
```

No void, no delete, no partial payment. One invoice per WorkOrder.

### 15.6 Payment Status

```
UNPAID    ->  PAID | FAILED | CANCELLED
PAID      ->  (terminal)
FAILED    ->  (customer retries by creating a new Payment row)
CANCELLED ->  (timeout: only after bKash Query API confirms no success)
```

### 15.7 Appointment Status

```
SCHEDULED  ->  CANCELLED
```

Rescheduling updates `startTime`/`endTime` on the same row (no new row). An audit log entry records the change.

### 15.8 TechnicianApplication Status

```
PENDING   ->  APPROVED | REJECTED
APPROVED  ->  (terminal: atomic User.role->TECHNICIAN + TechnicianProfile created)
REJECTED  ->  user may submit a new application (new row)
```

---

## 16. FSMS Database Model Overview

### Entity Groups & Prisma Files

| Prisma file | Models |
| --- | --- |
| `enums.prisma` | `Role`, `UserStatus`, `AuthProvider`, `ServiceRequestStatus`, `WorkOrderStatus`, `AssignmentStatus`, `AppointmentStatus`, `EstimateStatus`, `EstimateItemType`, `InvoiceStatus`, `PaymentStatus`, `TechnicianApplicationStatus`, `NotificationCategory` |
| `user.prisma` | `User` |
| `technician.prisma` | `TechnicianProfile`, `TechnicianApplication` |
| `service.prisma` | `Service` |
| `request.prisma` | `ServiceRequest` |
| `workorder.prisma` | `WorkOrder`, `Assignment`, `Appointment` |
| `estimate.prisma` | `Estimate`, `EstimateItem` |
| `report.prisma` | `ServiceReport`, `ServiceReportItem` |
| `invoice.prisma` | `Invoice`, `InvoiceItem`, `Payment` |
| `feedback.prisma` | `Feedback` |
| `notification.prisma` | `Notification` |
| `audit.prisma` | `AuditLog` |

### Key Relation Chain

```
User 1-1 TechnicianProfile 1-N Assignment
User 1-N ServiceRequest 1-1 WorkOrder 1-1 Assignment 1-1 Appointment
                                       WorkOrder 1-N Estimate 1-N EstimateItem
                                       WorkOrder 1-1 ServiceReport 1-N ServiceReportItem
                                       WorkOrder 1-1 Invoice 1-N InvoiceItem
                                       Invoice   1-N Payment
                                       WorkOrder 1-1 Feedback
```

### Critical Schema Notes

- **Address:** flat fields on `User` (`addressLine`, `city`, `district`, `postalCode`). No `Address` table.
- **Skills:** `Json?` on `TechnicianProfile` and `TechnicianApplication`. No `Skill` or join table.
- **Files:** stored as `Json?` arrays `[{ url, publicId }]` on the parent row (`attachments` on `ServiceRequest` and `ServiceReport`; `resume`/`resumePublicId`/`additionalFiles` on `TechnicianApplication`). No `Attachment` table.
- **ServiceRequest address snapshot:** when creating a request, copy the user's current address into `serviceAddressLine`, `serviceCity`, `serviceDistrict`, `servicePostalCode` on the request row. These never change after creation.
- **Service snapshot:** also copy `service.name` -> `serviceNameSnapshot` and `service.basePriceAmount` -> `basePriceSnapshot` at request creation time.
- **Soft delete scope:** `User`, `TechnicianProfile`, `TechnicianApplication`, `Service`, `ServiceRequest`, `WorkOrder`, `Assignment`, `Appointment`, `Estimate`, `EstimateItem`, `ServiceReport`, `ServiceReportItem`, `Feedback`, `Notification` have `isDeleted` + `deletedAt`.
- **No soft delete:** `Invoice`, `InvoiceItem`, `Payment`, `AuditLog` are immutable financial/audit records — never deleted.
- **Decimal money:** ALL monetary fields use `Decimal @db.Decimal(12,2)` in BDT. Never `Float`.

### Unique Constraints to Enforce in Service Layer (row locks)

1. One active (`PENDING`) TechnicianApplication per user -> `SELECT ... FOR UPDATE` on `User` row.
2. One `APPROVED` Estimate per WorkOrder -> `SELECT ... FOR UPDATE` on `WorkOrder` row; approving new version marks old `APPROVED` as `SUPERSEDED`.
3. One successful Payment per Invoice -> lock `Invoice` row in bKash callback; replay returns success (idempotent), no error.

---

## 17. FSMS Business Rules (read before coding each module)

### Registration & Auth

- Registration creates a `CUSTOMER`. Email verification via OTP (6-digit, Redis, 5-min TTL) before the account is active.
- Google OAuth: use `googleId` (`payload.sub`) to link or create accounts. `password` may be `null` for Google users — branch on `authProvider` before `bcrypt.compare`.
- `checkAuth` must reject: invalid/expired token, wrong role, `status === SUSPENDED`, `status === DELETED`, `isDeleted === true`.
- After Admin approves a Technician application, the user's existing JWT is stale (role is still `CUSTOMER`). They must re-login for the `TECHNICIAN` role in the token.

### Service Catalog

- `basePriceAmount` is display-only; actual cost comes from the technician's estimate.
- `estimatedDurationMinutes` is used by Manager/Admin to compute default appointment `endTime = startTime + estimatedDurationMinutes`. Manager can override.
- Skill matching: compare `Service.requiredSkill` against `TechnicianProfile.skills` (JSON array) using `trim().toLowerCase()` on both sides.

### Service Request Creation

1. Verify `serviceId` exists and `isActive && !isDeleted`.
2. Snapshot `serviceNameSnapshot`, `basePriceSnapshot`, and all four address fields from the user's current profile.
3. Upload any fault photos to Cloudinary, store `[{ url, publicId }]` in `attachments`.
4. Create the `ServiceRequest` row in `PENDING_REVIEW`.
5. Write `AuditLog` entry (`REQUEST_CREATED`).

### Request Approval (Manager/Admin)

- Approving creates a `WorkOrder` in `AWAITING_ASSIGNMENT` and updates `ServiceRequest` to `APPROVED` **in one transaction**.
- Notify the customer. Write `AuditLog` (`REQUEST_APPROVED`).
- Declining writes the reason to `AuditLog.metadata` (`{ "reason": "..." }`) — there is **no** `declineReason` column on `ServiceRequest`. Updates `ServiceRequest` to `DECLINED`.

### Assignment & Scheduling (Manager/Admin)

When assigning a technician:

1. Verify `WorkOrder` is `AWAITING_ASSIGNMENT`.
2. Guard: technician `status !== SUSPENDED`, `!isDeleted`.
3. **Self-assignment guard:** the technician's `userId` must NOT equal the `customerId` on the linked `ServiceRequest`.
4. Create (or UPDATE if reassigning) the `Assignment` row to `PENDING`.
5. Create the `Appointment` with `startTime`/`endTime`.
6. Run overlap check inside the transaction + advisory lock (see Section 18).
7. Update `WorkOrder` to `ASSIGNED`.
8. Write `AuditLog` (`TECHNICIAN_ASSIGNED`). Notify customer + technician.

Reassigning: UPDATE the **same** `Assignment` row (new `technicianId`, status reset to `PENDING`, new Appointment times). Write `AuditLog` (`ASSIGNMENT_REPLACED`, `metadata: { oldTechnicianId, newTechnicianId }`).

### Technician Accept / Reject

- **Accept:** `Assignment` -> `ACCEPTED`, `WorkOrder` -> `SCHEDULED`. Notify customer. Write `AuditLog` (`ASSIGNMENT_ACCEPTED`).
- **Reject:** `Assignment` -> `REJECTED`, linked `Appointment` -> `CANCELLED`, `WorkOrder` -> `AWAITING_ASSIGNMENT`. Body: `rejectionReason`. Notify customer + Manager/Admin. Write `AuditLog` (`ASSIGNMENT_REJECTED`, `metadata: { reason }`).

### Estimate Flow (Technician)

- Technician sends estimate after marking arrival (WorkOrder must be `ARRIVED` for first estimate, or `IN_PROGRESS` for mid-job revision).
- Each estimate is cumulative (restates entire scope, not just delta).
- Auto-increment `versionNumber` per WorkOrder: `MAX(versionNumber) + 1`.
- If a `SENT` estimate already exists, mark it `SUPERSEDED` before inserting the new one.
- `WorkOrder` -> `AWAITING_ESTIMATE_APPROVAL`. Notify customer. Write `AuditLog` (`ESTIMATE_SENT`).

### Estimate Decisions (Customer)

- **Approve:** Current estimate -> `APPROVED`. If a previous `APPROVED` exists, mark it `SUPERSEDED`. `WorkOrder` -> `ESTIMATE_APPROVED`. Notify technician. Write `AuditLog` (`ESTIMATE_APPROVED`).
- **Request Revision:** Current estimate -> `REVISION_REQUESTED`. WorkOrder stays `AWAITING_ESTIMATE_APPROVAL`. Notify technician. Write `AuditLog` (`ESTIMATE_REVISION_REQUESTED`).
- **Reject:** Current estimate -> `REJECTED`.
  - If work has NOT started (WO was not yet `IN_PROGRESS`): `WorkOrder` -> `CLOSED_NO_WORK`, `ServiceRequest` -> `CLOSED_NO_WORK`.
  - If mid-job revision rejected: WO stays `IN_PROGRESS`, technician completes original approved scope.
  - Notify technician. Write `AuditLog` (`ESTIMATE_REJECTED`).

### Service Report & Work Completion (Technician)

Technician submits report + marks `WORK_COMPLETED` in ONE transaction:

1. Create `ServiceReport` + `ServiceReportItem` rows.
2. Find the latest `APPROVED` Estimate for the WorkOrder.
3. Auto-generate `Invoice` from that estimate: `InvoiceItem` rows copied from `EstimateItem`. Items with `customerProvided = true` get `lineTotal = 0`. `Invoice.totalAmount = SUM(lineTotal WHERE !customerProvided)`.
4. Update `WorkOrder` -> `WORK_COMPLETED`.
5. Write `AuditLog` (`WORK_ORDER_COMPLETED`, `INVOICE_GENERATED`).
6. Notify customer (`COMPLETION` category).

### Feedback

- Guard: `Invoice.status === 'PAID'` AND no existing `Feedback` row for the `workOrderId`.
- Rating applies to the technician on the `ACCEPTED` assignment (resolve via `Assignment.technicianId`).
- One feedback per WorkOrder enforced by `UNIQUE(workOrderId)` schema constraint.
- Average rating computed dynamically from `Feedback` on read — no cached columns.

### Technician Application Workflow

1. Customer submits application (multer multipart: `resume` file + `additionalFiles` + `data` JSON string).
2. Guard: no active (`PENDING`) application for this user — `SELECT ... FOR UPDATE` on `User` row.
3. Upload files to Cloudinary, store URLs/publicIds.
4. Create `TechnicianApplication` row in `PENDING`. Write `AuditLog` (`TECHNICIAN_APPLICATION_SUBMITTED`).
5. Admin approves (atomic transaction):
   - `TechnicianApplication.status` -> `APPROVED`, set `reviewedBy`, `reviewedAt`, `reviewNote`.
   - `User.role` -> `TECHNICIAN`.
   - Create `TechnicianProfile` row (copy skills, serviceAreas, etc. from application).
   - Write `AuditLog` (`TECHNICIAN_APPROVED`).
6. Admin rejects: `reviewNote` is **required**. Write `AuditLog` (`TECHNICIAN_REJECTED`).

### Audit Log Action Constants

| Constant | Trigger |
| --- | --- |
| `REQUEST_CREATED` | Customer creates service request |
| `REQUEST_APPROVED` | Manager/Admin approves request |
| `REQUEST_DECLINED` | Manager/Admin declines request (reason in metadata) |
| `REQUEST_CANCELLED` | Customer or Manager/Admin cancels |
| `TECHNICIAN_ASSIGNED` | Manager/Admin assigns technician |
| `ASSIGNMENT_ACCEPTED` | Technician accepts |
| `ASSIGNMENT_REJECTED` | Technician rejects (reason in metadata) |
| `ASSIGNMENT_REPLACED` | Manager/Admin reassigns (old/new technicianId in metadata) |
| `ESTIMATE_SENT` | Technician sends estimate |
| `ESTIMATE_REVISION_REQUESTED` | Customer requests revision |
| `ESTIMATE_APPROVED` | Customer approves estimate |
| `ESTIMATE_REJECTED` | Customer rejects estimate |
| `WORK_ORDER_STARTED` | Technician starts work |
| `WORK_ORDER_COMPLETED` | Technician marks work done |
| `WORK_ORDER_CANCELLED` | Manager/Admin cancels (reason in metadata) |
| `APPOINTMENT_SCHEDULED` | Appointment created |
| `APPOINTMENT_RESCHEDULED` | Times updated (old times in metadata) |
| `APPOINTMENT_CANCELLED` | Appointment cancelled |
| `INVOICE_GENERATED` | System generates invoice |
| `PAYMENT_STARTED` | Customer initiates bKash checkout |
| `PAYMENT_PAID` | bKash callback confirms payment |
| `PAYMENT_FAILED` | bKash reports failure |
| `USER_SUSPENDED` | Admin suspends user |
| `USER_ACTIVATED` | Admin reactivates user |
| `USER_ROLE_UPDATED` | Admin changes user role |
| `RECORD_DELETED` | Admin soft-deletes a record |
| `TECHNICIAN_APPLICATION_SUBMITTED` | Customer submits application |
| `TECHNICIAN_APPROVED` | Admin approves application |
| `TECHNICIAN_REJECTED` | Admin rejects application |

Write audit entries inside the same transaction as the event. `userId` is the acting user's ID (`null` for system events like payment callbacks).

### Notification Events

| Trigger | Recipient(s) | Category |
| --- | --- | --- |
| Technician Assigned | Customer + Technician | `ASSIGNMENT` |
| Assignment Accepted | Customer | `ASSIGNMENT` |
| Assignment Rejected | Customer + Manager/Admin | `ASSIGNMENT` |
| Assignment Replaced | Old Technician | `ASSIGNMENT` |
| Estimate Sent | Customer | `ESTIMATE` |
| Estimate Revision Requested | Technician | `ESTIMATE` |
| Estimate Approved | Technician | `ESTIMATE` |
| Estimate Rejected | Technician | `ESTIMATE` |
| Payment Paid | Customer + Technician | `PAYMENT` |
| Payment Failed | Customer | `PAYMENT` |
| Work Completed (invoice issued) | Customer | `COMPLETION` |

Create `Notification` rows inside the same transaction as the event. No external push or email in MVP — in-app only.

---

## 18. Appointment Overlap Check & Advisory Lock

Every appointment create or reschedule must run inside `prisma.$transaction`:

```ts
// Step 1: acquire per-technician advisory lock FIRST
await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242, hashtext(${technicianId}::text))`;

// Step 2: overlap check
const conflict = await tx.appointment.findFirst({
  where: {
    assignment: { technicianId, isDeleted: false },
    status: { not: "CANCELLED" },
    isDeleted: false,
    startTime: { lt: newEndTime },
    endTime: { gt: newStartTime },
  },
});
if (conflict) throw new AppError(httpStatus.CONFLICT, "Technician has a conflicting appointment");

// Step 3: create/update appointment row
```

Pass `{ maxWait: 10000, timeout: 30000 }` on this transaction because the advisory lock may wait.

---

## 19. bKash Payment Flow

### Checkout Initiation (Customer)

1. Verify `Invoice.status === 'UNPAID'` and no active `UNPAID` payment for this invoice.
2. Generate a unique `idempotencyKey` (UUID) **before** calling bKash.
3. Create a `Payment` row: `status: 'UNPAID'`, `idempotencyKey`, `amount = invoice.totalAmount`.
4. Write `AuditLog` (`PAYMENT_STARTED`).
5. Call bKash Create Payment API -> get `bkashURL` and `paymentID`.
6. Store `bkashPaymentId` on the Payment row.
7. Return `{ bkashURL }` to client — the client redirects the user to bKash.

### Callback (bKash -> Backend — PUBLIC route, NO JWT)

Never trust the callback body for amount or status. Always call the bKash Execute/Query API to verify.

Idempotency logic:

1. Find `Payment` by `bkashPaymentId`. If already `PAID`, return success without writing (replayed callback).
2. Call bKash Execute/Query API to verify payment status.
3. If confirmed `PAID` (atomic transaction):
   - Lock `Invoice` row (`SELECT ... FOR UPDATE`). If `Invoice.status === 'PAID'` already, return success (concurrent replay).
   - `Payment.status` -> `PAID`, set `bkashTrxId`, `paidAt`, `gatewayResponse`.
   - `Invoice.status` -> `PAID`, set `paidAt`.
   - `WorkOrder.status` -> `COMPLETED`.
   - `ServiceRequest.status` -> `COMPLETED`.
   - Write `AuditLog` (`PAYMENT_PAID`).
   - Create `Notification` rows for customer + technician (`PAYMENT` category).
4. If `FAILED` or `CANCELLED` by user: `Payment.status` -> `FAILED` or `CANCELLED`. Write `AuditLog`.
5. Respond with `res.redirect(frontendCallbackUrl + "?status=success/failed")`.

### Timeout Safety (30-min bKash session)

Before cancelling a timed-out `UNPAID` payment: call bKash Query Payment API first. Only cancel if bKash returns no success. This prevents cancelling a payment that bKash confirmed but whose callback was delayed.

### Retry

Customer retries a failed/abandoned checkout by calling the checkout endpoint again on the same invoice. A new `Payment` row is created with a new `idempotencyKey`.

---

## 20. FSMS API Endpoint Catalog

Mount all modules under `/api/v1`. Every endpoint maps to a module in `src/app/module/`.

### Auth (`/api/v1/auth`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/register` | Public | Creates CUSTOMER; triggers email OTP |
| POST | `/verify-email` | Public | OTP verification; activates account |
| POST | `/login` | Public | Returns access + refresh tokens |
| POST | `/google` | Public | Google OAuth login/register |
| POST | `/refresh-token` | Public (cookie) | Rotates token pair |
| POST | `/forgot-password` | Public | Sends reset OTP |
| POST | `/reset-password` | Public | Resets password with OTP |

### Users (`/api/v1/users`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/me` | Any auth | Own profile |
| PATCH | `/me` | Any auth | Update name, phone |
| PATCH | `/me/address` | Any auth | Update single saved address |
| PATCH | `/me/password` | Any auth | Change password |
| POST | `/me/profile-image` | Any auth | Multer + Cloudinary upload |
| GET | `/` | ADMIN | All users, paginated + filterable |
| GET | `/:id` | ADMIN | Single user |
| PATCH | `/:id/suspend` | ADMIN | Suspend user (audit log) |
| PATCH | `/:id/activate` | ADMIN | Reactivate user |
| PATCH | `/:id/role` | ADMIN | Change user role (audit log) |
| DELETE | `/:id` | ADMIN | Soft delete user |

### Services (`/api/v1/services`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | Public | Active, non-deleted catalog |
| GET | `/:id` | Public | Single service detail |
| GET | `/all` | ADMIN | All including inactive/deleted |
| POST | `/` | ADMIN | Create service |
| PATCH | `/:id` | ADMIN | Update price/skill/duration |
| DELETE | `/:id` | ADMIN | Soft delete |

### Service Requests (`/api/v1/service-requests`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/` | CUSTOMER, TECHNICIAN | Create (snapshot address + service) |
| GET | `/` | CUSTOMER/TECH (own) or MANAGER/ADMIN (all) | Paginated + filterable |
| GET | `/:id` | Own or MANAGER/ADMIN | With WorkOrder/Assignment embedded |
| DELETE | `/:id` | Own or MANAGER/ADMIN | Cancel; restricted by status |
| GET | `/:id/appointment` | CUSTOMER/TECH (own) | Scheduled visit read-only |
| GET | `/:id/estimates` | CUSTOMER/TECH (own) | All estimate versions |
| POST | `/:id/approve` | MANAGER, ADMIN | Approve -> creates WorkOrder |
| POST | `/:id/decline` | MANAGER, ADMIN | Decline with reason (audit metadata) |

### Estimates (`/api/v1/estimates`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/:id/approve` | CUSTOMER, TECHNICIAN (own requests) | Approve estimate version |
| POST | `/:id/revision` | CUSTOMER, TECHNICIAN (own requests) | Request revision |
| POST | `/:id/reject` | CUSTOMER, TECHNICIAN (own requests) | Reject estimate |

### Work Orders (`/api/v1/work-orders`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | MANAGER, ADMIN | All work orders |
| GET | `/:id` | MANAGER/ADMIN, TECH (own), CUSTOMER (own) | Full detail |
| POST | `/:id/assignment` | MANAGER, ADMIN | Assign technician + schedule (advisory lock) |
| POST | `/:id/arrive` | TECHNICIAN | Mark arrival |
| POST | `/:id/estimates` | TECHNICIAN | Send estimate (new version) |
| GET | `/:id/estimates` | TECH (own), MANAGER/ADMIN | All estimate versions |
| POST | `/:id/start` | TECHNICIAN | Start work |
| POST | `/:id/report` | TECHNICIAN | Submit report + complete + invoice generated |
| GET | `/:id/invoice` | Own or MANAGER/ADMIN | Work order invoice |
| POST | `/:id/feedback` | CUSTOMER, TECH (own requests) | Submit feedback |
| POST | `/:id/cancel` | MANAGER, ADMIN | Cancel work order |

### Assignments (`/api/v1/assignments`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | TECH (own), MANAGER/ADMIN | Paginated |
| GET | `/:id` | TECH (own), MANAGER/ADMIN | Single |
| PATCH | `/:id` | MANAGER, ADMIN | Reassign (same row, overlap check) |
| POST | `/:id/accept` | TECHNICIAN | Accept |
| POST | `/:id/reject` | TECHNICIAN | Reject with reason |

### Appointments (`/api/v1/appointments`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| PATCH | `/:id` | MANAGER, ADMIN | Reschedule (overlap check) |
| DELETE | `/:id` | MANAGER, ADMIN | Cancel appointment |

### Invoices (`/api/v1/invoices`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | MANAGER, ADMIN | All invoices |
| GET | `/:workOrderId` | Own or MANAGER/ADMIN | Invoice + items |
| POST | `/:id/checkout` | CUSTOMER, TECH (own invoices) | Initiate bKash checkout |
| GET | `/:id/payments` | Own or MANAGER/ADMIN | Payment attempt history |

### Payments (`/api/v1/payments`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/bkash/callback` | Public (bKash) | Verify + mark PAID; redirect to frontend |

### Technician Applications (`/api/v1/technician-applications`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| POST | `/` | CUSTOMER | Submit (multipart) |
| GET | `/me` | CUSTOMER | Own application history |
| DELETE | `/:id` | CUSTOMER | Withdraw while PENDING |
| GET | `/` | ADMIN | All, filterable by status |
| POST | `/:id/approve` | ADMIN | Approve (atomic transaction) |
| POST | `/:id/reject` | ADMIN | Reject (reviewNote required) |

### Technicians (`/api/v1/technicians`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/available` | MANAGER, ADMIN | Match by skill/area; excludes SUSPENDED |
| GET | `/:id` | Public | Public profile + average rating |
| GET | `/:id/feedbacks` | Public | Public reviews |
| GET | `/me/profile` | TECHNICIAN | Own profile |
| PATCH | `/me/profile` | TECHNICIAN | Update skills, serviceAreas, etc. |
| GET | `/me/feedbacks` | TECHNICIAN | Own reviews |
| GET | `/me/stats` | TECHNICIAN | Own stats |
| GET | `/` | ADMIN | All technician profiles |
| PATCH | `/:id` | ADMIN | Edit/soft-delete profile |

### Notifications (`/api/v1/notifications`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | Any auth | Own notifications (paginated) |
| PATCH | `/:id/read` | Any auth | Mark one as read |
| PATCH | `/read-all` | Any auth | Mark all as read |

### Audit Logs (`/api/v1/audit-logs`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/` | ADMIN | Full log, filterable by entityType/action |

### Analytics (`/api/v1/analytics`)

| Method | Path | Roles | Notes |
| --- | --- | --- | --- |
| GET | `/revenue` | ADMIN | Total revenue, by month |
| GET | `/work-orders` | ADMIN, MANAGER | Work order counts by status |
| GET | `/technician-performance` | ADMIN | Per-technician stats + avg rating |
| GET | `/summary` | Any auth | Role-aware dashboard counts |

---

## 21. Assignment Requirements Checklist

Tick off each item before submitting the assignment.

### Security & Middleware

- [ ] **Rate limiting:** `express-rate-limit` globally (100 req/15 min). Stricter on auth endpoints (5 req/15 min on `/login`, `/forgot-password`).
- [ ] **Helmet:** `app.use(helmet())` in `app.ts` for security headers.
- [ ] **CORS:** configured with allowed frontend origin from config.
- [ ] **Password hashing:** bcrypt with `bcrypt_salt_rounds` from config. Never plaintext.
- [ ] **Secrets:** never logged, never returned in responses (tokens in body are the allowed exception).
- [ ] **Private routes:** every non-public endpoint protected with `auth(...)`.

### Data & Performance

- [ ] **API versioning:** all routes under `/api/v1/`.
- [ ] **Soft deletes:** `isDeleted` + `deletedAt`; every list query filters `isDeleted: false`.
- [ ] **Audit logs:** written for every critical action (see Section 17 table).
- [ ] **Pagination:** at least one list endpoint supports `?page=1&limit=10`.
- [ ] **Filtering/sorting:** at least one endpoint supports `?status=...&sortBy=createdAt`.
- [ ] **Search:** at least one endpoint supports `?searchTerm=...`.
- [ ] **DB indexing:** indexes on all frequently-filtered columns (already in schema).
- [ ] **Transactions:** all multi-write operations in `prisma.$transaction`.
- [ ] **Redis caching:** OTPs and bKash gateway tokens cached with TTL.

### Business Logic

- [ ] **4 roles** with strictly enforced RBAC (CUSTOMER, TECHNICIAN, MANAGER, ADMIN).
- [ ] **Payment integration:** bKash (real payment flow; no fake status updates).
- [ ] **Status state machines:** all transitions validated before writing.
- [ ] **Business operations beyond CRUD:** estimate approval workflow, mid-job revision, assignment accept/reject, invoice auto-generation, feedback guard.
- [ ] **At least 20 meaningful APIs** documented and connected to the actual DB (this project has 40+).
- [ ] **Consistent response format:** `{ success, message, data, meta? }` for success; `{ success: false, message, errors? }` for errors.

### Documentation & Deployment

- [ ] **Postman collection:** exported and submitted with all endpoints, example bodies, and auth setup.
- [ ] **Deployed:** Vercel (serverless) or Render with a live URL.
- [ ] **Environment variables:** `.env.example` documents all required vars with placeholders.
