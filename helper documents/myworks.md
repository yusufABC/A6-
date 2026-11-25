# FSMS Feature Roadmap (with ready-to-paste prompts)

**How to use**
1. Pick the next feature in order. Never skip a "Needs first".
2. Open a NEW OpenCode chat.
3. Copy the prompt from the code block and send it.
4. Check the plan, let it build, run `npm run build`.
5. Run the "Test" list yourself. Fix, then `git commit`.
6. Tick the box in the Progress Tracker at the bottom.

The "Needs first" and "Test" lines are for YOU. Only the code block goes to the AI.

---

## Dependency Map

```
0A Schema+Seed -> 0B Helpers
        |
AUTH (done) -> 4 Profile -> 5 Services -> 6 Admin users
        |
7 Create request -> 8 List/cancel -> 9 Approve -> 10 Decline
        |
11 Submit application -> 12 Review application -> 13 Technician profile
        |
14 Available techs -> 15 Assign+schedule -> 16 Accept/reject -> 17 Reassign/reschedule
                                        \-> 18 Cancel work order
        |
19 Arrive -> 20 Send estimate -> 21 Estimate decision -> 22 Start -> 23 Report+invoice
        |
24 Checkout -> 25 bKash callback -> 26 Timeout
        |
27 Feedback, 28 Notifications, 29 Audit logs, 30 Analytics, 31 Finishing
```

---

## STEP 0

### 0A. Schema + migration + seed
**Needs first:** nothing. **Test:** `npx prisma studio` shows all tables and seeded rows.

```
Build step 0A: database setup.
Use database_model_relations.md for all rules.
- Create the full multi-file Prisma schema in prisma/schema/ (one file per group, as in the doc).
- Create the migration and run prisma generate.
- Write an idempotent seed script (safe to run twice) with:
  1 ADMIN, 1 MANAGER, 1 CUSTOMER, 1 TECHNICIAN with a TechnicianProfile (skills ["AC Repair"]),
  and 1 Service: "Split AC Servicing", requiredSkill "AC Repair", basePriceAmount 1500, 90 minutes.
- Seeded users must have emailVerified true and bcrypt-hashed passwords from config salt rounds.
Only this. Plan first, then stop.
```

### 0B. Shared helpers  (DONE)
statusMachine.ts, auditLog.ts, notification.ts are built and tested.

---

## PHASE 2: Users and catalog

### Feature 4: Profile
**Needs first:** Auth. **Test:** update name; update address; upload image twice (only the second stays in Cloudinary); wrong old password gives 400; `PATCH /me` with `{"role":"ADMIN"}` must NOT change the role; no token gives 401.

```
Build feature 4: Profile
(GET /users/me, PATCH /users/me, PATCH /users/me/address,
 POST /users/me/profile-image).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- All routes: any authenticated role, one auth(...) call listing all four roles.
- Never return password (use omit).
- PATCH /me: only name and phone. Never spread req.body.
- PATCH /me/address: only addressLine, city, district, postalCode.
- POST /me/profile-image: multer memory storage + Cloudinary, field name "profileImage",
  JPEG/PNG only, 5 MB max. Save imageUrl + imagePublicId, delete the old image after the new one succeeds.
- Add zod validation schemas in the module's validation file.
- Register /me routes so they will never be shadowed by a future /:id route.
Only this feature. Plan first, then stop.
```

### Feature 5: Services (catalog)
**Needs first:** 0A (admin seeded). **Test:** public list shows active only; customer creating a service gets 403; soft-deleted service disappears from public list but shows in `/all`.

```
Build feature 5: Service catalog
(GET /services, GET /services/:id, GET /services/all, POST /services, PATCH /services/:id, DELETE /services/:id).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- GET /services and GET /services/:id are PUBLIC and return only isActive = true and isDeleted = false.
- GET /services/all, POST, PATCH, DELETE are ADMIN only.
- Register /all BEFORE /:id so it is not treated as an id.
- DELETE is a soft delete (isDeleted + deletedAt).
- basePriceAmount is Decimal (never float); estimatedDurationMinutes is a positive integer.
- requiredSkill is stored as typed (trimmed). Matching later uses trim + lowercase.
- PATCH: only name, description, requiredSkill, basePriceAmount, estimatedDurationMinutes, isActive. Never spread req.body.
- GET /services/all: pagination (page, limit), searchTerm, sortBy/sortOrder, isActive filter, using the shared pagination pattern.
- Add zod validation schemas.
Only this feature. Plan first, then stop.
```

### Feature 6: Admin user management
**Needs first:** 0B. **Test:** suspended user cannot log in and their old token stops working; audit rows appear; admin cannot suspend themselves; customer calling any route gets 403.

```
Build feature 6: Admin user management
(GET /users, GET /users/:id, PATCH /users/:id/suspend, PATCH /users/:id/activate, PATCH /users/:id/role, DELETE /users/:id).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- All routes ADMIN only.
- Do not break the existing /users/me routes: /me must stay registered before /:id.
- Never return password (omit).
- GET /users: pagination, searchTerm (name/email), filters role and status, sortBy/sortOrder, isDeleted = false.
- suspend: status SUSPENDED + audit USER_SUSPENDED. activate: status ACTIVE + audit USER_ACTIVATED.
- role: change role + audit USER_ROLE_UPDATED with { oldRole, newRole } in metadata.
- DELETE: soft delete (isDeleted true, deletedAt, status DELETED) + audit RECORD_DELETED.
- An admin cannot suspend, delete or change the role of their own account.
- Every write uses prisma.$transaction with createAuditLog from the shared helper.
- Make sure checkAuth already rejects SUSPENDED, DELETED and isDeleted users; if not, tell me before changing it.
Only this feature. Plan first, then stop.
```

---

## PHASE 3: Service requests

### Feature 7: Create service request
**Needs first:** 5, 4 (user must have an address). **Test:** create with and without photos; user without address gets a clear 400; change the profile address afterwards and confirm the request kept its old address; inactive service gives 400.

```
Build feature 7: Create service request
(POST /service-requests, multipart with optional fault photos).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Roles: CUSTOMER and TECHNICIAN (one auth call).
- Body fields: serviceId, description, preferredDateTime (optional). Never spread req.body.
- Service must exist, isActive = true and isDeleted = false.
- Snapshot into the request: serviceNameSnapshot, basePriceSnapshot, and serviceAddressLine, serviceCity,
  serviceDistrict, servicePostalCode copied from the user's current address.
  If the user has no address (addressLine, city or district missing), return a clear 400.
- Photos: multer memory storage, field name "attachments", JPEG/PNG/PDF, 5 MB each, upload to Cloudinary,
  store [{ url, publicId }] in attachments.
- Status PENDING_REVIEW. Write audit REQUEST_CREATED in the same transaction.
- Add zod validation (the JSON fields arrive as multipart strings).
Only this feature. Plan first, then stop.
```

### Feature 8: List, get, cancel requests
**Needs first:** 7. **Test:** customer A cannot read customer B's request (403 or 404); manager sees all; cancel works in PENDING_REVIEW; cancel after assignment gives 403.

```
Build feature 8: Service request list, detail and cancel
(GET /service-requests, GET /service-requests/:id, DELETE /service-requests/:id).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- GET list: CUSTOMER/TECHNICIAN see ONLY their own requests; MANAGER/ADMIN see all.
  Pagination, filter by status, searchTerm, sortBy/sortOrder, isDeleted = false.
- GET :id: owner or MANAGER/ADMIN only (row-level check in the service); include workOrder and assignment info if present.
- DELETE (cancel): owner or MANAGER/ADMIN.
  Owner can cancel only when request is PENDING_REVIEW or its work order is AWAITING_ASSIGNMENT.
  MANAGER/ADMIN follow the same rule here (later features handle cancelling after assignment).
  Use assertTransition. If a work order exists, set it to CANCELLED in the same transaction as the request.
  Write audit REQUEST_CANCELLED with the reason (if sent) in metadata.
- Do not implement approve or decline yet.
Only this feature. Plan first, then stop.
```

### Feature 9: Approve request
**Needs first:** 8. **Test:** approve twice gives 400; customer calling it gives 403; a WorkOrder row exists in AWAITING_ASSIGNMENT; audit row REQUEST_APPROVED exists.

```
Build feature 9: Approve service request
(POST /service-requests/:id/approve, MANAGER and ADMIN).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Guard order: request exists -> status is PENDING_REVIEW (assertTransition to APPROVED) -> write.
- ONE prisma.$transaction: create WorkOrder (AWAITING_ASSIGNMENT), set request APPROVED,
  write audit REQUEST_APPROVED. Use tx for everything inside.
- Customer notification "Your request was approved": the NotificationCategory enum has no fitting value.
  Do NOT invent one. Skip the notification and tell me in your final report so I can decide.
- A manager or admin cannot approve their own request (requester must not equal approver).
Do NOT implement decline. Only this feature. Plan first, then stop.
```

### Feature 10: Decline request
**Needs first:** 9. **Test:** decline without reason gives 400; no WorkOrder is created; reason is in the audit metadata.

```
Build feature 10: Decline service request
(POST /service-requests/:id/decline, MANAGER and ADMIN, body: reason).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- reason is required (zod).
- Only from PENDING_REVIEW (assertTransition to DECLINED).
- ONE transaction: request DECLINED + audit REQUEST_DECLINED with metadata { reason }.
  There is no declineReason column; do not add one.
- Same self-action guard as approve.
Only this feature. Plan first, then stop.
```

---

## PHASE 4: Technician onboarding

### Feature 11: Submit technician application
**Needs first:** 4 (upload pattern). **Test:** second application while one is PENDING gives 409 or 400; wrong file type gives 400; withdraw works only while PENDING.

```
Build feature 11: Technician application (customer side)
(POST /technician-applications, GET /technician-applications/me, DELETE /technician-applications/:id).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- POST: role CUSTOMER only. multipart: file field "resume" (1 file), "additionalFiles" (max 5), and a "data" field with a JSON string.
  Validate the parsed data with zod (professionalTitle, yearsOfExperience, bio, skills[], serviceAreas[], workingDays, preferredHours).
  Allowed files JPEG/PNG/PDF, 5 MB each, uploaded to Cloudinary; store resume, resumePublicId, additionalFiles [{ url, publicId }].
- Only one PENDING application per user: inside a transaction, SELECT ... FOR UPDATE on the User row, then check. Duplicate gives 409.
- Rejected users may apply again (new row).
- Audit TECHNICIAN_APPLICATION_SUBMITTED in the same transaction.
- GET /me: own applications, newest first.
- DELETE /:id: owner only, only while PENDING, soft delete.
Only this feature. Plan first, then stop.
```

### Feature 12: Admin approve / reject application
**Needs first:** 11. **Test:** approve twice gives 400 and only ONE TechnicianProfile row exists; reject without reviewNote gives 400; manager gets 403; after approval the user must log in again to get the TECHNICIAN role.

```
Build feature 12: Technician application review (admin side)
(GET /technician-applications, POST /technician-applications/:id/approve, POST /technician-applications/:id/reject, ADMIN only).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Register GET "/" and the existing "/me" so they do not clash with "/:id".
- GET list: pagination, filter by status, searchTerm, isDeleted = false.
- approve: ONE transaction. Lock the application row (SELECT ... FOR UPDATE), must still be PENDING.
  Set application APPROVED with reviewedBy, reviewedAt, reviewNote (optional);
  set User.role = TECHNICIAN; create TechnicianProfile copying title, experience, bio, skills,
  serviceAreas, workingDays, preferredHours from the application;
  audit TECHNICIAN_APPROVED and USER_ROLE_UPDATED.
- reject: reviewNote REQUIRED. Application REJECTED, audit TECHNICIAN_REJECTED. User stays CUSTOMER.
- Do not create a second TechnicianProfile if one already exists for the user.
Only this feature. Plan first, then stop.
```

### Feature 13: Technician profile + public profile
**Needs first:** 12 (or the seeded technician). **Test:** public profile works without a token and shows no email; average rating is 0 or null with no feedback; `/me/profile` works only for TECHNICIAN.

```
Build feature 13: Technician profiles
(GET /technicians/:id, GET /technicians/:id/feedbacks [both PUBLIC],
GET /technicians/me/profile, PATCH /technicians/me/profile, GET /technicians/me/feedbacks, GET /technicians/me/stats [TECHNICIAN],
GET /technicians, PATCH /technicians/:id [ADMIN]).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Register every "/me/..." route BEFORE "/:id" routes. Do not create "/technicians/available" yet (feature 14).
- Public profile: name, imageUrl, professionalTitle, yearsOfExperience, bio, skills, serviceAreas, averageRating, totalReviews.
  Never expose email, phone or address.
- averageRating and totalReviews are computed live from Feedback (isDeleted = false). No cached columns.
- PATCH /me/profile: only professionalTitle, yearsOfExperience, bio, skills, serviceAreas, workingDays, preferredHours.
- /me/stats: simple counts only (assignments by status, completed jobs, average rating).
- Admin PATCH: edit profile fields or soft delete; list with pagination and searchTerm.
Only this feature. Plan first, then stop.
```

---

## PHASE 5: Dispatch

### Feature 14: Available technicians
**Needs first:** 9, 13. **Test:** technician without the skill is not listed; suspended technician is not listed; skill match ignores upper/lower case.

```
Build feature 14: Available technicians
(GET /technicians/available, MANAGER and ADMIN, query: workOrderId).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Register this route BEFORE "/technicians/:id".
- Load the work order's service skill (from its request's service requiredSkill).
- Compare with TechnicianProfile.skills using trim().toLowerCase() on both sides.
- Exclude technicians whose user is SUSPENDED, DELETED or isDeleted, and deleted profiles.
- Exclude the customer who made the request (self-assignment guard).
- Return id, name, professionalTitle, skills, serviceAreas, averageRating.
Only this feature. Plan first, then stop.
```

### Feature 15: Assign technician + schedule appointment
**Needs first:** 14. **Test:** overlapping time for the same technician gives 409; assigning a technician to their own request gives 400; assigning twice gives 400; WO is ASSIGNED and an Appointment exists.

```
Build feature 15: Assign technician and schedule appointment
(POST /work-orders/:id/assignment, MANAGER and ADMIN, body: technicianId, startTime, endTime optional).
Use SKILL.md (sections 17 and 18), requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- WorkOrder must be AWAITING_ASSIGNMENT (assertTransition to ASSIGNED).
- technicianId is a TechnicianProfile id. Technician's user must be ACTIVE and not deleted.
- Self-assignment guard: technician's userId must NOT equal the request's customerId, else 400.
- endTime defaults to startTime + service estimatedDurationMinutes; manager may override. endTime must be after startTime.
- ONE prisma.$transaction with options { maxWait: 10000, timeout: 30000 }:
  advisory lock pg_advisory_xact_lock(4242, hashtext(technicianId)) FIRST, then the overlap check
  (ignore CANCELLED and deleted appointments); overlap gives 409 and writes nothing.
  Then create Assignment (PENDING) and Appointment (SCHEDULED), update WorkOrder to ASSIGNED.
- Audit TECHNICIAN_ASSIGNED and APPOINTMENT_SCHEDULED. Notify the customer and the technician (category ASSIGNMENT).
- Use quoted camelCase column names in raw SQL (no @map on fields).
Only this feature. Plan first, then stop.
```

### Feature 16: Technician accept / reject
**Needs first:** 15. **Test:** another technician cannot accept your assignment (403 or 404); accept makes WO SCHEDULED; reject without reason gives 400; reject returns WO to AWAITING_ASSIGNMENT and appointment CANCELLED.

```
Build feature 16: Assignment accept and reject
(GET /assignments, GET /assignments/:id, POST /assignments/:id/accept, POST /assignments/:id/reject).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- accept/reject: TECHNICIAN only, and only for their own assignment (resolve TechnicianProfile by userId first,
  then compare technicianId; do not compare user id with profile id).
- GET list/detail: TECHNICIAN sees own only; MANAGER/ADMIN see all. Pagination and status filter.
  Do NOT add PATCH reassign yet (feature 17).
- accept: assignment PENDING -> ACCEPTED, WorkOrder ASSIGNED -> SCHEDULED (an active appointment must exist),
  audit ASSIGNMENT_ACCEPTED, notify customer (ASSIGNMENT).
- reject: body rejectionReason REQUIRED. Assignment -> REJECTED, store rejectionReason, appointment -> CANCELLED,
  WorkOrder -> AWAITING_ASSIGNMENT. Audit ASSIGNMENT_REJECTED with metadata { reason }.
  Notify customer and MANAGER/ADMIN users (ASSIGNMENT).
- Everything in one transaction using assertTransition.
Only this feature. Plan first, then stop.
```

### Feature 17: Reassign, reschedule, cancel appointment
**Needs first:** 16. **Test:** after reassign the assignments table still has ONE row for that work order; reschedule into a conflicting time gives 409; cancelling an appointment sets it CANCELLED.

```
Build feature 17: Reassign, reschedule and cancel appointment
(PATCH /assignments/:id, PATCH /appointments/:id, DELETE /appointments/:id, MANAGER and ADMIN).
Use SKILL.md (sections 17 and 18), requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Reassign (PATCH /assignments/:id, body technicianId, startTime, endTime optional):
  only when assignment is REJECTED, or PENDING/ACCEPTED with a manager decision.
  UPDATE THE SAME Assignment row (never insert a second): new technicianId, status PENDING, rejectionReason null.
  Same self-assignment and suspended-technician guards as feature 15; advisory lock + overlap check again.
  Cancel the old appointment and create a new one (or update the same row, as the doc says: reschedule updates times on the same row).
  WorkOrder becomes ASSIGNED. Audit ASSIGNMENT_REPLACED with { oldTechnicianId, newTechnicianId }. Notify the old technician.
- Reschedule (PATCH /appointments/:id, body startTime, endTime): update times on the same row, overlap check again,
  audit APPOINTMENT_RESCHEDULED with old times in metadata.
- Cancel (DELETE /appointments/:id): appointment CANCELLED + audit APPOINTMENT_CANCELLED.
- Transactions with { maxWait: 10000, timeout: 30000 } where the lock is used.
Only this feature. Plan first, then stop.
```

### Feature 18: Cancel work order
**Needs first:** 15. **Test:** after cancel, Assignment, Appointment, WorkOrder and ServiceRequest all show CANCELLED; cancel from WORK_COMPLETED gives 400; reason is missing gives 400.

```
Build feature 18: Cancel work order
(POST /work-orders/:id/cancel, MANAGER and ADMIN, body: reason).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- reason required.
- Allowed from AWAITING_ASSIGNMENT, ASSIGNED, SCHEDULED, ARRIVED, AWAITING_ESTIMATE_APPROVAL, ESTIMATE_APPROVED, IN_PROGRESS.
  NOT from WORK_COMPLETED or terminal states (use assertTransition).
- ONE transaction: active Assignment -> CANCELLED, Appointment -> CANCELLED, WorkOrder -> CANCELLED,
  ServiceRequest -> CANCELLED. No invoice is generated.
- Audit WORK_ORDER_CANCELLED with metadata { reason }. Notify the customer and the assigned technician (ASSIGNMENT).
- Also add GET /work-orders (MANAGER, ADMIN: paginated, status filter) and GET /work-orders/:id
  (MANAGER/ADMIN all, TECHNICIAN own assigned, CUSTOMER own).
Only this feature. Plan first, then stop.
```

---

## PHASE 6: Field work

### Feature 19: Mark arrival
**Needs first:** 16. **Test:** other technician gets 403 or 404; WO must be SCHEDULED or you get 400.

```
Build feature 19: Mark arrival
(POST /work-orders/:id/arrive, TECHNICIAN).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Only the technician on the ACCEPTED assignment of this work order (resolve the profile by userId).
- WorkOrder SCHEDULED -> ARRIVED via assertTransition. No other table changes.
- Technician must not be arriving at their own request (should be impossible, but keep the guard).
Only this feature. Plan first, then stop.
```

### Feature 20: Send estimate
**Needs first:** 19. **Test:** v1 then v2: v1 becomes SUPERSEDED, versionNumber increments; sending from the wrong WO status gives 400; totalAmount ignores customer-provided items.

```
Build feature 20: Send estimate
(POST /work-orders/:id/estimates, GET /work-orders/:id/estimates).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- POST: TECHNICIAN assigned to this work order only. Allowed when WO is ARRIVED (first estimate) or IN_PROGRESS (mid-job revision).
  Body: items [{ name, quantity, unitPrice, type LABOR|MATERIAL, customerProvided }], validUntil optional.
  Never spread req.body. At least one item.
- Each version is the FULL scope (cumulative).
- versionNumber = MAX(versionNumber) + 1 for that work order. If a SENT estimate exists, set it SUPERSEDED first.
- totalAmount = SUM(quantity * unitPrice) for items where customerProvided = false. Use Decimal, never float; round once at the end.
- WorkOrder -> AWAITING_ESTIMATE_APPROVAL via assertTransition. Audit ESTIMATE_SENT. Notify customer (ESTIMATE).
- All in one transaction. Lock the WorkOrder row (SELECT ... FOR UPDATE) to avoid duplicate versions.
- GET: assigned technician, MANAGER/ADMIN, and the owning customer.
Only this feature. Plan first, then stop.
```

### Feature 21: Customer estimate decision
**Needs first:** 20. **Test:** approve v2 after v1 revision; reject BEFORE work gives WO CLOSED_NO_WORK; reject DURING work keeps WO IN_PROGRESS; another customer gets 403; two APPROVED estimates never exist.

```
Build feature 21: Customer estimate decision
(POST /estimates/:id/approve, POST /estimates/:id/revision, POST /estimates/:id/reject).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Roles CUSTOMER and TECHNICIAN, but only on their OWN service request (row-level check in the service).
- Estimate must be SENT. In every case lock the WorkOrder row first (SELECT ... FOR UPDATE).
- approve: estimate -> APPROVED; any previous APPROVED estimate -> SUPERSEDED.
  WorkOrder -> ESTIMATE_APPROVED if work had not started, or back to IN_PROGRESS if this was a mid-job revision.
  Audit ESTIMATE_APPROVED. Notify technician (ESTIMATE).
- revision: body note optional. Estimate -> REVISION_REQUESTED, WorkOrder stays AWAITING_ESTIMATE_APPROVAL.
  Audit ESTIMATE_REVISION_REQUESTED (note in metadata). Notify technician.
- reject: estimate -> REJECTED.
  If work NEVER started: WorkOrder -> CLOSED_NO_WORK and ServiceRequest -> CLOSED_NO_WORK in the same transaction.
  If this was a mid-job revision: WorkOrder -> IN_PROGRESS (technician finishes the last approved scope), request unchanged.
  Audit ESTIMATE_REJECTED. Notify technician.
- To know whether work had started, use whether any earlier estimate was APPROVED (explain your approach in the plan).
Only this feature. Plan first, then stop.
```

### Feature 22: Start work
**Needs first:** 21. **Test:** starting before approval gives 400; other technician gets 403.

```
Build feature 22: Start work
(POST /work-orders/:id/start, TECHNICIAN).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Only the assigned technician. WorkOrder ESTIMATE_APPROVED -> IN_PROGRESS via assertTransition.
- Audit WORK_ORDER_STARTED in the same transaction.
Only this feature. Plan first, then stop.
```

### Feature 23: Submit report, complete, auto invoice
**Needs first:** 22. **Test:** invoice total equals the latest APPROVED estimate, not the report; customer-provided items show lineTotal 0; WO is WORK_COMPLETED; submitting twice gives 409 or 400.

```
Build feature 23: Service report, completion and invoice
(POST /work-orders/:id/report [TECHNICIAN, multipart], GET /work-orders/:id/invoice [owner or MANAGER/ADMIN]).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- WorkOrder must be IN_PROGRESS and the caller must be the assigned technician.
- multipart: "attachments" photos (JPEG/PNG, 5 MB) and a "data" JSON string: diagnosis, workPerformed, laborHours,
  notes, items [{ name, quantity, customerProvided }]. Validate with zod.
- ONE transaction:
  1. create ServiceReport + ServiceReportItem rows;
  2. find the LATEST APPROVED estimate of the work order (never a rejected or sent one);
  3. create Invoice (UNPAID) with approvedEstimateId, approvedAt, and InvoiceItem rows copied from EstimateItem;
     customerProvided items get lineTotal 0; totalAmount = SUM(lineTotal);
  4. WorkOrder IN_PROGRESS -> WORK_COMPLETED;
  5. audit WORK_ORDER_COMPLETED and INVOICE_GENERATED; notify customer (COMPLETION).
- The report never changes billing amounts. Money is Decimal.
- One report and one invoice per work order (unique constraints); a second submit returns a clear 409.
Only this feature. Plan first, then stop.
```

---

## PHASE 7: Payment (go slowly, test every step)

### Feature 24: bKash checkout
**Needs first:** 23, bKash sandbox keys in `.env` and in the config file. **Test:** second checkout while one UNPAID payment is active gives 409; paid invoice gives 400; response has bkashURL; Payment row has an idempotencyKey.

```
Build feature 24: bKash checkout and invoice reads
(POST /invoices/:id/checkout, GET /invoices/:id/payments, GET /invoices, GET /invoices/:workOrderId).
Use SKILL.md (section 19), requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Register "/invoices/:workOrderId" so it does not clash with "/invoices/:id/..." routes (explain your route plan).
- checkout: CUSTOMER and TECHNICIAN, only on their OWN invoice. Invoice must be UNPAID and have no active UNPAID payment.
- Generate a UUID idempotencyKey BEFORE calling bKash. Create Payment (UNPAID, amount = invoice.totalAmount).
- Audit PAYMENT_STARTED. Call bKash Create Payment, store bkashPaymentId, return { bkashURL }.
- Keep the external bKash HTTP call OUT of a long DB transaction if possible.
- bKash token + refresh token cached in Redis with TTL (src/app/lib/bkash.ts).
- GET /invoices: MANAGER/ADMIN, paginated. GET /:workOrderId and /:id/payments: owner or MANAGER/ADMIN.
- A customer retrying a failed checkout creates a NEW Payment row with a NEW idempotencyKey.
Only this feature. Plan first, then stop.
```

### Feature 25: bKash callback
**Needs first:** 24. **Test:** call the callback twice and the second changes nothing and does not error; force an error mid-transaction and confirm EVERYTHING rolls back; run Part H checks H5 and H7 from the DB doc.

```
Build feature 25: bKash callback
(POST or GET /payments/bkash/callback, PUBLIC, no JWT; use whichever bKash actually calls, and tell me which).
Use SKILL.md (section 19), requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- NEVER trust the callback body for status or amount. Always call bKash Execute/Query API to verify.
- Find Payment by bkashPaymentId. If already PAID, return success and write nothing (replay).
- On confirmed success, ONE transaction:
  lock the Invoice row (SELECT ... FOR UPDATE); if Invoice already PAID, return success;
  Payment -> PAID (bkashTrxId, paidAt, gatewayResponse); Invoice -> PAID (paidAt);
  WorkOrder WORK_COMPLETED -> COMPLETED; ServiceRequest -> COMPLETED;
  audit PAYMENT_PAID with userId null; notifications for customer and technician (PAYMENT).
- On failed or user-cancelled: Payment -> FAILED or CANCELLED, audit PAYMENT_FAILED, notify customer (PAYMENT).
- Finish with res.redirect to the frontend callback URL from config with ?status=success or ?status=failed.
- Use assertTransition for every status change.
Only this feature. Plan first, then stop.
```

### Feature 26: Timeout safety
**Needs first:** 25. **Test:** an old UNPAID payment where bKash says success becomes PAID, not CANCELLED.

```
Build feature 26: Payment timeout handling
Use SKILL.md (section 19), requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- For UNPAID payments older than 30 minutes: call bKash Query Payment FIRST.
  If bKash says success, run the same success transaction as the callback (reuse it, do not copy it).
  Only if bKash shows no success, set Payment CANCELLED and audit PAYMENT_FAILED.
- Trigger: run it as a node-cron job (cron callback must catch its own errors) and ALSO when a customer calls checkout again for that invoice.
Only this feature. Plan first, then stop.
```

---

## PHASE 8: Finishing

### Feature 27: Feedback
**Needs first:** 25. **Test:** feedback before payment gives 403 or 409; second feedback gives 409; rating 0 or 6 gives 400; another customer gets 403.

```
Build feature 27: Feedback
(POST /work-orders/:id/feedback, CUSTOMER and TECHNICIAN on their OWN requests).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Body: rating (integer 1 to 5), comment optional. Never spread req.body.
- Guards, server-side: owner of the service request; Invoice.status = PAID; no existing Feedback for this work order.
- technicianId = technician on the ACCEPTED assignment of this work order.
- No feedback for CLOSED_NO_WORK or CANCELLED work orders.
Only this feature. Plan first, then stop.
```

### Feature 28: Notifications
**Needs first:** any. **Test:** you only ever see your own; read-all marks only yours.

```
Build feature 28: Notifications
(GET /notifications, PATCH /notifications/:id/read, PATCH /notifications/read-all, any authenticated role).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Register "/read-all" BEFORE "/:id/read".
- Own notifications only, isDeleted = false, paginated, newest first, optional isRead and category filters.
- Include unread count in meta.
Only this feature. Plan first, then stop.
```

### Feature 29: Audit logs
**Needs first:** 0B. **Test:** manager gets 403; filters work.

```
Build feature 29: Audit logs
(GET /audit-logs, ADMIN only).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- Paginated, newest first, filters: entityType, action, userId, date range.
- Include the acting user's name and role (omit password).
Only this feature. Plan first, then stop.
```

### Feature 30: Analytics
**Needs first:** 25. **Test:** numbers match what you see in Prisma Studio.

```
Build feature 30: Analytics
(GET /analytics/revenue [ADMIN], /analytics/work-orders [ADMIN, MANAGER],
/analytics/technician-performance [ADMIN], /analytics/summary [any authenticated, role-aware]).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Rules to follow:
- revenue: SUM of PAID invoices, total and by month. Money is Decimal.
- work-orders: counts grouped by status.
- technician-performance: completed jobs and average rating per technician.
- summary: CUSTOMER sees own request/invoice counts; TECHNICIAN own jobs and rating; MANAGER operational counts; ADMIN system-wide.
- Keep it basic. No extra endpoints.
Only this feature. Plan first, then stop.
```

### Feature 31: Security, docs, deploy
**Needs first:** all. **Test:** 6 wrong logins in 15 minutes gets 429; response headers include Helmet headers.

```
Build feature 31: Final hardening
Use SKILL.md section 21 as the checklist.
Rules to follow:
- helmet() in app.ts; CORS using the frontend origin from config.
- express-rate-limit: 100 requests / 15 min globally; 5 / 15 min on /auth/login and /auth/forgot-password.
- Create .env.example with every variable used in config (placeholders only).
- Config fail-fast: throw at startup if a required env var is missing.
- Report which items of section 21 are done and which are not. Do not add features.
Only this. Plan first, then stop.
```

Then you do by hand: export the Postman collection, deploy to Render or Vercel, run the Part H queries from `database_model_relations.md`.

---

## Progress Tracker

- [ ] 0A Schema + seed
- [x] 0B Helpers
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