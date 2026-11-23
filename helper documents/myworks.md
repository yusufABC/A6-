# FSMS Feature Roadmap: What to Build After What

Use this file as your checklist. Feature numbers match FSMS_BUILD_GUIDE.md.

**How to read each feature:**
- **Needs first:** features that must be working before you start this one (it uses their data or code)
- **Watch for:** the rules AI most often forgets. Check these in the plan
- **Test:** the quick checks before you move on
- **Prompt:** copy, paste, send

Standard prompt shape (every feature uses it):

```
Build feature N: <name> (<endpoints>).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Only this feature. Plan first, then stop.
```

---

## Dependency Map (the big picture)

```
STEP 0: Schema + Seed + Helpers
   |
AUTH (done) --> PROFILE (4) --> SERVICES (5) --> ADMIN USERS (6)
                                   |
                           CREATE REQUEST (7) --> LIST/CANCEL (8)
                                   |
                       APPROVE (9) --> DECLINE (10)
                                   |
        TECH APPLICATION (11) --> ADMIN REVIEW (12) --> TECH PROFILE (13)
                                   |
   AVAILABLE TECHS (14) --> ASSIGN+SCHEDULE (15) --> ACCEPT/REJECT (16)
                                   |           --> REASSIGN/RESCHEDULE (17)
                                   |           --> CANCEL WORK ORDER (18)
                                   |
   ARRIVE (19) --> SEND ESTIMATE (20) --> CUSTOMER DECISION (21)
                                   |
        START WORK (22) --> REPORT + INVOICE (23)
                                   |
   CHECKOUT (24) --> BKASH CALLBACK (25) --> TIMEOUT (26)
                                   |
   FEEDBACK (27), NOTIFICATIONS (28), AUDIT LOGS (29), ANALYTICS (30), FINISHING (31)
```

Rule of thumb: **never start a feature if the one before it in its chain is not tested.**

---

## STEP 0: Before Feature 4 (do these first)

### 0A. Full schema + migration + seed data
**Needs first:** nothing.
**Why:** every later feature reads/writes these tables. Doing it once avoids schema fights later.

Do:
- All Prisma files from `database_model_relations.md` in `prisma/schema/`
- Run `npx prisma migrate dev` and `npx prisma generate`
- Seed script (safe to run twice) that creates:
  - 1 ADMIN, 1 MANAGER
  - 1 CUSTOMER
  - 1 TECHNICIAN (+ TechnicianProfile with skill `AC Repair`)
  - 1 Service: "Split AC Servicing", skill `AC Repair`, 1500, 90 min

**Prompt:**
```
Set up the full Prisma schema from database_model_relations.md as multi-file schema,
create the migration, and write an idempotent seed script with: 1 ADMIN, 1 MANAGER,
1 CUSTOMER, 1 TECHNICIAN with TechnicianProfile (skill "AC Repair"), and 1 Service
("Split AC Servicing", AC Repair, 1500, 90 min). Only this. Plan first, then stop.
```
**Test:** `npx prisma studio` shows all tables and seeded rows; login works for the seeded users.

### 0B. Shared helpers
**Needs first:** 0A.
Files: `createAuditLog(tx, {...})`, `createNotification(tx, {...})`, `assertTransition(machine, from, to)`, plus status-machine tables from SKILL.md section 15.

**Prompt:**
```
Create three shared helpers: createAuditLog(tx, ...), createNotification(tx, ...), and
assertTransition(machine, from, to) with the status machines from SKILL.md section 15
(ServiceRequest, WorkOrder, Assignment, Estimate, Payment, Appointment).
Illegal moves throw AppError(400, "Invalid status transition").
Only this. Plan first, then stop.
```
**Test:** `npm run build` passes (no endpoint yet, so nothing to curl).

---

## PHASE 2: Users and Catalog

### Feature 4: Profile
**Needs first:** Auth, 0A.
**Endpoints:** `GET /users/me`, `PATCH /users/me` (name, phone), `PATCH /users/me/address`, `PATCH /users/me/password`, `POST /users/me/profile-image`
**Watch for:** `password` never returned (`omit`); upload goes through multer + Cloudinary; old image deleted on replace; Google users have `password: null`, so branch on `authProvider` for change-password.
**Test:** update name; update address; upload image; wrong old password gives 400.

### Feature 5: Services (catalog)
**Needs first:** 4 (any auth feature works; Admin role from seed).
**Endpoints:** `GET /services` (public), `GET /services/:id` (public), `GET /services/all` (ADMIN), `POST`, `PATCH /:id`, `DELETE /:id` (ADMIN)
**Watch for:** public list shows only `isActive && !isDeleted`; delete is soft; route order so `/all` is not caught by `/:id`; `requiredSkill` stored as given.
**Test:** public sees active only; customer creating a service gets 403; soft-deleted service disappears.

### Feature 6: Admin user management
**Needs first:** 0B (audit helper).
**Endpoints:** `GET /users`, `GET /users/:id`, `PATCH /users/:id/suspend`, `/activate`, `/role`, `DELETE /users/:id` (all ADMIN)
**Watch for:** audit log on suspend/activate/role/delete (`USER_SUSPENDED`, `USER_ACTIVATED`, `USER_ROLE_UPDATED`, `RECORD_DELETED`); list has pagination + filter + `searchTerm`; admin cannot suspend themselves.
**Test:** suspended user cannot log in or use an old token; audit rows appear.

---

## PHASE 3: Service Requests

### Feature 7: Create service request
**Needs first:** 5 (services exist), 4 (user has an address), 0B.
**Endpoint:** `POST /service-requests` (CUSTOMER, TECHNICIAN), multipart with fault photos
**Watch for:** service must be `isActive && !isDeleted`; snapshot `serviceNameSnapshot`, `basePriceSnapshot` and all four address fields; user without an address should get a clear 400; photos saved as `[{url, publicId}]`; audit `REQUEST_CREATED`; status `PENDING_REVIEW`.
**Test:** change the user address afterwards and confirm the old request kept its snapshot.

### Feature 8: List, get, cancel requests
**Needs first:** 7.
**Endpoints:** `GET /service-requests`, `GET /service-requests/:id`, `DELETE /service-requests/:id`
**Watch for:** customer sees own only; MANAGER/ADMIN see all; other customer's ID returns 403/404; cancel allowed only in `PENDING_REVIEW` or WO `AWAITING_ASSIGNMENT`; cancel of a request with a WO also cancels the WO in one transaction; audit `REQUEST_CANCELLED`.
**Test:** customer A cannot read customer B's request.

### Feature 9: Approve request
**Needs first:** 7, 8.
**Endpoint:** `POST /service-requests/:id/approve` (MANAGER, ADMIN)
**Watch for:** ONE transaction: create WorkOrder `AWAITING_ASSIGNMENT` + request `APPROVED` + audit `REQUEST_APPROVED` + customer notification. Only from `PENDING_REVIEW`. The AI should ask you about the notification category (see build guide Part 7).
**Test:** approving twice gives 400; customer calling it gives 403; check a WorkOrder row exists.

### Feature 10: Decline request
**Needs first:** 9.
**Endpoint:** `POST /service-requests/:id/decline` (MANAGER, ADMIN), body `reason`
**Watch for:** reason required; stored in `AuditLog.metadata` as `{ reason }` (no column exists); no WorkOrder created.
**Test:** decline without reason gives 400.

---

## PHASE 4: Technician Onboarding

### Feature 11: Submit technician application
**Needs first:** 4 (Cloudinary/multer upload pattern already working).
**Endpoints:** `POST /technician-applications` (CUSTOMER, multipart: `resume`, `additionalFiles`, `data` JSON string), `GET /technician-applications/me`, `DELETE /technician-applications/:id` (withdraw while PENDING)
**Watch for:** one `PENDING` per user using `SELECT ... FOR UPDATE` on the User row; file types JPEG/PNG/PDF and 5 MB max; audit `TECHNICIAN_APPLICATION_SUBMITTED`; rejected users may apply again (new row).
**Test:** second application while PENDING gives 409/400.

### Feature 12: Admin approve / reject application
**Needs first:** 11.
**Endpoints:** `GET /technician-applications`, `POST /:id/approve`, `POST /:id/reject` (ADMIN)
**Watch for:** approve is ONE transaction: application `APPROVED`, user role becomes `TECHNICIAN`, TechnicianProfile created from application, audit `TECHNICIAN_APPROVED` + `USER_ROLE_UPDATED`; must be still `PENDING` (lock); reject requires `reviewNote`; the user needs to log in again to get the new role.
**Test:** approve twice gives 400 and only ONE profile row exists.

### Feature 13: Technician profile + public profile
**Needs first:** 12 (or use the seeded technician).
**Endpoints:** `GET /technicians/:id` (public), `GET /technicians/:id/feedbacks` (public), `GET/PATCH /technicians/me/profile`, `GET /technicians/me/feedbacks`, `GET /technicians/me/stats`, `GET /technicians` + `PATCH /technicians/:id` (ADMIN)
**Watch for:** average rating computed live from Feedback; public profile must not leak email; route order (`/me/...` before `/:id`).
**Test:** public profile works without a token.

---

## PHASE 5: Dispatch

### Feature 14: Available technicians
**Needs first:** 9 (a WorkOrder exists), 13.
**Endpoint:** `GET /technicians/available` (MANAGER, ADMIN), query: `workOrderId` or skill
**Watch for:** skill match compares `trim().toLowerCase()` on both sides; exclude SUSPENDED and deleted.
**Test:** a technician without the skill is not listed.

### Feature 15: Assign technician + schedule appointment
**Needs first:** 14.
**Endpoint:** `POST /work-orders/:id/assignment` (MANAGER, ADMIN)
**Watch for:** WO must be `AWAITING_ASSIGNMENT`; technician not suspended; **self-assignment guard** (technician's `userId` must not equal the request's `customerId`); advisory lock + overlap check (409); `endTime` defaults to `startTime + estimatedDurationMinutes`; transaction options `{ maxWait: 10000, timeout: 30000 }`; WO becomes `ASSIGNED`; audit `TECHNICIAN_ASSIGNED` + `APPOINTMENT_SCHEDULED`; notify customer + technician.
**Test:** overlapping time for the same technician gives 409; assigning a technician to their own request gives 400.

### Feature 16: Technician accept / reject
**Needs first:** 15.
**Endpoints:** `GET /assignments`, `GET /assignments/:id`, `POST /assignments/:id/accept`, `POST /assignments/:id/reject` (TECHNICIAN)
**Watch for:** only own assignments; accept makes Assignment `ACCEPTED` and WO `SCHEDULED`; reject needs `rejectionReason`, sets Assignment `REJECTED`, Appointment `CANCELLED`, WO back to `AWAITING_ASSIGNMENT`; audit + notifications per the matrix.
**Test:** another technician cannot accept your assignment.

### Feature 17: Reassign, reschedule, cancel appointment
**Needs first:** 16.
**Endpoints:** `PATCH /assignments/:id` (reassign), `PATCH /appointments/:id` (reschedule), `DELETE /appointments/:id` (MANAGER, ADMIN)
**Watch for:** reassign UPDATES the same Assignment row (never insert a second); status resets to `PENDING`; overlap check runs again; audit `ASSIGNMENT_REPLACED` with old/new technician in metadata; notify old technician.
**Test:** the Assignment table still has one row per work order.

### Feature 18: Cancel work order
**Needs first:** 15.
**Endpoint:** `POST /work-orders/:id/cancel` (MANAGER, ADMIN), body `reason`
**Watch for:** ONE transaction cancels Assignment, Appointment, WorkOrder and ServiceRequest; not allowed from `WORK_COMPLETED` or terminal states; reason in audit metadata.
**Test:** after cancel, all four rows show CANCELLED.

---

## PHASE 6: Field Work

### Feature 19: Mark arrival
**Needs first:** 16.
**Endpoint:** `POST /work-orders/:id/arrive` (TECHNICIAN)
**Watch for:** only the assigned technician; WO must be `SCHEDULED`.
**Test:** other technician gets 403.

### Feature 20: Send estimate
**Needs first:** 19.
**Endpoints:** `POST /work-orders/:id/estimates` (TECHNICIAN), `GET /work-orders/:id/estimates`
**Watch for:** allowed from `ARRIVED` (first) or `IN_PROGRESS` (mid-job revision); `versionNumber = MAX + 1`; existing `SENT` becomes `SUPERSEDED`; each version restates the **whole** scope; `totalAmount = SUM(qty * unitPrice)` excluding customer-provided items; money uses Decimal, never float; WO becomes `AWAITING_ESTIMATE_APPROVAL`; audit `ESTIMATE_SENT`; notify customer.
**Test:** send v1, then v2, and confirm v1 is `SUPERSEDED`.

### Feature 21: Customer estimate decision
**Needs first:** 20.
**Endpoints:** `POST /estimates/:id/approve`, `/revision`, `/reject` (CUSTOMER, TECHNICIAN on own requests)
**Watch for:** lock the WorkOrder row; approve marks the previous `APPROVED` as `SUPERSEDED`; approve moves WO to `ESTIMATE_APPROVED` (or back to `IN_PROGRESS` for a mid-job revision); revision keeps WO in `AWAITING_ESTIMATE_APPROVAL`; **reject before work = WO and request `CLOSED_NO_WORK`; reject during work = WO stays `IN_PROGRESS`** (technician finishes the last approved scope); notify technician.
**Test:** try both reject cases, and they must behave differently.

### Feature 22: Start work
**Needs first:** 21.
**Endpoint:** `POST /work-orders/:id/start` (TECHNICIAN)
**Watch for:** WO must be `ESTIMATE_APPROVED`; audit `WORK_ORDER_STARTED`.
**Test:** starting before approval gives 400.

### Feature 23: Submit report + complete + auto invoice
**Needs first:** 22.
**Endpoints:** `POST /work-orders/:id/report` (TECHNICIAN, multipart photos), `GET /work-orders/:id/invoice`
**Watch for:** ONE transaction: report + items, invoice from the **latest APPROVED** estimate, WO `WORK_COMPLETED`, audit `WORK_ORDER_COMPLETED` + `INVOICE_GENERATED`, notify customer (`COMPLETION`); customer-provided items get `lineTotal = 0`; the report never changes the amount.
**Test:** the invoice total matches the approved estimate, not the report.

---

## PHASE 7: Payment (slow and careful)

### Feature 24: bKash checkout
**Needs first:** 23. Also have bKash sandbox credentials in `.env`.
**Endpoints:** `POST /invoices/:id/checkout` (CUSTOMER, TECHNICIAN, own invoices), `GET /invoices/:id/payments`, `GET /invoices`, `GET /invoices/:workOrderId`
**Watch for:** invoice must be `UNPAID` with no active `UNPAID` payment; generate `idempotencyKey` BEFORE calling bKash; bKash token cached in Redis; audit `PAYMENT_STARTED`; return `{ bkashURL }`.
**Test:** a second checkout while one is active gives 409; a paid invoice gives 400.

### Feature 25: bKash callback
**Needs first:** 24.
**Endpoint:** `POST /payments/bkash/callback` (PUBLIC, no JWT)
**Watch for:** never trust the callback body, always verify with bKash; if already `PAID` return success without writing; lock the Invoice row; ONE transaction: Payment `PAID`, Invoice `PAID`, WO `COMPLETED`, Request `COMPLETED`, audit `PAYMENT_PAID`, notifications; failed/cancelled sets Payment `FAILED`/`CANCELLED`; finish with `res.redirect(...)`.
**Test:** call the callback twice, and the second must not change anything or error. Force an error mid-transaction and confirm everything rolls back.

### Feature 26: Timeout safety
**Needs first:** 25.
Before cancelling an `UNPAID` payment older than 30 minutes, query bKash first. Cancel only if bKash shows no success.

---

## PHASE 8: Finishing

| # | Feature | Needs first | Key rule |
|---|---|---|---|
| 27 | Feedback `POST /work-orders/:id/feedback` | 25 | Invoice must be `PAID`; one per WO; rating 1 to 5; applies to the technician on the ACCEPTED assignment |
| 28 | Notifications `GET /notifications`, `PATCH /:id/read`, `PATCH /read-all` | any | Own only; `read-all` route placed before `/:id` |
| 29 | Audit logs `GET /audit-logs` (ADMIN) | 0B | Filter by `entityType` and `action`; paginated |
| 30 | Analytics (revenue, work-orders, technician-performance, summary) | 25 | Revenue and counts computed correctly; summary is role-aware |
| 31 | Helmet, rate limit (stricter on login/forgot-password), CORS, Postman collection, deploy, `.env.example` | all | Final check against SKILL.md section 21 |

---

## Quick Reference: Test Accounts to Keep Handy

| Account | Use for |
|---|---|
| ADMIN | services, users, applications, audit logs |
| MANAGER | approve, assign, schedule, cancel |
| CUSTOMER A | create request, approve estimates, pay |
| CUSTOMER B | prove you cannot see customer A's data |
| TECHNICIAN | accept, arrive, estimate, report |
| TECHNICIAN 2 | prove you cannot touch someone else's assignment |

---

## Progress Tracker

- [ ] 0A Schema + seed
- [ ] 0B Helpers
- [x] 1-3 Auth
- [ ] 4 Profile
- [ ] 5 Services
- [ ] 6 Admin users
- [ ] 7 Create request
- [ ] 8 List / cancel request
- [ ] 9 Approve
- [ ] 10 Decline
- [ ] 11 Submit application
- [ ] 12 Review application
- [ ] 13 Technician profile
- [ ] 14 Available technicians
- [ ] 15 Assign + schedule
- [ ] 16 Accept / reject
- [ ] 17 Reassign / reschedule
- [ ] 18 Cancel work order
- [ ] 19 Arrive
- [ ] 20 Send estimate
- [ ] 21 Estimate decision
- [ ] 22 Start work
- [ ] 23 Report + invoice
- [ ] 24 Checkout
- [ ] 25 bKash callback
- [ ] 26 Timeout
- [ ] 27 Feedback
- [ ] 28 Notifications
- [ ] 29 Audit logs
- [ ] 30 Analytics
- [ ] 31 Security, Postman, deploy