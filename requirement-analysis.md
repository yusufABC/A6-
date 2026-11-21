# FSMS — Complete System Requirements & Architecture Specification

---

## 1. System Roles, Hierarchy & Authorization

The system implements Role-Based Access Control (RBAC) with four roles:

1. **Customer** — Creates service requests, reviews estimates, pays invoices via bKash, and submits feedback.
2. **Technician** — Approved service provider who accepts/rejects assignments, submits estimates, performs field work, and submits service reports. **Retains full Customer capabilities** (can create requests for their own property, pay invoices, submit feedback).
3. **Manager** — Operational dispatcher who reviews/approves/declines requests, assigns technicians, schedules visits, monitors work orders, and handles reassignments.
4. **Admin** — Super-administrator: all Manager capabilities plus user account management, technician application approvals, service catalog management, audit log access, and financial oversight.

> **Role Design Decisions:**
> - **Database enum:** `CUSTOMER`, `TECHNICIAN`, `MANAGER`, `ADMIN`.
> - **3-role compliance:** For assignment rubrics, Manager and Admin can be grouped as one administrative tier. They are separated here for operational least-privilege.
> - **Extendability:** A future `FINANCE` role can be added without schema restructuring.
> - **Finance/Admin merge:** The original brief listed Finance/Admin as a separate role. This is an explicit design decision to merge Finance responsibilities into Admin. The enum-based architecture allows splitting them later if needed.
> - **Dual capability:** A Technician is also a Customer. They can create service requests, pay invoices, and submit feedback. **Self-assignment guard:** A technician cannot be assigned to a work order created from their own service request.

### User & Authentication Model

- **User fields:** `id`, `name`, `email` (unique), `password` (nullable — credential login only), `googleId` (unique, nullable), `authProvider` (`GOOGLE` | `CREDENTIAL`), `emailVerified`, `role`, `status`, `phone`, `imageUrl`, `imagePublicId`, plus the single flat address fields (Section 16).
- **User status enum:** `ACTIVE`, `SUSPENDED`, `DELETED`. `SUSPENDED` is the operational block; `DELETED` mirrors soft-delete (`isDeleted` + `deletedAt`).
- **Registration:** email/password (`AuthProvider.CREDENTIAL`) or Google OAuth (`AuthProvider.GOOGLE`).
- **Soft delete:** users are never hard-deleted; a soft-deleted email remains occupied by the unique constraint (restore-only behavior). See G-18 in the database model doc.

---

# 2. Customer (Service Receiver)

### Who is a Customer?
A registered user who creates requests to receive services at their property.

### Customer Responsibilities

| ID | Responsibility | Description |
|---|---|---|
| C01 | Register | Create account using email/password or Google OAuth |
| C02 | Login | Authenticate to access the customer dashboard |
| C03 | Manage Profile | Update name, phone number, and avatar |
| C04 | Manage Address | Maintain a single saved address (`addressLine`, `city`, `district`, `postalCode`) on the user profile |
| C05 | Browse Services | View active services, base prices, required skill, and estimated durations |
| C06 | Create Service Request | Submit request with service type, problem description, snapshotted address, preferred date/time, and attachments |
| C07 | Upload Fault Photos/Documents | Upload fault photos to the request `attachments` JSON (see Section 14 for rules) |
| C08 | View Requests | View paginated list of own requests and history |
| C09 | Track Request | Monitor live status of request and work order |
| C10 | View Technician | View assigned technician profile (name, photo, phone, average rating) |
| C11 | Cancel Request | Cancel **only when** request is `PENDING_REVIEW` or work order is `AWAITING_ASSIGNMENT` |
| C12 | View Appointment | View scheduled visit start/end times |
| C13 | Review Estimate | Approve, request revision, or reject technician estimate |
| C14 | View Work Report | View technician service report, materials breakdown, and work photos |
| C15 | View Invoice | View system-generated invoice (customer-provided items shown at ৳0.00) |
| C16 | Pay Invoice | Pay via bKash |
| C17 | Retry Payment | Retry after failed/abandoned bKash checkout using the same invoice |
| C18 | View Payment History | View transaction receipts and bKash logs |
| C19 | Submit Feedback | Rate (1–5 stars) and review after invoice is `PAID` (one per work order) |
| C20 | Apply as Technician | Submit application with professional documents |

### Customer Restrictions
- Cannot approve/reject their own service requests.
- Cannot assign technicians.
- Cannot cancel once the work order leaves `AWAITING_ASSIGNMENT` (requires Manager/Admin).
- Cannot alter estimate or invoice amounts.
- Cannot mark a payment as successful.
- Cannot submit feedback before invoice is `PAID`, or more than once per work order.
- Cannot access another customer's requests, invoices, payments, or reports (ownership middleware enforced; returns 403 or 404 per disclosure policy).

---

# 3. Technician (Service Provider)

### Who is a Technician?
A verified professional approved through the application workflow (Section 10). Retains all Customer capabilities.

### Technician Responsibilities

| ID | Responsibility | Description |
|---|---|---|
| T01 | Login | Standard login; JWT carries `role: TECHNICIAN` |
| T02 | Manage Profile | Update bio, experience, service districts |
| T03 | Manage Skills | Maintain a skill list stored as a JSON array (`skills Json`) — e.g. `["AC Repair","Electrical","Plumbing"]` |
| T04 | Manage Availability | Set weekly working days (`workingDays Json`) and `preferredHours` |
| T05 | View Assignments | View jobs assigned by Manager/Admin |
| T06 | Accept Assignment | Accept assignment (appointment is created by Manager/Admin) |
| T07 | Reject Assignment | Reject with mandatory reason (triggers reassignment) |
| T08 | View Schedule | View upcoming visits calendar |
| T09 | View Customer Info | Access customer address and phone for accepted jobs only |
| T10 | Mark Arrival | Confirm arrival at customer location |
| T11 | Create Estimate | Submit itemized estimate after inspection |
| T12 | Revise Estimate | Submit revised estimate when scope changes (before or during work) |
| T13 | Start Work | Mark work order `IN_PROGRESS` after customer approves estimate |
| T14 | Upload Work Evidence | Upload before/after photos to service report (see Section 14) |
| T15 | Submit Service Report | Record diagnosis, work performed, materials (with `customerProvided` flags), and labor hours |
| T16 | Complete Work Order | Mark `WORK_COMPLETED`; triggers invoice generation |

### Technician Restrictions
- Cannot approve or reject service requests.
- Cannot assign jobs to themselves or other technicians.
- Cannot be assigned to a work order created from their own service request.
- Cannot access unassigned customer information.
- Cannot start work before the customer approves the estimate.
- Cannot perform additional chargeable work without a revised estimate approved by the customer.
- Cannot mark an invoice as paid or alter invoice amounts.
- Cannot access another technician's assignments.
- Cannot edit a completed work order or submitted service report (Admin correction process required).

### TechnicianProfile Fields
`id`, `userId` (unique, 1:1 with `User`), `professionalTitle`, `yearsOfExperience`, `bio`, `skills` (JSON), `serviceAreas` (JSON), `workingDays` (JSON), `preferredHours`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`.

There is **no separate `Skill` or `TechnicianSkill` table** — skills are plain JSON string arrays on the profile/application, matched against `Service.requiredSkill` using normalized values (trim + lowercase). See G-14 in the database model doc.

---

# 4. Manager (Operations & Dispatcher)

### Manager Responsibilities
- Review incoming service requests.
- Approve requests (creates `WorkOrder` in `AWAITING_ASSIGNMENT`) or decline with reason.
- Match technicians by skill, service area, availability, and schedule.
- Assign technicians and manage reassignments.
- Schedule and reschedule appointments with conflict checks.
- Monitor active work orders, estimates, and invoices.
- Cancel work orders with audited reasons.

### Manager Restrictions
- Cannot suspend/delete user accounts or change user roles.
- Cannot review or approve technician applications (Admin only).
- Cannot access system configuration, API credentials, or full audit logs.
- Cannot manage the service catalog or pricing.

---

# 5. Admin (Super Administrator)

### Admin Responsibilities (Superset of Manager)
- All Manager operational duties.
- **User Management:** Activate, suspend, reactivate accounts; update user roles.
- **Technician Onboarding:** Review and approve/reject technician applications (atomic transaction).
- **Service Catalog:** Create, update, soft-delete services, required skills, base prices, and estimated durations.
- **Audit & Compliance:** Access full `audit_logs`.
- **Financial Oversight:** Monitor all bKash transactions, invoices, revenue.

---

# 6. Status Enums

### 6.1 Service Request Status

```typescript
enum ServiceRequestStatus {
  PENDING_REVIEW       // Created by customer; awaiting Manager/Admin review
  APPROVED             // Approved; WorkOrder created
  DECLINED             // Declined by Manager/Admin with reason (Terminal)
  COMPLETED            // Work done and invoice paid (Terminal)
  CLOSED_NO_WORK       // Estimate rejected; no work performed (Terminal)
  CANCELLED            // Cancelled by customer or Manager/Admin (Terminal)
}
```

**Allowed transitions:**

| From | To |
|---|---|
| `PENDING_REVIEW` | `APPROVED`, `DECLINED`, `CANCELLED` |
| `APPROVED` | `COMPLETED`, `CLOSED_NO_WORK`, `CANCELLED` |
| `DECLINED` | Terminal |
| `COMPLETED` | Terminal |
| `CLOSED_NO_WORK` | Terminal |
| `CANCELLED` | Terminal |

**Rule:** Request status is updated **only** in the same database transaction as the Work Order's terminal transition. It is never moved by hand.

**Work Order → Service Request mapping:**

| Work Order Terminal Status | Service Request Status |
|---|---|
| `COMPLETED` | `COMPLETED` |
| `CLOSED_NO_WORK` | `CLOSED_NO_WORK` |
| `CANCELLED` | `CANCELLED` |

### 6.2 Work Order Status

```typescript
enum WorkOrderStatus {
  AWAITING_ASSIGNMENT            // Created when request approved; no technician yet
  ASSIGNED                       // Manager assigned technician; awaiting accept/reject
  SCHEDULED                      // Technician accepted; appointment confirmed
  ARRIVED                        // Technician checked in at location
  AWAITING_ESTIMATE_APPROVAL     // Estimate sent; awaiting customer decision
  ESTIMATE_APPROVED              // Customer approved estimate; ready for work
  IN_PROGRESS                    // Technician actively performing work
  WORK_COMPLETED                 // Work done, report submitted, invoice generated; awaiting payment
  COMPLETED                      // Invoice paid; work order fully closed (Terminal)
  CLOSED_NO_WORK                 // Customer rejected estimate; no work done (Terminal)
  CANCELLED                      // Cancelled by Manager/Admin (Terminal)
}
```

**Allowed transitions:**

| From | To |
|---|---|
| `AWAITING_ASSIGNMENT` | `ASSIGNED`, `CANCELLED` |
| `ASSIGNED` | `SCHEDULED`, `AWAITING_ASSIGNMENT` (tech rejects), `CANCELLED` |
| `SCHEDULED` | `ARRIVED`, `AWAITING_ASSIGNMENT` (tech replaced), `CANCELLED` |
| `ARRIVED` | `AWAITING_ESTIMATE_APPROVAL`, `CANCELLED` |
| `AWAITING_ESTIMATE_APPROVAL` | `ESTIMATE_APPROVED`, `CLOSED_NO_WORK`, `CANCELLED` |
| `ESTIMATE_APPROVED` | `IN_PROGRESS`, `CLOSED_NO_WORK`, `CANCELLED` |
| `IN_PROGRESS` | `AWAITING_ESTIMATE_APPROVAL` (mid-job revision), `WORK_COMPLETED`, `CANCELLED` |
| `WORK_COMPLETED` | `COMPLETED` (on payment success) |
| `COMPLETED` | Terminal |
| `CLOSED_NO_WORK` | Terminal |
| `CANCELLED` | Terminal |

**Key clarification:** `WORK_COMPLETED` is the state between technician completion and customer payment. `COMPLETED` is set only when `Invoice.status = 'PAID'`, in the same transaction as the payment verification. If the customer never pays, the work order remains `WORK_COMPLETED` and the invoice remains `UNPAID` (Admin can follow up; there is **no invoice-void operation** in MVP — `InvoiceStatus` has only `UNPAID` and `PAID`).

### 6.3 Assignment Status

```typescript
enum AssignmentStatus {
  PENDING      // Admin assigned technician; awaiting response
  ACCEPTED     // Technician accepted
  REJECTED     // Technician rejected with reason; Manager can change technician on same record
  CANCELLED    // Work order cancelled while this assignment was active
}
```

**Rules:**
- **One assignment record per work order** (`UNIQUE(workOrderId)`). No history records; no multiple assignments.
- If the technician rejects, Manager/Admin updates the `technicianId` on the **same assignment record** and resets status to `PENDING`. No new row is created.
- `CANCELLED` → set when a work order is cancelled while the assignment is `PENDING` or `ACCEPTED`.
- When an assignment becomes `REJECTED` (before reassignment) or `CANCELLED`, its associated appointment is automatically marked `CANCELLED`.

### 6.4 Estimate Status

```typescript
enum EstimateStatus {
  SENT                  // Submitted by technician; awaiting customer response
  REVISION_REQUESTED    // Customer asked for changes; technician must send new version
  SUPERSEDED            // Replaced by a newer version (historical record)
  APPROVED              // Customer approved this version
  REJECTED              // Customer rejected; no further versions expected
  EXPIRED               // Validity period passed without customer action
}
```

**Rules:**
- Exactly one estimate version can be active (`SENT`) per work order at a time.
- Customer requests revision → current estimate becomes `REVISION_REQUESTED`, technician submits new version (`versionNumber + 1`, status `SENT`), old version becomes `SUPERSEDED`. Work order stays `AWAITING_ESTIMATE_APPROVAL`.
- Customer approves → estimate becomes `APPROVED`, work order moves to `ESTIMATE_APPROVED`.
- When a new version is approved, any previously `APPROVED` version becomes `SUPERSEDED` (only one `APPROVED` estimate per work order).
- Customer rejects → estimate becomes `REJECTED`, work order moves to `CLOSED_NO_WORK` (if no work has started) or see mid-job revision rules (Section 7).
- Estimate expires → estimate becomes `EXPIRED`, work order stays `AWAITING_ESTIMATE_APPROVAL`. Technician can send a new version.

### 6.5 Invoice Status

```typescript
enum InvoiceStatus {
  UNPAID     // Generated after work completion; awaiting payment
  PAID       // Full payment verified via bKash
}
```

**Invoice Structure:** Each invoice contains line items with item descriptions, quantities, unit prices, and a total amount. Customer-provided items appear with ৳0.00 charge and a `Provided by Customer` label.

**Invoice fields:** `id`, `workOrderId` (unique), `status` (`UNPAID` | `PAID`), `totalAmount`, `issuedAt`, `paidAt`, `approvedEstimateId` (unique FK to the approved `Estimate`), `approvedAt`, `createdAt`, `updatedAt`.

**InvoiceItem fields:** `id`, `invoiceId`, `name`, `quantity`, `unitPrice`, `lineTotal`, `customerProvided`, `createdAt`.

**Rules:**
- **One invoice per work order** (`UNIQUE(workOrderId)`). No versioning, replacement invoices, or complex adjustment workflows.
- Generated automatically after work completion (technician marks `WORK_COMPLETED`).
- The invoice stores `approvedEstimateId` (the approved estimate version it was generated from) and `approvedAt`.
- **Cannot be edited after payment.** Once `PAID`, the invoice is immutable.
- No partial payments: an invoice is paid in full by one successful payment.
- Invoices are **never deleted** (soft or hard). There is no `VOIDED` status; an unpaid invoice simply stays `UNPAID`.

### 6.6 Payment Status

```typescript
enum PaymentStatus {
  UNPAID      // Checkout created; awaiting bKash confirmation
  PAID        // Payment verified via bKash webhook/API
  FAILED      // Payment failed at gateway
  CANCELLED   // Customer cancelled checkout or 30-minute timeout
}
```

**Payment fields:** `id`, `invoiceId`, `status`, `amount`, `currency` (default `BDT`), `paymentGateway` (default `bkash`), `bkashPaymentId` (unique, nullable), `bkashTrxId` (unique, nullable), `idempotencyKey` (unique, generated per checkout attempt), `payerReference`, `paidAt`, `gatewayResponse` (JSON), `createdAt`, `updatedAt`.

**Rules:**
- `bkashPaymentId` (bKash) and `bkashTrxId` (bKash) are both unique in the payments table.
- `idempotencyKey` is generated **before** calling bKash and reused on retries (one key per checkout attempt).
- At most one active payment (`UNPAID`) per invoice at a time.
- **Timeout safety:** Before marking an `UNPAID` payment as `CANCELLED` after the 30-minute timeout, the backend must call the bKash Query Payment API to check if bKash has already confirmed it. Only cancel if bKash returns no success.
- No partial payments: the full invoice amount in one transaction.
- Multiple failed/cancelled payment attempts may belong to one invoice.
- Duplicate bKash callbacks must not create duplicate successful payments (idempotency on `bkashPaymentId`); a replayed success callback returns success without writing.
- Client-side redirects are untrusted; only backend-verified bKash IPN/webhook or API status checks mark success.
- **One successful payment per invoice:** the success callback locks the `Invoice` row and rejects if already `PAID`.
- `Payment.status = 'PAID'` and `Invoice.status = 'PAID'` and `WorkOrder.status = 'COMPLETED'` and `ServiceRequest.status = 'COMPLETED'` are all set in the **same atomic database transaction**.
- **Refunds:** Explicitly out of scope for MVP.
- **UI label note:** payment `UNPAID` means "checkout pending", not "invoice unpaid". Label it distinctly from the invoice state (see G-17).

### 6.7 Appointment Status

```typescript
enum AppointmentStatus {
  SCHEDULED    // Confirmed visit time
  CANCELLED    // Parent assignment rejected/replaced/cancelled, or work order cancelled
}
```

**Fields:** `id`, `assignmentId`, `startTime` (`timestamptz`), `endTime` (`timestamptz`), `status`, `createdAt`, `updatedAt`.

**Rules:**
- Appointment is created by Manager/Admin when scheduling the visit (after assignment, before or after technician accepts).
- Work order moves to `SCHEDULED` only after the technician accepts the assignment **and** an appointment exists.
- `technicianId` is resolved through the assignment (not stored on the appointment).

### 6.8 Technician Application Status

```typescript
enum TechnicianApplicationStatus {
  PENDING    // Submitted; awaiting Admin review
  APPROVED   // Admin approved; user role changed to TECHNICIAN
  REJECTED   // Admin rejected with reason
}
```

(Full details in Section 10.)

---

# 7. Mid-Job Estimate Revision Flow

When additional work or cost is discovered after work has already started:

1. Technician submits a revised estimate (new version, status `SENT`). **Each estimate version is cumulative** — it restates the entire scope (all labor and material), not just the newly discovered work.
2. Work order transitions: `IN_PROGRESS` → `AWAITING_ESTIMATE_APPROVAL`.
3. Customer reviews the revised estimate:
   - **Approves:** Estimate → `APPROVED`, work order → `IN_PROGRESS` (resumes).
   - **Rejects:** Estimate → `REJECTED`. Since work has already started, the work order does **not** become `CLOSED_NO_WORK`. Instead:
     - The technician completes only the originally approved scope.
     - The work order remains `IN_PROGRESS` and the technician marks it `WORK_COMPLETED` based on the previously approved estimate.
     - The invoice is generated from the **last approved estimate** (not the rejected revision).
4. **Rule:** `CLOSED_NO_WORK` is only valid when no work has been performed. Once work has started (`IN_PROGRESS` was reached), the work order must end as `WORK_COMPLETED` → `COMPLETED` or `CANCELLED`.
5. **Cumulative-version rule:** because a new version replaces the whole scope, the invoice builder only ever reads the latest `APPROVED` estimate. Storing only deltas would silently drop earlier items (see G-07 in the database model doc).

---

# 8. Service Report vs. Estimate (Billing Relationship)

**The approved estimate is the single source of truth for billing.** The service report is a record of what actually happened in the field.

- **Estimate** defines: labor amount, material items with prices, total. This is what the customer agreed to pay.
- **Service Report** records: problem found, work performed, actual labor hours, actual materials used (with `customerProvided` flags), technician notes, and work photos.
- **Invoice** is generated from the **approved estimate** (the last approved version, including any approved mid-job revisions):
  - Labor amount = approved estimate's labor amount.
  - Material items = approved estimate's items where `customerProvided = false`.
  - Customer-provided items from the estimate are listed on the invoice at ৳0.00 with a `Provided by Customer` badge.
- **The service report never affects billing amounts.** It exists for:
  - Transparency (customer sees what was done).
  - Dispute resolution (Admin can compare estimate vs. report).
  - Warranty records (materials documented).
- **Estimate model** uses `EstimateItem` for all line items. There is no separate `laborAmount` field on the Estimate; labor is an `EstimateItem` with `type: 'LABOR'`. This eliminates the duplicate source of truth.

### Estimate & EstimateItem Fields

**Estimate:** `id`, `workOrderId`, `versionNumber` (auto-incremented per work order), `status`, `totalAmount` (sum of non-customerProvided items), `validUntil`, `createdAt`.

**EstimateItem:** `id`, `estimateId`, `name`, `quantity`, `unitPrice`, `type` (`LABOR` | `MATERIAL`), `customerProvided` (boolean, default `false`).

**totalAmount calculation:** `SUM(quantity * unitPrice) WHERE customerProvided = false`.

---

# 9. Cancellation & Rejection Rules

| Current Status | Who Can Act | Action & Result |
|---|---|---|
| Request `PENDING_REVIEW` | Customer or Manager/Admin | Request → `CANCELLED` |
| Work Order `AWAITING_ASSIGNMENT` | Customer or Manager/Admin | Work order & request → `CANCELLED` |
| Assignment `PENDING` (tech not yet responded) | Technician (Reject) | Assignment → `REJECTED`; work order → `AWAITING_ASSIGNMENT`; Manager notified |
| Work Order `ASSIGNED` or `SCHEDULED` | Manager or Admin only | Active assignment → `CANCELLED`; appointment → `CANCELLED`; work order & request → `CANCELLED` with audited reason |
| Work Order `ARRIVED` (before estimate sent) | Manager or Admin only | Work order & request → `CANCELLED` with reason |
| Work Order `AWAITING_ESTIMATE_APPROVAL` | Customer (Reject Estimate) | If no work started: work order → `CLOSED_NO_WORK`. If mid-job revision: see Section 7 |
| Work Order `ESTIMATE_APPROVED` (before work starts) | Customer (via Manager request) or Manager/Admin | Work order → `CLOSED_NO_WORK` or `CANCELLED` |
| Work Order `IN_PROGRESS` | Manager or Admin only | Requires audited reason; work order & request → `CANCELLED`; no invoice generated |
| Work Order `WORK_COMPLETED` | Cannot cancel (invoice exists) | Admin can follow up with customer; no invoice voiding in MVP; work order stays `WORK_COMPLETED` |
| Work Order `COMPLETED` | Non-cancellable | Terminal |

> **Reason storage:** `ServiceRequest` and `WorkOrder` have no `declineReason` / `cancellationReason` columns. Decline, cancel, and rejection reasons are written to `AuditLog.metadata` (e.g. `{"reason":"Customer unreachable"}`). See G-01 in the database model doc.

---

# 10. Technician Application Workflow

### How Does a Customer Become a Technician?

A user cannot select `TECHNICIAN` during registration. The only path is the application workflow.

1. User registers as `CUSTOMER`.
2. Customer selects "Apply as Technician" and submits application.
3. Admin reviews and approves or rejects.
4. If approved: role changes to `TECHNICIAN` and technician profile is created in one database transaction.
5. If rejected: user remains `CUSTOMER`, sees rejection reason and reviewer feedback. **A rejected applicant can reapply** by submitting a new application (one active application at a time).

### TechnicianApplication Entity

**Fields:**
- `id`, `userId`, `status` (`PENDING` | `APPROVED` | `REJECTED`)
- `professionalTitle` (e.g., "AC Technician")
- `yearsOfExperience`
- `bio`
- `skills` (JSON string array, e.g. `["AC Repair","Plumbing"]`)
- `serviceAreas` (JSON string array, e.g. `["Dhaka","Mirpur"]`)
- `workingDays` (JSON), `preferredHours`
- `resume` (Cloudinary URL), `resumePublicId`, `additionalFiles` (JSON array of `{ url, publicId }`)
- `reviewedBy` (Admin user ID, nullable), `reviewNote` (Admin feedback/rejection reason, nullable), `reviewedAt` (timestamp, nullable)
- `createdAt`, `updatedAt`, `isDeleted`, `deletedAt`

> There is **no `Attachment` table and no Skill join tables** — documents are stored on the application (`resume`, `resumePublicId`, `additionalFiles`) and skills are JSON. See Section 14 and Section 23.

### Application Business Rules
1. Only authenticated customers can apply.
2. One active application at a time (no duplicates while `PENDING`).
3. Rejected applicants can reapply (creates a new application record).
4. Only Admin can approve or reject (not Manager).
5. Admin must provide a `reviewNote` when rejecting.
6. Approval atomically: updates `User.role` to `TECHNICIAN`, creates `TechnicianProfile`, updates application status — all in one transaction.
7. After approval, the user's existing token is stale. They must re-login or refresh to get `TECHNICIAN` role in the JWT.
8. Suspended technicians cannot receive new assignments.

---

# 11. Scheduling & Conflict Prevention

### Appointment Lifecycle
- **Created by:** Manager/Admin when scheduling the visit (can happen at assignment time or after technician accepts).
- **Work order moves to `SCHEDULED`** only when: assignment is `ACCEPTED` AND an active appointment exists.
- **Rescheduling:** Updates start/end times, keeps the appointment record (audit log captures the change). Conflict check runs again.

### Appointment Status

```typescript
enum AppointmentStatus {
  SCHEDULED    // Confirmed visit time
  CANCELLED    // Parent assignment rejected/replaced/cancelled, or work order cancelled
}
```

**Fields:** `id`, `assignmentId`, `startTime` (`timestamptz`), `endTime` (`timestamptz`), `status`, `createdAt`, `updatedAt`.

### Conflict Prevention (Transaction-based)
The overlap check runs in the same transaction that creates or updates the appointment:

```sql
SELECT 1
FROM appointments a
JOIN assignments asg ON a."assignmentId" = asg.id
WHERE asg."technicianId" = $technicianId
  AND a.status <> 'CANCELLED'
  AND a."isDeleted" = false
  AND a."startTime" < $newEnd
  AND a."endTime"   > $newStart;
```

- If any row is returned, reject with `409 Conflict` and write nothing.
- Before the `SELECT`, acquire a per-technician transaction lock on the same connection: `pg_advisory_xact_lock(4242, hashtext($technicianId::text))`. This serializes concurrent scheduling for the same technician.
- Columns are camelCase in the database because the Prisma schema has no `@map` on fields — quote them in raw SQL (`"technicianId"`, `"startTime"`). See G-05 in the database model doc.
- No PostgreSQL `EXCLUDE` constraint or raw SQL migration is required; the advisory lock plus the overlap `SELECT` covers the MVP.

---

# 12. Audit Logging, Soft Deletes & Notifications

### 12.1 Soft Delete Scope

**Entities with `isDeleted: Boolean @default(false)` and `deletedAt: DateTime?` (soft-deletable):**
- `User`, `TechnicianProfile`, `TechnicianApplication`, `Service`, `ServiceRequest`, `WorkOrder`, `Assignment`, `Appointment`, `Estimate`, `EstimateItem`, `ServiceReport`, `ServiceReportItem`, `Feedback`, `Notification`.

**Entities with NO delete (immutable financial & audit records):**
- `Invoice`, `InvoiceItem`, `Payment`, `AuditLog`.

> There are no `Address`, `Skill`, `TechnicianSkill`, `ApplicationSkill`, or `Attachment` tables — addresses are flat fields on `User`, skills are JSON, and files live on their parent rows (Section 14). See Section 23 for the authoritative model.

**Queries:** All read/list queries filter `WHERE isDeleted = false`. Unique fields (e.g., `email`) keep standard unique constraints; soft-deleted rows still occupy their unique value.

### 12.2 Audit Logging (`audit_logs`)

**Schema:**
- `id`, `userId` (nullable — system actions have no user), `action` (string), `entityType`, `entityId`, `metadata` (JSON, nullable), `createdAt`.

Only critical events are logged: status changes, payment changes, and role changes. No before/after column snapshots are stored, but reason/context data (e.g. rejection reason, old/new technician) is kept in `metadata Json?`.

**Tracked Actions:**
- Request: `REQUEST_CREATED`, `REQUEST_APPROVED`, `REQUEST_DECLINED`, `REQUEST_CANCELLED`
- Assignment: `TECHNICIAN_ASSIGNED`, `ASSIGNMENT_ACCEPTED`, `ASSIGNMENT_REJECTED`, `ASSIGNMENT_REPLACED`
- Estimate: `ESTIMATE_SENT`, `ESTIMATE_REVISION_REQUESTED`, `ESTIMATE_APPROVED`, `ESTIMATE_REJECTED`
- Work Order: `WORK_ORDER_STARTED`, `WORK_ORDER_COMPLETED`, `WORK_ORDER_CANCELLED`
- Appointment: `APPOINTMENT_SCHEDULED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`
- Invoice & Payment: `INVOICE_GENERATED`, `PAYMENT_STARTED`, `PAYMENT_PAID`, `PAYMENT_FAILED`
- User: `USER_SUSPENDED`, `USER_ACTIVATED`, `USER_ROLE_UPDATED`, `RECORD_DELETED`
- Application: `TECHNICIAN_APPLICATION_SUBMITTED`, `TECHNICIAN_APPROVED`, `TECHNICIAN_REJECTED`

### 12.3 Notification Event Matrix

Notifications are grouped into four core categories.

| Category | Event Trigger | Recipient(s) |
|---|---|---|
| Assignment | Technician Assigned | Customer, assigned Technician |
| Assignment | Assignment Accepted | Customer |
| Assignment | Assignment Rejected (with reason) | Customer, Manager/Admin |
| Assignment | Assignment Replaced (reassignment) | Old Technician |
| Estimate | Estimate Sent | Customer |
| Estimate | Estimate Revision Requested | Technician |
| Estimate | Estimate Approved | Technician |
| Estimate | Estimate Rejected (closing work order) | Technician |
| Payment | Payment Paid | Customer, Technician |
| Payment | Payment Failed | Customer |
| Completion | Work Completed (invoice issued) | Customer |

> **Category limit:** `NotificationCategory` has exactly four values (`ASSIGNMENT`, `ESTIMATE`, `PAYMENT`, `COMPLETION`). Events like "request approved" or "account suspended" have no dedicated bucket today; map them to the closest existing category or add `SYSTEM` in a later schema change (see G-11 in the database model doc).

---

# 13. Role Permission Matrix (RBAC)

| Feature / Operation | Customer | Technician | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| Manage Profile & Single Address | ✓ | ✓ | ✓ | ✓ |
| Browse Services Catalog | ✓ | ✓ | ✓ | ✓ |
| Create Service Request | ✓ | ✓ (own property) | — | — |
| Cancel Request (Before Assignment) | ✓ | ✓ (own) | ✓ | ✓ |
| Cancel Work Order (After Assignment) | — | — | ✓ | ✓ |
| Review, Approve / Decline Request | — | — | ✓ | ✓ |
| Assign / Reassign Technician | — | — | ✓ | ✓ |
| Accept / Reject Assignment | — | ✓ | — | — |
| Schedule / Reschedule Visit | — | — | ✓ | ✓ |
| Mark Arrival | — | ✓ | — | — |
| Create & Send Estimate | — | ✓ | — | — |
| Approve / Reject / Request Revision of Estimate | ✓ | — | — | — |
| Start Work | — | ✓ | — | — |
| Submit Service Report & Work Photos | — | ✓ | — | — |
| Complete Work Order | — | ✓ | — | — |
| Auto-Generate Invoice | System | System | System | System |
| Pay Invoice via bKash & Retry | ✓ | ✓ (own invoices) | — | — |
| Submit Feedback (Post-Payment) | ✓ | ✓ (own requests) | — | — |
| Apply as Technician | ✓ | — | — | — |
| Review Technician Applications | — | — | — | ✓ |
| Manage Services & Pricing Catalog | — | — | — | ✓ |
| Suspend / Activate / Role Update Users | — | — | — | ✓ |
| View Audit Logs | — | — | — | ✓ |
| View Financial & Performance Analytics | — | Own Stats | Operational | System-wide |

**Resource ownership enforcement:** Beyond role checks, all data access validates ownership. A customer sees only their own requests/invoices/payments. A technician sees only their assigned jobs. Manager/Admin sees operational data. Unauthorized access returns 403 or 404 per disclosure policy.

---

# 14. Files & Uploads (No Attachment Table)

Files are stored **on the parent row** (multer for multipart handling, Cloudinary SDK for storage) — there is no polymorphic `Attachment` table.

### Where Files Live

| Entity | Fields | Who Uploads | Purpose |
|---|---|---|---|
| Service Request | `attachments` (JSON array of `{ url, publicId }`) | Customer | Fault photos, problem documentation |
| Service Report | `attachments` (JSON array of `{ url, publicId }`) | Technician | Before/after work photos, evidence |
| Technician Application | `resume`, `resumePublicId`, `additionalFiles` (JSON array of `{ url, publicId }`) | Applicant (Customer) | ID verification, certificates, portfolio |

### File Constraints
- **Allowed types:** JPEG, PNG, PDF.
- **Max size:** 5 MB per file.
- **Storage:** Cloudinary; URL and public ID stored in the database.
- **Upload middleware:** Multer for multipart handling, Cloudinary SDK for storage.
- **Cleanup:** when a soft-deleted row is restored, its stored public IDs remain valid; no orphan-attachment sweep is required for MVP.

---

# 15. Service Catalog

### Service Entity

**Fields:** `id`, `name`, `description`, `requiredSkill` (plain text, e.g. `"AC Repair"`), `basePriceAmount` (`Decimal(12,2)`), `estimatedDurationMinutes` (integer), `isActive` (boolean), `createdAt`, `updatedAt`, `isDeleted`, `deletedAt`.

### Rules
- **Skill requirement:** Each service requires exactly **one** skill in MVP (e.g., "AC Repair" requires skill "AC Repair"). Multi-skill requirements can be added later. There is **no `Skill` table**; `requiredSkill` is free text and is compared against the technician's JSON `skills` using normalized values (trim + lowercase) to avoid `AC Repair` vs `AC repair` mismatches (see G-14 in the database model doc).
- **Base price:** Display-only. Shown to customers when browsing services as a starting reference. The actual cost is determined by the technician's estimate, not the catalog price.
- **Estimated duration:** Used by Manager/Admin to calculate the default appointment end time (`endTime = startTime + estimatedDurationMinutes`). Manager/Admin can override the end time when scheduling.
- **Snapshot rule:** When a service request is created, the service name and base price at that time are snapshotted onto the request record (`serviceNameSnapshot`, `basePriceSnapshot`). Later catalog changes do not affect existing requests.

---

# 16. Address Handling

### Single Saved Address
Each user has **one** address stored as flat fields on the `User` row: `addressLine`, `city`, `district`, `postalCode`. There is **no `Address` table** and no support for multiple saved addresses in MVP.

### Snapshot Rule
When a `ServiceRequest` is created, the selected address is **snapshotted** (copied) into the request record. Editing the profile address afterward does not change the address on historical requests.

**ServiceRequest address fields:** `serviceAddressLine`, `serviceCity`, `serviceDistrict`, `servicePostalCode` (all snapshotted at creation time). There are no latitude/longitude columns in the schema.

---

# 17. Feedback & Technician Rating

### Feedback Rules
- Allowed only when invoice is `PAID`.
- Only the customer who owns the service request can submit feedback.
- **One feedback per work order**, enforced by `UNIQUE(workOrderId)` in the database.
- No feedback for `CLOSED_NO_WORK` or `CANCELLED` work orders.
- **Rating applies to the technician** who performed the work (the technician on the `ACCEPTED` assignment).

### Feedback Entity
**Fields:** `id`, `workOrderId` (unique), `customerId`, `technicianId`, `rating` (integer, 1–5), `comment` (text, optional), `createdAt`, `isDeleted`, `deletedAt`.

### Technician Average Rating Calculation
- Computed dynamically (no cached counters):
  ```sql
  SELECT AVG(rating)::NUMERIC(3,2) as average_rating, COUNT(*) as total_reviews
  FROM feedback
  WHERE "technicianId" = :techId AND "isDeleted" = false;
  ```
- Displayed on technician profile visible to customers (C10) and in technician suggestions for Manager/Admin.
- Aggregated from `Feedback` on read (e.g., technician profile and manager suggestions); no cached columns.

---

# 18. Money Rules

- All monetary fields use `Decimal(12,2)` in BDT. Never use floating-point.
- Invoice items snapshot name, quantity, and unit price at generation time (not a live reference to catalog prices).
- One work order has at most one invoice.
- Calculate invoice totals in one function, round once at the end.
- Customer-provided items appear on the invoice at ৳0.00 with a `Provided by Customer` label.

---

# 19. Complete Role Interaction Workflow

```
[CUSTOMER]
  Register → Browse Services → Create Request (address snapshotted)
                                       │
                                       ▼
                              [MANAGER / ADMIN]
                    Review → Approve (WorkOrder created) → Find Technician
                                       │
                                       ▼
                              [MANAGER / ADMIN]
                    Assign Technician → Schedule Appointment
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                              ▼
                [TECH Accepts]                  [TECH Rejects]
                WO → SCHEDULED                  Assignment → REJECTED
                        │                       WO → AWAITING_ASSIGNMENT
                        ▼                       Manager reassigns
                [TECH Arrives]                         │
                WO → ARRIVED                    (Customer may cancel)
                        │
                        ▼
                [TECH Sends Estimate]
                WO → AWAITING_ESTIMATE_APPROVAL
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
      [Approved]   [Revision]   [Rejected]
      WO → EST_    WO stays     WO → CLOSED_NO_WORK
      APPROVED     AWAITING_    (no invoice)
           │       EST_APPROVAL
           ▼
      [TECH Starts Work]
      WO → IN_PROGRESS
           │
           ├──── (Mid-job revision needed?)
           │     WO → AWAITING_ESTIMATE_APPROVAL
           │     Customer approves → WO → IN_PROGRESS (resumes)
           │     Customer rejects → Tech completes original scope only
           │
           ▼
      [TECH Completes & Submits Report]
      WO → WORK_COMPLETED
      System auto-generates Invoice (from approved estimate)
           │
           ▼
      [CUSTOMER Pays via bKash]
           │
      ┌────┴────┐
      ▼         ▼
   Success    Failed
   Payment →  Invoice stays UNPAID
   PAID       Customer retries
   Invoice →
   PAID
   WO → COMPLETED
   Request → COMPLETED
      │
      ▼
   [CUSTOMER Submits Feedback]
   (1-5 stars, one per work order)
```

---

# 20. Edge Cases

| Situation | System Behavior |
|---|---|
| Customer cancels before assignment | Allowed. Request & work order → `CANCELLED` |
| Customer tries to cancel after `ASSIGNED` | Rejected (403). Must contact Manager/Admin |
| Technician rejects assignment | Assignment → `REJECTED`; appointment → `CANCELLED`; WO → `AWAITING_ASSIGNMENT`; Manager notified |
| No technician available | WO stays `AWAITING_ASSIGNMENT` until Manager finds one |
| Technician assigned to own request | Rejected by backend (self-assignment guard) |
| Customer rejects estimate (no work done) | WO → `CLOSED_NO_WORK`; no invoice |
| Customer rejects mid-job revision | Tech completes original scope; WO → `WORK_COMPLETED` based on last approved estimate |
| Customer-provided parts | Documented in estimate/report; excluded from billable total; shown on invoice at ৳0.00 |
| bKash payment fails | Payment → `FAILED`; invoice stays `UNPAID`; customer retries |
| bKash payment abandoned (30 min) | Backend checks bKash API first, then cancels if no success; customer retries |
| bKash confirms after local timeout | Backend bKash API check catches this; payment marked `PAID` |
| Duplicate bKash callback | Idempotent on `bkashPaymentId`; no duplicate processing |
| Customer never pays | WO stays `WORK_COMPLETED`; invoice stays `UNPAID`; Admin follows up or voids |
| Schedule overlap attempt | Transaction-based overlap check rejects with 409 |
| Deleted customer data | Soft delete; historical WOs, invoices, payments remain intact |
| Customer accesses another's data | 403 or 404 per ownership middleware |
| Technician with pending application opens tech features | 403; role is still `CUSTOMER` |
| Approved tech uses old token | Stale role; must re-login for `TECHNICIAN` JWT |
| Suspended technician gets new assignment | Rejected by backend |
| Feedback before payment | Rejected; requires `Invoice.status = PAID` |
| Duplicate feedback for same WO | Rejected; `UNIQUE(workOrderId)` constraint |
| Estimate expires | Estimate → `EXPIRED`; WO stays `AWAITING_ESTIMATE_APPROVAL`; tech can resend |
| Rejected tech applicant reapplies | Allowed; new application record created |

---

# 21. Open Items for Implementation

- Every status change must pass through a single transition-validation function. Invalid transitions are rejected with 400.
- All read/list APIs must filter `WHERE isDeleted = false` (Prisma client extension or middleware).
- Appointment overlap checks run inside the appointment transaction under `pg_advisory_xact_lock(4242, hashtext(technicianId))`; no raw SQL migrations required.
- **Service-level row locks for rules not enforceable by simple unique constraints:**
  - One active (`PENDING`) technician application per user — `SELECT ... FOR UPDATE` on the `User` row.
  - One `APPROVED` estimate per work order — `SELECT ... FOR UPDATE` on the `WorkOrder` row; approving a new version marks the previous `APPROVED` as `SUPERSEDED`.
  - One successful payment per invoice — lock the `Invoice` row in the success callback; a replayed callback returns success (idempotent).
  - Partial unique indexes for the above are deferred post-MVP (see G-09 in the database model doc).
- **Timestamp consistency:** only `Appointment.startTime` / `endTime` use `@db.Timestamptz(6)`; other instant columns (`preferredDateTime`, `validUntil`, `issuedAt`, `paidAt`, `approvedAt`, `reviewedAt`, `deletedAt`) are plain `DateTime`. Standardize on `@db.Timestamptz(6)` if you need consistent timezone behavior (see G-06).
- **Deferred CHECK constraints:** `Feedback.rating` 1–5, `Appointment.endTime > startTime`, and `Invoice.totalAmount = SUM(items)` are enforced in the service layer for MVP; add DB `CHECK` constraints via raw migration if stricter guarantees are wanted (see G-10).
- bKash payment timeout can be handled by a scheduled job or checked at next customer action (marked `CANCELLED`).
- Technician average rating is always computed live from `Feedback`; no cached counters.
- Feedback submission must be guarded server-side (`Invoice.status = PAID` and no existing feedback for the work order), not only hidden in the UI (see G-20).

---

# 22. MVP Scope & Out-of-Scope Items

### In Scope (Implement)
- User roles (Customer, Technician, Manager, Admin) with RBAC
- Customer registration (email/password or Google OAuth), login, profile, single saved address
- Technician application workflow with approval
- Service catalog with one `requiredSkill` (free text) per service
- Service request creation (with address + service price snapshotting)
- Manager/Admin review, approval, and decline of requests
- Assignment: one technician per work order, accept/reject, reassignment by updating same record
- Appointment scheduling with transaction-based overlap check and per-technician advisory lock
- Technician estimate creation and customer approval/rejection/revision (cumulative versions)
- Service report with work photos and customer-provided parts tracking
- Automatic invoice generation from the last approved estimate
- bKash payment integration with backend verification, idempotency, and timeout handling
- Customer feedback (one per work order, applies to technician)
- In-app notifications (four categories: assignment, estimate, payment, completion)
- Audit logging with optional `metadata` for reasons/context
- Soft deletes (`isDeleted` + `deletedAt`), with financial and audit records kept immutable
- JSON-based skills, files stored on parent rows (no Skill/Attachment tables)

### Out of Scope (Do Not Implement)
- Invoice versioning, replacement invoices, invoice voiding, or complex adjustment workflows
- Refunds, partial payments, or payment plans
- Multiple saved service addresses
- Multiple assignment records or assignment history
- Appointment history tracking (audit log captures reschedules)
- Multi-skill service requirements
- Separate `Address`, `Skill`, `TechnicianSkill`, or `Attachment` tables
- Paid inspection fees
- Advanced analytics beyond basic dashboard stats
- Real-time location tracking
- Push notifications or email delivery (in-app only)
- Technician availability calendar beyond weekly hours
- DB `EXCLUDE` constraints and partial unique indexes (service-level locks cover MVP)

### Overengineering to Avoid
- Do not add features not explicitly required above.
- Prefer simple database relationships and straightforward business logic.
- Do not overengineer the architecture.

---

# 23. Database Model Reference

This document is aligned with `database_model_relations.md` (Prisma-style schema). That file is the authoritative source for table/column names, enums, relations, and the worked end-to-end example. Consult it before writing migrations or raw SQL.

### Model Groups

| Prisma file | Models |
|---|---|
| `schema.prisma` | generator + datasource |
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

### Key Relations (1 : N unless noted)

- `User` → `TechnicianProfile` (1:1), `TechnicianApplication`, `ServiceRequest`, `Notification`, `AuditLog`, `Feedback` (as customer)
- `TechnicianProfile` → `Assignment`, `Feedback` (as technician)
- `Service` → `ServiceRequest`
- `ServiceRequest` → `WorkOrder` (1:1)
- `WorkOrder` → `Assignment` (1:1), `Estimate` (versioned), `ServiceReport` (1:1), `Invoice` (1:1), `Feedback` (1:1)
- `Assignment` → `Appointment` (1:1)
- `Estimate` → `EstimateItem`; `Estimate` → `Invoice` (approved estimate, 1:1 via `approvedEstimateId`)
- `ServiceReport` → `ServiceReportItem`
- `Invoice` → `InvoiceItem`, `Payment` (retries)

### Rules Baked Into the Schema

1. One work order per request, one assignment per work order, one appointment per assignment, one invoice/report/feedback per work order (all unique FKs).
2. Estimate versions are unique per `(workOrderId, versionNumber)`; the invoice references the last `APPROVED` version.
3. `bkashPaymentId` and `bkashTrxId` are unique; `idempotencyKey` is unique per checkout attempt.
4. Soft delete on operational entities; `Invoice`, `InvoiceItem`, `Payment`, `AuditLog` are immutable.
5. Address is flat on `User`; `ServiceRequest` keeps an address snapshot.
6. Skills are JSON on profile/application; no Skill join tables.
7. Files live on parent rows via multer + Cloudinary; no Attachment table.

> **Known gaps (documented, not fixed in MVP):** see Part G of `database_model_relations.md` for the full list (G-01 through G-20), and Part H for invariant verification queries to run after seeding the worked example.
