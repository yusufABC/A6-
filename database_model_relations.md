# FSMS — Database Model & Relations

> Prisma-style schema for the Field Service Management System.
> Style reference: `D:\Level 2\Assignment 6\schema\*.prisma`.
> Design choices applied: **address on User (no Address table)**, **skills as JSON (no Skill join tables)**, **files on the parent model (no Attachment table)**.

---

## schema.prisma

```prisma
generator client {
  provider = "prisma-client"
  output   = "../../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## enums.prisma

```prisma
enum Role {
  CUSTOMER
  TECHNICIAN
  MANAGER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum AuthProvider {
  GOOGLE
  CREDENTIAL
}

enum ServiceRequestStatus {
  PENDING_REVIEW
  APPROVED
  DECLINED
  COMPLETED
  CLOSED_NO_WORK
  CANCELLED
}

enum WorkOrderStatus {
  AWAITING_ASSIGNMENT
  ASSIGNED
  SCHEDULED
  ARRIVED
  AWAITING_ESTIMATE_APPROVAL
  ESTIMATE_APPROVED
  IN_PROGRESS
  WORK_COMPLETED
  COMPLETED
  CLOSED_NO_WORK
  CANCELLED
}

enum AssignmentStatus {
  PENDING
  ACCEPTED
  REJECTED
  CANCELLED
}

enum AppointmentStatus {
  SCHEDULED
  CANCELLED
}

enum EstimateStatus {
  SENT
  REVISION_REQUESTED
  SUPERSEDED
  APPROVED
  REJECTED
  EXPIRED
}

enum EstimateItemType {
  LABOR
  MATERIAL
}

enum InvoiceStatus {
  UNPAID
  PAID
}

enum PaymentStatus {
  UNPAID
  PAID
  FAILED
  CANCELLED
}

enum TechnicianApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum NotificationCategory {
  ASSIGNMENT
  ESTIMATE
  PAYMENT
  COMPLETION
}
```

---

## user.prisma

```prisma
model User {
  id                 String       @id @default(uuid())
  name               String
  email              String
  password           String?
  googleId           String?      @unique
  authProvider       AuthProvider @default(CREDENTIAL)
  emailVerified      Boolean      @default(false)
  role               Role         @default(CUSTOMER)
  status             UserStatus   @default(ACTIVE)
  phone              String?
  imageUrl           String       @default("")
  imagePublicId      String       @default("")

  //address (single — Option A)
  addressLine        String?
  city               String?
  district           String?
  postalCode         String?

  isDeleted          Boolean      @default(false)
  deletedAt          DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt

  //relations
  technician             TechnicianProfile?
  technicianApplications TechnicianApplication[]
  serviceRequests        ServiceRequest[]
  notifications          Notification[]
  auditLogs              AuditLog[]
  customerFeedbacks      Feedback[]              @relation("CustomerFeedback")

  @@unique([email])
  @@index([role], name: "idx_user_role")
  @@map("users")
}
```

---

## technician.prisma

```prisma
model TechnicianProfile {
  id                 String   @id @default(uuid())
  professionalTitle  String
  yearsOfExperience  Int
  bio                String?
  skills             Json?    // ["AC Repair", "Plumbing"]
  serviceAreas       Json?    // ["Dhaka", "Mirpur"]
  workingDays        Json?
  preferredHours     String?
  isDeleted          Boolean  @default(false)
  deletedAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  //relations
  userId String @unique
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  assignments Assignment[]
  feedbacks   Feedback[]        @relation("TechnicianFeedback")

  @@map("technician_profiles")
}

model TechnicianApplication {
  id                String                      @id @default(uuid())
  status            TechnicianApplicationStatus @default(PENDING)
  professionalTitle String
  yearsOfExperience Int
  bio               String?
  skills            Json?                       // ["AC Repair", "Plumbing"]
  serviceAreas      Json?
  workingDays       Json?
  preferredHours    String?
  reviewNote        String?
  reviewedBy        String?
  reviewedAt        DateTime?

  //files (multer + cloudinary, same pattern as Doctor)
  resume          String?
  resumePublicId  String?
  additionalFiles Json? // [{ url, publicId }]

  isDeleted         Boolean                     @default(false)
  deletedAt         DateTime?
  createdAt         DateTime                    @default(now())
  updatedAt         DateTime                    @updatedAt

  //relations
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([userId, status], name: "idx_application_user_status")
  @@map("technician_applications")
}
```

---

## service.prisma

```prisma
model Service {
  id                       String   @id @default(uuid())
  name                     String
  description              String?
  requiredSkill            String   // simple text, e.g. "AC Repair"
  basePriceAmount          Decimal  @db.Decimal(12, 2)
  estimatedDurationMinutes Int
  isActive                 Boolean  @default(true)
  isDeleted                Boolean  @default(false)
  deletedAt                DateTime?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  //relations
  serviceRequests ServiceRequest[]

  @@index([requiredSkill], name: "idx_service_required_skill")
  @@map("services")
}
```

---

## request.prisma

```prisma
model ServiceRequest {
  id                   String               @id @default(uuid())
  status               ServiceRequestStatus @default(PENDING_REVIEW)
  serviceNameSnapshot  String
  basePriceSnapshot    Decimal              @db.Decimal(12, 2)
  description          String
  preferredDateTime    DateTime?

  //address snapshot
  serviceAddressLine   String
  serviceCity          String
  serviceDistrict      String
  servicePostalCode    String?

  //fault photos (multer + cloudinary)
  attachments          Json? // [{ url, publicId }]

  isDeleted            Boolean              @default(false)
  deletedAt            DateTime?
  createdAt            DateTime             @default(now())
  updatedAt            DateTime             @updatedAt

  //relations
  customerId String
  customer   User   @relation(fields: [customerId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  serviceId String
  service   Service @relation(fields: [serviceId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  workOrder WorkOrder?

  @@index([customerId, status], name: "idx_request_customer_status")
  @@map("service_requests")
}
```

---

## workorder.prisma

```prisma
model WorkOrder {
  id        String          @id @default(uuid())
  status    WorkOrderStatus @default(AWAITING_ASSIGNMENT)
  isDeleted Boolean         @default(false)
  deletedAt DateTime?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  //relations
  serviceRequestId String         @unique
  serviceRequest   ServiceRequest @relation(fields: [serviceRequestId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  assignment    Assignment?
  estimates     Estimate[]
  serviceReport ServiceReport?
  invoice       Invoice?
  feedback      Feedback?

  @@index([status], name: "idx_workorder_status")
  @@map("work_orders")
}

model Assignment {
  id              String           @id @default(uuid())
  status          AssignmentStatus @default(PENDING)
  rejectionReason String?
  isDeleted       Boolean          @default(false)
  deletedAt       DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  //relations
  workOrderId String    @unique
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  technicianId String
  technician   TechnicianProfile @relation(fields: [technicianId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  appointment Appointment?

  @@index([technicianId, status], name: "idx_assignment_technician_status")
  @@map("assignments")
}

model Appointment {
  id        String            @id @default(uuid())
  startTime DateTime          @db.Timestamptz(6)
  endTime   DateTime          @db.Timestamptz(6)
  status    AppointmentStatus @default(SCHEDULED)
  isDeleted Boolean           @default(false)
  deletedAt DateTime?
  createdAt DateTime          @default(now())
  updatedAt DateTime          @updatedAt

  //relations
  assignmentId String     @unique
  assignment   Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([startTime, endTime], name: "idx_appointment_time")
  @@map("appointments")
}
```

---

## estimate.prisma

```prisma
model Estimate {
  id            String         @id @default(uuid())
  versionNumber Int
  status        EstimateStatus @default(SENT)
  totalAmount   Decimal        @db.Decimal(12, 2)
  validUntil    DateTime?
  isDeleted     Boolean        @default(false)
  deletedAt     DateTime?
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  //relations
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  items   EstimateItem[]
  invoice Invoice?

  @@unique([workOrderId, versionNumber], name: "unique_estimate_version")
  @@index([workOrderId, status], name: "idx_estimate_workorder_status")
  @@map("estimates")
}

model EstimateItem {
  id               String           @id @default(uuid())
  name             String
  quantity         Decimal          @db.Decimal(12, 2)
  unitPrice        Decimal          @db.Decimal(12, 2)
  type             EstimateItemType
  customerProvided Boolean          @default(false)
  isDeleted        Boolean          @default(false)
  deletedAt        DateTime?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  //relations
  estimateId String
  estimate   Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([estimateId], name: "idx_estimateitem_estimate")
  @@map("estimate_items")
}
```

---

## report.prisma

```prisma
model ServiceReport {
  id            String   @id @default(uuid())
  diagnosis     String
  workPerformed String
  laborHours    Decimal  @db.Decimal(6, 2)
  notes         String?

  //before/after photos (multer + cloudinary)
  attachments   Json? // [{ url, publicId }]

  isDeleted     Boolean  @default(false)
  deletedAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  //relations
  workOrderId String    @unique
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  items ServiceReportItem[]

  @@map("service_reports")
}

model ServiceReportItem {
  id               String   @id @default(uuid())
  name             String
  quantity         Decimal  @db.Decimal(12, 2)
  customerProvided Boolean  @default(false)
  isDeleted        Boolean  @default(false)
  deletedAt        DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  //relations
  serviceReportId String
  serviceReport   ServiceReport @relation(fields: [serviceReportId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([serviceReportId], name: "idx_reportitem_report")
  @@map("service_report_items")
}
```

---

## invoice.prisma

```prisma
model Invoice {
  id          String        @id @default(uuid())
  status      InvoiceStatus @default(UNPAID)
  totalAmount Decimal       @db.Decimal(12, 2)
  issuedAt    DateTime      @default(now())
  paidAt      DateTime?

  //lineage: which approved estimate this invoice was generated from
  approvedEstimateId String?  @unique
  approvedAt         DateTime?

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  //relations
  workOrderId String    @unique
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  approvedEstimate Estimate? @relation(fields: [approvedEstimateId], references: [id], onDelete: SetNull, onUpdate: Cascade)

  items    InvoiceItem[]
  payments Payment[]

  @@map("invoices")
}

model InvoiceItem {
  id               String   @id @default(uuid())
  name             String
  quantity         Decimal  @db.Decimal(12, 2)
  unitPrice        Decimal  @db.Decimal(12, 2)
  lineTotal        Decimal  @db.Decimal(12, 2)
  customerProvided Boolean  @default(false)
  createdAt        DateTime @default(now())

  //relations
  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([invoiceId], name: "idx_invoiceitem_invoice")
  @@map("invoice_items")
}

model Payment {
  id               String        @id @default(uuid())
  status           PaymentStatus @default(UNPAID)
  amount           Decimal       @db.Decimal(12, 2)
  currency         String        @default("BDT")
  paymentGateway   String        @default("bkash")
  bkashPaymentId   String?       @unique
  bkashTrxId       String?       @unique
  idempotencyKey   String        @unique // per checkout attempt
  payerReference   String?
  paidAt           DateTime?
  gatewayResponse  Json?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  //relations
  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([invoiceId, status], name: "idx_payment_invoice_status")
  @@map("payments")
}
```

---

## feedback.prisma

```prisma
model Feedback {
  id        String   @id @default(uuid())
  rating    Int
  comment   String?
  isDeleted Boolean  @default(false)
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  //relations
  workOrderId String    @unique
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  customerId String
  customer   User   @relation("CustomerFeedback", fields: [customerId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  technicianId String
  technician   TechnicianProfile @relation("TechnicianFeedback", fields: [technicianId], references: [id], onDelete: Restrict, onUpdate: Cascade)

  @@index([technicianId], name: "idx_feedback_technician")
  @@map("feedback")
}
```

---

## notification.prisma

```prisma
model Notification {
  id        String               @id @default(uuid())
  category  NotificationCategory
  title     String?
  message   String
  isRead    Boolean              @default(false)
  isDeleted Boolean              @default(false)
  deletedAt DateTime?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  //relations
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([userId, isRead], name: "idx_notification_user_read")
  @@map("notifications")
}
```

---

## audit.prisma

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  action     String
  entityType String
  entityId   String
  metadata   Json? // e.g. { reason, oldTechnicianId, newTechnicianId }
  createdAt  DateTime @default(now())

  //relations
  userId String?
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull, onUpdate: Cascade)

  @@index([entityType, entityId], name: "idx_audit_entity")
  @@map("audit_logs")
}
```

---

## Removed Models (vs the first draft)

| Removed | Why | Where it went |
|---|---|---|
| `Address` | you want a single user address | flat fields on `User` + snapshot on `ServiceRequest` |
| `Skill` | skills are simple labels | `skills Json?` on `TechnicianProfile` and `TechnicianApplication` |
| `TechnicianSkill` | join table not needed | `skills Json?` on `TechnicianProfile` |
| `ApplicationSkill` | join table not needed | `skills Json?` on `TechnicianApplication` |
| `Attachment` | files stored on the parent, like `Doctor` | `resume`/`resumePublicId`/`additionalFiles` on `TechnicianApplication`; `attachments Json?` on `ServiceRequest` and `ServiceReport` |
| `TechnicianTimeOff` | redundant for MVP — a technician can reject an assignment, and `workingDays` covers planned availability | none |

---

## MVP Constraints (intentional)

- **No hard deletes.** Entities are soft-deleted; unique keys on deleted rows are not reused (restore-only).
- **Overlap:** inside the scheduling transaction (create, reschedule, reassign), acquire `pg_advisory_xact_lock(4242, hashtext($technicianId::text))` on the same connection, then run the `SELECT` overlap check excluding `status = 'CANCELLED'` and soft-deleted appointments, with `endTime > startTime`. No DB `EXCLUDE` constraint.
- **One approved estimate per work order** is enforced in the approval service under `SELECT ... FOR UPDATE` on the `WorkOrder` row (approving a new version marks the previous `APPROVED` as `SUPERSEDED`); `Invoice.approvedEstimateId` is a unique FK to `Estimate`.
- **One active technician application** per user is enforced in the application service under `SELECT ... FOR UPDATE` on the `User` row.
- **One successful payment per invoice:** the success callback locks the `Invoice` row and rejects if already `PAID`; a replayed callback returns success (idempotent), not an error. `idempotencyKey` is generated before calling bKash and reused on retries.
- **Audit log** stores action/entity plus optional `metadata Json?` (e.g., rejection reason, old/new technician). The rejection entry is written before overwriting `Assignment.rejectionReason`.
- **Ratings** are aggregated from `Feedback` on read; there are no cached counters to drift.
- **Strict DB uniqueness** for "one pending application" / "one approved estimate" is deferred to raw partial indexes post-MVP; the row locks above cover the MVP.

---

## Relation Cheat Sheet

| Relation | Type | Where |
|---|---|---|
| User → TechnicianProfile | 1 : 1 | `TechnicianProfile.userId` unique |
| User → TechnicianApplication | 1 : N | `TechnicianApplication.userId` |
| User → ServiceRequest | 1 : N | `ServiceRequest.customerId` |
| User → Notification | 1 : N | `Notification.userId` |
| User → AuditLog | 1 : N | `AuditLog.userId` (nullable) |
| User → Feedback | 1 : N | `Feedback.customerId` |
| TechnicianProfile → Assignment | 1 : N | `Assignment.technicianId` |
| TechnicianProfile → Feedback | 1 : N | `Feedback.technicianId` |
| Service → ServiceRequest | 1 : N | `ServiceRequest.serviceId` |
| ServiceRequest → WorkOrder | 1 : 1 | `WorkOrder.serviceRequestId` unique |
| WorkOrder → Assignment | 1 : 1 | `Assignment.workOrderId` unique |
| Assignment → Appointment | 1 : 1 | `Appointment.assignmentId` unique |
| WorkOrder → Estimate | 1 : N | versioned estimates |
| Estimate → EstimateItem | 1 : N | `EstimateItem.estimateId` |
| WorkOrder → ServiceReport | 1 : 1 | `ServiceReport.workOrderId` unique |
| ServiceReport → ServiceReportItem | 1 : N | `ServiceReportItem.serviceReportId` |
| WorkOrder → Invoice | 1 : 1 | `Invoice.workOrderId` unique |
| Invoice → InvoiceItem | 1 : N | `InvoiceItem.invoiceId` |
| Invoice → Payment | 1 : N | retries (`Payment.invoiceId`) |
| WorkOrder → Feedback | 1 : 1 | `Feedback.workOrderId` unique |

---

## Rules Baked Into The Schema

1. **One work order per request:** `WorkOrder.serviceRequestId @unique`.
2. **One assignment per work order:** `Assignment.workOrderId @unique` (reassign = update same row).
3. **One appointment per assignment:** `Appointment.assignmentId @unique` (reschedule = update times).
4. **One invoice per work order:** `Invoice.workOrderId @unique`.
5. **One report per work order:** `ServiceReport.workOrderId @unique`.
6. **One feedback per work order:** `Feedback.workOrderId @unique`.
7. **Estimate versions:** `@@unique([workOrderId, versionNumber])`; invoice uses latest `APPROVED`.
8. **bKash idempotency:** `bkashPaymentId @unique`, `bkashTrxId @unique`.
9. **Soft delete:** `isDeleted` + `deletedAt` everywhere except `Invoice`, `InvoiceItem`, `Payment`, `AuditLog`.
10. **Address:** flat fields on `User`; request keeps the service address snapshot.
11. **Skills:** JSON on `TechnicianProfile` / `TechnicianApplication`; no Skill table.
12. **Files:** stored on the parent model (`resume`, `resumePublicId`, `additionalFiles`, `attachments`) via multer + Cloudinary.

---

# Appendix — Real Worked Example (Customer, Technician, Admin)

> Read the schema above first, then follow this **single story** end to end. Every row uses short
> readable IDs (`U-CUST-001`) instead of real UUIDs, and `2026-11-06 09:00` timestamps. You can paste
> these values into a seed script to reproduce the flow locally and compare your actual DB rows.
>
> Timezone: all sample times are `Asia/Dhaka (+06)`. See **Part G** for why some DateTime columns
> are missing `@db.Timestamptz` and how that can bite you.
>
> The example follows the schema **as written**. Where the other docs disagree with this schema,
> **Part G** lists the exact mismatch so you can decide which side to fix.

---

## A. Cast, catalog, and the one-line story

| Actor | User row | Role | Profile |
|---|---|---|---|
| Rahim Ahmed | `U-CUST-001` | `CUSTOMER` | — |
| Karim Hasan | `U-TECH-001` | `TECHNICIAN` | `TP-001` |
| Nusrat Jahan | `U-ADM-001` | `ADMIN` | — |
| Jamal Uddin (applicant) | `U-APP-001` | `CUSTOMER` → later `TECHNICIAN` | `TP-002` after approval |
| Service | `SVC-001` "Split AC Servicing" | required skill `AC Repair` | base price `1500.00`, 90 min |

**One-line story**

Rahim registers → creates a request for a faulty split AC → Admin Nusrat approves it, creates
`WO-001`, assigns Karim (`TP-001`) and schedules the visit → Karim accepts, arrives, sends estimate
v1 → Rahim asks for a revision, Karim sends v2 → Rahim approves → work starts → mid-job Karim finds a
burned relay, sends v3 → Rahim approves → Karim submits the report → invoice `4800.00` is generated →
Rahim pays via bKash → work order and request become `COMPLETED` → Rahim leaves a 5-star feedback.

---

## B. Status trail (single glance)

| # | Actor | Action | Entity status after action |
|---|---|---|---|
| 1 | Customer | Register / login | `User.status = ACTIVE` |
| 2 | Customer | Create request `SR-001` | `ServiceRequest = PENDING_REVIEW` |
| 3 | Admin | Approve request, create `WO-001` | `ServiceRequest = APPROVED`, `WorkOrder = AWAITING_ASSIGNMENT` |
| 4 | Admin | Assign `TP-001` + schedule `AP-001` | `WorkOrder = ASSIGNED`, `Assignment = PENDING`, `Appointment = SCHEDULED` |
| 5 | Technician | Accept | `Assignment = ACCEPTED`, `WorkOrder = SCHEDULED` |
| 6 | Technician | Mark arrival | `WorkOrder = ARRIVED` |
| 7 | Technician | Send estimate v1 | `WorkOrder = AWAITING_ESTIMATE_APPROVAL`, `Estimate v1 = SENT` |
| 8 | Customer | Request revision | `Estimate v1 = REVISION_REQUESTED` |
| 9 | Technician | Send estimate v2 | `Estimate v1 = SUPERSEDED`, `Estimate v2 = SENT` |
| 10 | Customer | Approve v2 | `Estimate v2 = APPROVED`, `WorkOrder = ESTIMATE_APPROVED` |
| 11 | Technician | Start work | `WorkOrder = IN_PROGRESS` |
| 12 | Technician | Mid-job extra work, send v3 | `WorkOrder = AWAITING_ESTIMATE_APPROVAL`, `Estimate v3 = SENT` |
| 13 | Customer | Approve v3 | `Estimate v2 = SUPERSEDED`, `Estimate v3 = APPROVED`, `WorkOrder = IN_PROGRESS` |
| 14 | Technician | Submit report + complete | `WorkOrder = WORK_COMPLETED`, invoice `INV-001 = UNPAID` |
| 15 | Customer | bKash checkout | `Payment = UNPAID` (checkout created) |
| 16 | System | Verify callback | `Payment = PAID`, `Invoice = PAID`, `WorkOrder = COMPLETED`, `ServiceRequest = COMPLETED` |
| 17 | Customer | Submit feedback | `Feedback` row created (one per work order) |

---

## C. Customer full workflow (with real rows)

### C1. Register / login

`users` row inserted:

| id | name | email | role | status | phone | addressLine | city | district | postalCode |
|---|---|---|---|---|---|---|---|---|---|
| `U-CUST-001` | Rahim Ahmed | `rahim@example.com` | `CUSTOMER` | `ACTIVE` | `+8801711000001` | `12/A Dhanmondi 27` | `Dhaka` | `Dhaka` | `1209` |

> Address lives **flat on `User`** (single address design). There is no `Address` table.

### C2. Browse the catalog

Read-only query; no writes:

```sql
SELECT id, name, "requiredSkill", "basePriceAmount", "estimatedDurationMinutes"
FROM services
WHERE "isActive" = true AND "isDeleted" = false;
```

| id | name | requiredSkill | basePriceAmount | estimatedDurationMinutes |
|---|---|---|---|---|
| `SVC-001` | Split AC Servicing | `AC Repair` | `1500.00` | `90` |

### C3. Create request `SR-001`

Insert into `service_requests` (note the **snapshot** columns and `attachments` JSON):

| id | status | serviceNameSnapshot | basePriceSnapshot | description | preferredDateTime | serviceAddressLine | serviceCity | serviceDistrict | servicePostalCode |
|---|---|---|---|---|---|---|---|---|---|
| `SR-001` | `PENDING_REVIEW` | Split AC Servicing | `1500.00` | Living room split AC not cooling and making noise | `2026-11-08 10:00+06` | `12/A Dhanmondi 27` | `Dhaka` | `Dhaka` | `1209` |

| attachments (JSON) | customerId | serviceId |
|---|---|---|
| `[{"url":"https://res.cloudinary.com/demo/fsms/requests/sr-001-front.jpg","publicId":"fsms/requests/sr-001-front"}]` | `U-CUST-001` | `SVC-001` |

> `serviceNameSnapshot` / `basePriceSnapshot` / `serviceAddressLine` are frozen copies. Later catalog
> price changes or profile address edits **must not** change this row. That is the #1 snapshot bug to test.

### C4. Track the request

```sql
SELECT sr.id, sr.status, wo.id AS "workOrderId", wo.status AS "workOrderStatus"
FROM service_requests sr
LEFT JOIN work_orders wo ON wo."serviceRequestId" = sr.id
WHERE sr."customerId" = $1 AND sr."isDeleted" = false;
```

After step 4 the customer sees `SR-001 = APPROVED`, `WO-001 = ASSIGNED`.

### C5. View assigned technician (only after assignment)

```sql
SELECT u.name, u.phone, u."imageUrl", tp."professionalTitle", tp."yearsOfExperience"
FROM assignments a
JOIN work_orders wo ON wo.id = a."workOrderId"
JOIN technician_profiles tp ON tp.id = a."technicianId"
JOIN users u ON u.id = tp."userId"
WHERE wo.id = 'WO-001' AND a."isDeleted" = false;
```

| name | phone | professionalTitle | yearsOfExperience |
|---|---|---|---|
| Karim Hasan | `+8801711000002` | Senior AC Technician | `7` |

Average rating is calculated, never stored:

```sql
SELECT ROUND(AVG(rating)::numeric, 2) AS avg_rating, COUNT(*) AS total_reviews
FROM feedback
WHERE "technicianId" = 'TP-001' AND "isDeleted" = false;
```

### C6. Review estimate (revision, then approve)

**Estimate v1 (`EST-001`) after technician sends it:**

| id | workOrderId | versionNumber | status | totalAmount | validUntil |
|---|---|---|---|---|---|
| `EST-001` | `WO-001` | `1` | `SENT` | `3200.00` | `2026-11-10 23:59+06` |

`estimate_items` for `EST-001`:

| id | name | quantity | unitPrice | type | customerProvided |
|---|---|---|---|---|---|
| `EI-001` | AC servicing labor | `1.00` | `2000.00` | `LABOR` | `false` |
| `EI-002` | R410A refrigerant (kg) | `1.00` | `800.00` | `MATERIAL` | `false` |
| `EI-003` | Capacitor | `1.00` | `400.00` | `MATERIAL` | `false` |

> `totalAmount = 1*2000 + 1*800 + 1*400 = 3200.00` (all `customerProvided = false`).

**Customer requests a revision** (capacitor is not needed; gas price adjusted):

- `EST-001.status` → `REVISION_REQUESTED`
- No work order status change: stays `AWAITING_ESTIMATE_APPROVAL`.

**Technician sends v2 (`EST-002`):**

| id | workOrderId | versionNumber | status | totalAmount |
|---|---|---|---|---|
| `EST-001` | `WO-001` | `1` | `SUPERSEDED` | `3200.00` |
| `EST-002` | `WO-001` | `2` | `SENT` | `2800.00` |

| id | estimateId | name | quantity | unitPrice | type | customerProvided |
|---|---|---|---|---|---|---|
| `EI-004` | `EST-002` | AC servicing + gas refill labor | `1.00` | `2000.00` | `LABOR` | `false` |
| `EI-005` | `EST-002` | R410A refrigerant (kg) | `1.00` | `800.00` | `MATERIAL` | `false` |

**Customer approves v2:**

- `EST-002.status` → `APPROVED`
- `WorkOrder.status` → `ESTIMATE_APPROVED`
- Audit: `ESTIMATE_APPROVED` with `metadata = {"estimateId":"EST-002","version":2,"totalAmount":"2800.00"}`

### C7. Pay the invoice via bKash (after work is completed)

Invoice (`INV-001`) is generated from the **last approved estimate**:

| id | workOrderId | approvedEstimateId | status | totalAmount | issuedAt |
|---|---|---|---|---|---|
| `INV-001` | `WO-001` | `EST-003` | `UNPAID` | `4800.00` | `2026-11-08 13:00+06` |

`invoice_items` (snapshotted from the approved estimate at generation time):

| id | name | quantity | unitPrice | lineTotal | customerProvided |
|---|---|---|---|---|---|
| `II-001` | AC servicing + gas refill labor | `1.00` | `2000.00` | `2000.00` | `false` |
| `II-002` | R410A refrigerant (kg) | `1.00` | `800.00` | `800.00` | `false` |
| `II-003` | Compressor relay | `1.00` | `1200.00` | `1200.00` | `false` |
| `II-004` | Relay replacement labor | `1.00` | `800.00` | `800.00` | `false` |

Payment lifecycle in `payments`:

| attempt | id | status | amount | idempotencyKey | bkashPaymentId | bkashTrxId | paidAt |
|---|---|---|---|---|---|---|---|
| checkout created | `PAY-001` | `UNPAID` | `4800.00` | `7f1c...pay-001-1` | `null` | `null` | `null` |
| user cancelled checkout | `PAY-001` | `CANCELLED` | `4800.00` | `7f1c...pay-001-1` | `TR-OLD-1` | `null` | `null` |
| retry (new attempt) | `PAY-002` | `UNPAID` | `4800.00` | `9a2e...pay-002-1` | `TR-REAL-2` | `BKX-9911` | `null` |
| callback verified | `PAY-002` | `PAID` | `4800.00` | `9a2e...pay-002-1` | `TR-REAL-2` | `BKX-9911` | `2026-11-08 13:07+06` |

**The success callback must run in ONE transaction:**

```text
LOCK Invoice INV-001;  if status = PAID -> return success (idempotent replay), do nothing
Payment PAY-002.status       = PAID
Invoice INV-001.status       = PAID, paidAt = now
WorkOrder WO-001.status      = COMPLETED
ServiceRequest SR-001.status = COMPLETED
AuditLog: PAYMENT_PAID (entityType=Payment, entityId=PAY-002)
```

> If any one of those writes is missing, you get the classic "payment is PAID but work order is still
> `WORK_COMPLETED`" bug. Test by forcing an error after the payment update and checking the rollback.

### C8. View report and submit feedback

`service_reports` + `service_report_items` (created at completion):

| id | workOrderId | diagnosis | workPerformed | laborHours | attachments |
|---|---|---|---|---|---|
| `RPT-001` | `WO-001` | Refrigerant low; compressor relay burned | Gas refill, relay replacement, full servicing | `2.50` | `[{"url":".../after.jpg","publicId":"fsms/reports/sr-001-after"}]` |

| id | serviceReportId | name | quantity | customerProvided |
|---|---|---|---|---|
| `SRI-001` | `RPT-001` | R410A refrigerant (kg) | `1.00` | `false` |
| `SRI-002` | `RPT-001` | Compressor relay | `1.00` | `false` |

`feedback` (allowed only when `Invoice.status = PAID`; `workOrderId` unique):

| id | workOrderId | customerId | technicianId | rating | comment |
|---|---|---|---|---|---|
| `FB-001` | `WO-001` | `U-CUST-001` | `TP-001` | `5` | Fast and clean work. |

### C9. Customer cancellation variant (do not mix with the happy path)

| Situation | Allowed? | Writes |
|---|---|---|
| `SR-001 = PENDING_REVIEW` | Yes | `ServiceRequest.status = CANCELLED` |
| `WO-001 = AWAITING_ASSIGNMENT` | Yes | `WorkOrder = CANCELLED`, `ServiceRequest = CANCELLED` |
| `WO-001 = ASSIGNED` or later | No (403) | Must contact Manager/Admin |

---

## D. Technician full workflow (with real rows)

### D1. Customer applies to become a technician

`U-APP-001` already exists as a `CUSTOMER`. Insert `technician_applications`:

| id | userId | status | professionalTitle | yearsOfExperience | skills (JSON) | serviceAreas (JSON) |
|---|---|---|---|---|---|---|
| `TA-001` | `U-APP-001` | `PENDING` | Refrigeration Technician | `4` | `["Refrigeration","AC Repair"]` | `["Dhaka","Gazipur"]` |

| workingDays (JSON) | preferredHours | resume | resumePublicId | additionalFiles (JSON) | reviewedBy | reviewNote |
|---|---|---|---|---|---|---|
| `{"sun":true,"mon":true,"tue":true,"wed":true,"thu":true,"fri":false,"sat":true}` | `09:00-18:00` | `https://res.cloudinary.com/.../ta-001-resume.pdf` | `fsms/applications/ta-001-resume` | `[{"url":".../cert.jpg","publicId":"fsms/applications/ta-001-cert"}]` | `null` | `null` |

> Rule: one **active** (`PENDING`) application per user, enforced in the service under
> `SELECT ... FOR UPDATE` on the `User` row. Rejected applicants may reapply with a **new** row.

### D2. Admin approves (atomic side effects)

Single transaction:

```text
TechnicianApplication TA-001.status = APPROVED,
  reviewedBy = 'U-ADM-001', reviewNote = 'Documents verified.', reviewedAt = now
User U-APP-001.role = TECHNICIAN
INSERT TechnicianProfile TP-002 {
  userId: U-APP-001,
  professionalTitle: 'Refrigeration Technician',
  yearsOfExperience: 4,
  skills: ["Refrigeration","AC Repair"],       // copied from application JSON
  serviceAreas: ["Dhaka","Gazipur"],
  workingDays: {...}, preferredHours: '09:00-18:00'
}
AuditLog: TECHNICIAN_APPROVED, USER_ROLE_UPDATED
```

| id | userId | professionalTitle | yearsOfExperience | skills | serviceAreas |
|---|---|---|---|---|---|
| `TP-002` | `U-APP-001` | Refrigeration Technician | `4` | `["Refrigeration","AC Repair"]` | `["Dhaka","Gazipur"]` |

> Rejection variant: `TA-000.status = REJECTED`, `reviewNote = 'Certificate unreadable.'`, user stays
> `CUSTOMER`. The old JWT still says `CUSTOMER`; after approval the applicant must re-login to get a
> `TECHNICIAN` token.

### D3. Technician accepts assignment `AS-001`

Before accept:

| id | workOrderId | technicianId | status | rejectionReason |
|---|---|---|---|---|
| `AS-001` | `WO-001` | `TP-001` | `PENDING` | `null` |

Technician accepts:

- `AS-001.status` → `ACCEPTED`
- `WorkOrder.status` → `SCHEDULED` (only because `AP-001` exists and is `SCHEDULED`)
- Audit: `ASSIGNMENT_ACCEPTED`

### D4. Technician marks arrival

- `WorkOrder.status` → `ARRIVED`
- No change to `Assignment` or `Appointment`.

### D5. Technician sends estimates (v1 → v2 → mid-job v3)

v1 and v2 rows are already shown in **C6**. The mid-job revision is the important one:

After work started (`WO-001 = IN_PROGRESS`), the technician discovers a burned relay and sends a
**cumulative v3** (`EST-003`), then:

- `WorkOrder.status` → `AWAITING_ESTIMATE_APPROVAL`
- `EST-003.status` = `SENT`
- Customer approves → `EST-002.status = SUPERSEDED`, `EST-003.status = APPROVED`,
  `WorkOrder.status = IN_PROGRESS`

| id | workOrderId | versionNumber | status | totalAmount |
|---|---|---|---|---|
| `EST-001` | `WO-001` | `1` | `SUPERSEDED` | `3200.00` |
| `EST-002` | `WO-001` | `2` | `SUPERSEDED` | `2800.00` |
| `EST-003` | `WO-001` | `3` | `APPROVED` | `4800.00` |

| id | estimateId | name | quantity | unitPrice | type | customerProvided |
|---|---|---|---|---|---|---|
| `EI-006` | `EST-003` | AC servicing + gas refill labor | `1.00` | `2000.00` | `LABOR` | `false` |
| `EI-007` | `EST-003` | R410A refrigerant (kg) | `1.00` | `800.00` | `MATERIAL` | `false` |
| `EI-008` | `EST-003` | Compressor relay | `1.00` | `1200.00` | `MATERIAL` | `false` |
| `EI-009` | `EST-003` | Relay replacement labor | `1.00` | `800.00` | `LABOR` | `false` |

> **Ambiguity to settle in code:** this example treats each new version as the **full cumulative
> scope**. If you instead store only the *delta* ("additional work only"), then a v3 that contains
> only the relay would make the invoice `2000.00`, silently dropping the original `2800.00`.
> Pick cumulative and document it, or make the invoice builder merge versions. **Part G, item G-07.**

### D6. Technician completes and submits the report

Single transaction:

```text
INSERT ServiceReport RPT-001 + ServiceReportItems SRI-001, SRI-002
WorkOrder WO-001.status = WORK_COMPLETED
Generate Invoice INV-001 from EST-003 (snapshot items, total = 4800.00)
AuditLog: WORK_ORDER_COMPLETED, INVOICE_GENERATED
```

### D7. Technician rejects an assignment (variant)

| Step | Writes |
|---|---|
| Technician rejects with reason | `AS-001.status = REJECTED`, `AS-001.rejectionReason = 'Outside my service area'`, `AP-001.status = CANCELLED`, `WO-001.status = AWAITING_ASSIGNMENT` |
| Audit | `ASSIGNMENT_REJECTED` with `metadata = {"reason":"Outside my service area"}` |
| Manager reassigns | Update the **same** `AS-001` row: `technicianId = 'TP-009'`, `status = PENDING`, `rejectionReason = null`; create a new `AP-002`; `WO-001.status = ASSIGNED` |

> There is exactly **one** assignment row per work order (`Assignment.workOrderId @unique`). Reassignment
> is an `UPDATE`, never an `INSERT`. Creating a second row will violate the unique constraint.

---

## E. Admin full workflow (with real rows)

### E1. Service catalog management

| Operation | Writes |
|---|---|
| Create | `INSERT services (SVC-002, 'AC Installation', 'AC Repair', 2500.00, 120, isActive=true)` |
| Update price | `UPDATE services SET "basePriceAmount" = 2700.00 WHERE id = 'SVC-002'` |
| Soft delete | `UPDATE services SET "isDeleted" = true, "deletedAt" = now() WHERE id = 'SVC-009'` |

> Existing `service_requests` keep their snapped `serviceNameSnapshot` / `basePriceSnapshot`; catalog
> edits never rewrite history.

### E2. Review request `SR-001` (approve)

Single transaction:

```text
INSERT WorkOrder WO-001 { serviceRequestId: 'SR-001', status: 'AWAITING_ASSIGNMENT' }
UPDATE ServiceRequest SR-001 SET status = 'APPROVED'
AuditLog: REQUEST_APPROVED (entityType=ServiceRequest, entityId=SR-001)
Notification: Assignment? No — customer notification "Request approved" (category COMPLETION or a SYSTEM bucket; see G-11)
```

Decline variant:

```text
UPDATE ServiceRequest SR-001 SET status = 'DECLINED'
AuditLog: REQUEST_DECLINED metadata = {"reason":"Duplicate request"}
```

> The schema has **no** `declineReason` column on `ServiceRequest`. The reason only survives in
> `AuditLog.metadata`. See **G-01**.

### E3. Assign technician + schedule appointment (overlap-safe)

Assignment insert (shown in C-/D3). Appointment insert:

| id | assignmentId | startTime | endTime | status |
|---|---|---|---|---|
| `AP-001` | `AS-001` | `2026-11-08 10:00+06` | `2026-11-08 11:30+06` | `SCHEDULED` |

**Overlap check inside the same transaction** (columns are camelCase because the Prisma schema has no
`@map` — see **G-05**):

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

Example conflict: Karim already has `AP-009` from `10:00-11:30` on `2026-11-08`. Trying to schedule
`10:30-12:00` returns **409 Conflict** and writes nothing.

> Advanced option from the doc: `pg_advisory_xact_lock(4242, hashtext($technicianId::text))` before the
> SELECT to serialize concurrent scheduling for the same technician.

### E4. Reassign a rejected assignment

See **D7**. The audit row that matters:

| action | entityType | entityId | metadata |
|---|---|---|---|
| `ASSIGNMENT_REPLACED` | `Assignment` | `AS-001` | `{"oldTechnicianId":"TP-001","newTechnicianId":"TP-009","reason":"Technician rejected"}` |

### E5. Cancel a work order with an audited reason

```text
UPDATE Assignment SET status = 'CANCELLED' WHERE "workOrderId" = 'WO-001'
UPDATE Appointment SET status = 'CANCELLED' WHERE "assignmentId" = 'AS-001'
UPDATE WorkOrder SET status = 'CANCELLED' WHERE id = 'WO-001'
UPDATE ServiceRequest SET status = 'CANCELLED' WHERE id = 'SR-001'
AuditLog: WORK_ORDER_CANCELLED metadata = {"reason":"Customer unreachable"}
```

> All four writes belong to one transaction, otherwise the request/work order/assignment/appointment
> statuses drift apart.

### E6. User management

| Action | Writes |
|---|---|
| Suspend | `User.status = SUSPENDED`; audit `USER_SUSPENDED` |
| Reactivate | `User.status = ACTIVE`; audit `USER_ACTIVATED` |
| Change role | `User.role = ...`; audit `USER_ROLE_UPDATED` with old/new in `metadata` |
| Soft delete | `User.isDeleted = true`, `deletedAt = now()`; historical invoices/payments remain |

> Suspended technicians must be rejected at **assignment time**, not only at login. Add the guard:
> `user.status = ACTIVE AND user.isDeleted = false` when loading the technician for assignment.

### E7. Financial oversight

```sql
SELECT i.id, i.status, i."totalAmount", p.status AS "paymentStatus", p."bkashTrxId", p."paidAt"
FROM invoices i
LEFT JOIN payments p ON p."invoiceId" = i.id
WHERE i."issuedAt" >= $from AND i."issuedAt" < $to
ORDER BY i."issuedAt" DESC;
```

### E8. Review the technician application

See **D2**. Important admin-only guards:

- `reviewedBy` must be an `ADMIN` (Manager cannot approve).
- Rejection must set `reviewNote`.
- Approval must check the application is still `PENDING` under `SELECT ... FOR UPDATE` to avoid
  double-approval creating two `TechnicianProfile` rows.

---

## F. Final end-state snapshot for `WO-001`

After the happy path completes, these are the rows you should be able to select. Use this as a
regression checklist after seeding.

| Table | Row | Key final values |
|---|---|---|
| `users` | `U-CUST-001` | `role = CUSTOMER`, `status = ACTIVE`, `isDeleted = false` |
| `users` | `U-TECH-001` | `role = TECHNICIAN`, `status = ACTIVE` |
| `services` | `SVC-001` | `basePriceAmount = 1500.00`, `isActive = true` |
| `service_requests` | `SR-001` | `status = COMPLETED`, snapshots unchanged |
| `work_orders` | `WO-001` | `status = COMPLETED`, `serviceRequestId = SR-001` |
| `assignments` | `AS-001` | `status = ACCEPTED`, `technicianId = TP-001`, `rejectionReason = null` |
| `appointments` | `AP-001` | `status = SCHEDULED`, `10:00-11:30 +06` |
| `estimates` | `EST-001` | `versionNumber = 1`, `status = SUPERSEDED` |
| `estimates` | `EST-002` | `versionNumber = 2`, `status = SUPERSEDED` |
| `estimates` | `EST-003` | `versionNumber = 3`, `status = APPROVED`, `totalAmount = 4800.00` |
| `service_reports` | `RPT-001` | `workOrderId = WO-001`, `laborHours = 2.50` |
| `invoices` | `INV-001` | `status = PAID`, `totalAmount = 4800.00`, `approvedEstimateId = EST-003` |
| `payments` | `PAY-001` | `status = CANCELLED` |
| `payments` | `PAY-002` | `status = PAID`, `bkashTrxId = BKX-9911` |
| `feedback` | `FB-001` | `rating = 5`, `workOrderId = WO-001` |
| `notifications` | `N-001..N-00n` | read/unread per matrix in Section 12.3 |
| `audit_logs` | `A-001..A-00n` | one row per critical transition |

Expected notification rows for this story:

| id | userId | category | title | isRead |
|---|---|---|---|---|
| `N-001` | `U-CUST-001` | `ASSIGNMENT` | Technician assigned | `true` |
| `N-002` | `U-TECH-001` | `ASSIGNMENT` | New job assigned | `true` |
| `N-003` | `U-CUST-001` | `ESTIMATE` | Estimate received | `true` |
| `N-004` | `U-TECH-001` | `ESTIMATE` | Estimate approved | `true` |
| `N-005` | `U-CUST-001` | `COMPLETION` | Work completed, invoice issued | `true` |
| `N-006` | `U-CUST-001` | `PAYMENT` | Payment successful | `false` |
| `N-007` | `U-TECH-001` | `PAYMENT` | Customer paid | `false` |

Expected audit rows (minimum):

| action | entityType | entityId |
|---|---|---|
| `REQUEST_CREATED` | `ServiceRequest` | `SR-001` |
| `REQUEST_APPROVED` | `ServiceRequest` | `SR-001` |
| `TECHNICIAN_ASSIGNED` | `Assignment` | `AS-001` |
| `APPOINTMENT_SCHEDULED` | `Appointment` | `AP-001` |
| `ASSIGNMENT_ACCEPTED` | `Assignment` | `AS-001` |
| `ESTIMATE_SENT` | `Estimate` | `EST-001` |
| `ESTIMATE_REVISION_REQUESTED` | `Estimate` | `EST-001` |
| `ESTIMATE_SENT` | `Estimate` | `EST-002` |
| `ESTIMATE_APPROVED` | `Estimate` | `EST-002` |
| `WORK_ORDER_STARTED` | `WorkOrder` | `WO-001` |
| `ESTIMATE_SENT` | `Estimate` | `EST-003` |
| `ESTIMATE_APPROVED` | `Estimate` | `EST-003` |
| `WORK_ORDER_COMPLETED` | `WorkOrder` | `WO-001` |
| `INVOICE_GENERATED` | `Invoice` | `INV-001` |
| `PAYMENT_STARTED` | `Payment` | `PAY-001` |
| `PAYMENT_FAILED` | `Payment` | `PAY-001` |
| `PAYMENT_STARTED` | `Payment` | `PAY-002` |
| `PAYMENT_PAID` | `Payment` | `PAY-002` |

---

## G. Bug-hunting checklist — schema vs. workflow

These are the mismatches you will actually hit while implementing. Fix the schema, the docs, or both,
but decide deliberately.

| ID | Severity | Problem | Where | Recommended fix |
|---|---|---|---|---|
| G-01 | High | Workflow says "decline request with reason" and "cancel work order with audited reason", but `ServiceRequest` / `WorkOrder` have no reason column. | `request.prisma`, `workorder.prisma` | Store reason in `AuditLog.metadata` **and** add `declineReason String?` / `cancellationReason String?` if the UI shows it. |
| G-02 | High | Workflow doc uses invoice status `ISSUED`, schema enum only has `UNPAID` / `PAID`. | `enums.prisma` `InvoiceStatus` | Remove `ISSUED` from docs; treat "issued" as `UNPAID` with `issuedAt` set. |
| G-03 | High | Workflow doc uses payment statuses `INITIATED/PENDING/SUCCESS/EXPIRED`, schema has `UNPAID/PAID/FAILED/CANCELLED`. | `enums.prisma` `PaymentStatus` | Pick one set. `UNPAID` for a checkout is confusing; prefer `INITIATED/PENDING/PAID/FAILED/CANCELLED`. |
| G-04 | High | Requirement doc says "manage multiple service addresses" (C04); schema stores a single address on `User`. | `user.prisma` | Either change the requirement to a single address or add an `Address` table and keep snapshots on `ServiceRequest`. |
| G-05 | High | Raw SQL in the workflow doc uses snake_case (`technician_id`, `start_time`), but the Prisma schema has **no `@map` on columns**, so real columns are camelCase (`"technicianId"`, `"startTime"`). Copy-pasted SQL will fail. | all raw SQL blocks | Add `@map("technician_id")` etc. to fields, or fix all SQL to quoted camelCase. |
| G-06 | High | `preferredDateTime`, `validUntil`, `issuedAt`, `paidAt`, `approvedAt`, `reviewedAt`, `deletedAt` have no `@db.Timestamptz`, while `Appointment.startTime/endTime` do. | all models | Use `@db.Timestamptz(6)` consistently for every `DateTime` that represents an instant. |
| G-07 | High | Estimate versions may be cumulative or delta, but the invoice builder assumes "last approved estimate" is the full bill. A delta v3 silently drops earlier scope. | `estimate.prisma`, invoice service | Document cumulative versions (as in this example) or merge all approved versions when building the invoice. |
| G-08 | High | Terminal sync is not enforced by the DB: paying can set `Invoice = PAID` while `WorkOrder` / `ServiceRequest` stay stale. | payment service | One transaction for `Payment`, `Invoice`, `WorkOrder`, `ServiceRequest`; add the regression query in Part H. |
| G-09 | Medium | "One approved estimate per work order" and "one active application/payment" are only service-level locks, not DB constraints. | services | Keep the `SELECT ... FOR UPDATE` locks; add partial unique indexes post-MVP. |
| G-10 | Medium | `Feedback.rating` has no 1–5 check, `Appointment.endTime > startTime` has no check, `Invoice.totalAmount = SUM(items)` has no check. | Prisma models | Enforce in service layer + add DB `CHECK` constraints via raw migration. |
| G-11 | Medium | `NotificationCategory` has only `ASSIGNMENT/ESTIMATE/PAYMENT/COMPLETION`; system events like "account suspended" or "request approved" have no natural bucket. | `enums.prisma` | Add `SYSTEM` (and optionally `REQUEST`) category. |
| G-12 | Medium | `Estimate` has no field for the customer's revision note or rejection reason; only `AuditLog.metadata` can hold it. | `estimate.prisma` | Add `customerNote String?` or standardize on audit metadata. |
| G-13 | Medium | `Assignment` has no `assignedBy` / `assignedAt`; `Appointment` has no `scheduledBy`. Assignment actor is only in audit. | `workorder.prisma` | Acceptable for MVP; if the UI shows "assigned by", add the columns. |
| G-14 | Medium | `TechnicianProfile.skills` (JSON strings) and `Service.requiredSkill` (free text) can disagree by casing/spelling (`AC Repair` vs `AC repair`), breaking matching. | `technician.prisma`, `service.prisma` | Normalize skills (trim + lowercase) and compare normalized values, or keep a canonical skill list. |
| G-15 | Medium | Self-assignment guard ("technician cannot be assigned to their own request") has no DB support. | assignment service | Before insert: `request.customerId != technician.userId`, else `400`. |
| G-16 | Low | Requirement doc still describes an `Attachment` table and Skill/TechnicianSkill join tables, but this schema uses JSON columns. | `FSMS_User_Role_Analysis_Updated.md` §14 / §10 | Update the requirement doc to match the JSON design. |
| G-17 | Low | `PaymentStatus` default is `UNPAID` and `InvoiceStatus` default `UNPAID`; be careful that "payment UNPAID" does not mean "invoice unpaid" in the UI. | enums / UI | Use distinct labels: invoice "Unpaid" vs payment "Pending". |
| G-18 | Low | Soft-deleted users still occupy unique `email`; "re-register same email" will fail. | `user.prisma` | Document restore-only behavior, or use a partial unique index on `isDeleted = false`. |
| G-19 | Low | Invoice/Payment are immutable (no `isDeleted`), but `WorkOrder` on `Invoice` is `Restrict`; a hard delete of a work order would fail. | `invoice.prisma` | Rely on soft delete only; never hard-delete `WorkOrder`. |
| G-20 | Low | `Feedback` requires `Invoice = PAID`, but nothing prevents a direct API call. | feedback service | Guard: load work order + invoice, `invoice.status = PAID`, `feedback` not exists, else `403/409`. |

---

## H. Invariant verification queries (run after seeding the example)

```sql
-- H1. One work order per request
SELECT "serviceRequestId", COUNT(*) FROM work_orders
GROUP BY "serviceRequestId" HAVING COUNT(*) > 1;           -- expect 0 rows

-- H2. One assignment / appointment / report / invoice / feedback per work order
SELECT "workOrderId", COUNT(*) FROM assignments GROUP BY "workOrderId" HAVING COUNT(*) > 1;
SELECT "workOrderId", COUNT(*) FROM service_reports GROUP BY "workOrderId" HAVING COUNT(*) > 1;
SELECT "workOrderId", COUNT(*) FROM invoices GROUP BY "workOrderId" HAVING COUNT(*) > 1;
SELECT "workOrderId", COUNT(*) FROM feedback GROUP BY "workOrderId" HAVING COUNT(*) > 1;

-- H3. Exactly one APPROVED estimate per work order
SELECT "workOrderId", COUNT(*) FROM estimates
WHERE status = 'APPROVED' GROUP BY "workOrderId" HAVING COUNT(*) > 1;   -- expect 0

-- H4. Invoice total equals its items and the approved estimate
SELECT i.id
FROM invoices i
JOIN (SELECT "invoiceId", SUM("lineTotal") s FROM invoice_items GROUP BY "invoiceId") x
  ON x."invoiceId" = i.id
WHERE i."totalAmount" <> x.s;

-- H5. Terminal consistency (the payment transaction)
SELECT wo.id, wo.status, sr.status AS request_status, i.status AS invoice_status
FROM work_orders wo
JOIN service_requests sr ON sr.id = wo."serviceRequestId"
JOIN invoices i ON i."workOrderId" = wo.id
WHERE (i.status = 'PAID' AND (wo.status <> 'COMPLETED' OR sr.status <> 'COMPLETED'))
   OR (wo.status = 'COMPLETED' AND i.status <> 'PAID');                 -- expect 0

-- H6. No overlapping active appointments for a technician
SELECT a1.id, a2.id
FROM appointments a1
JOIN appointments a2 ON a1.id < a2.id
JOIN assignments s1 ON s1.id = a1."assignmentId"
JOIN assignments s2 ON s2.id = a2."assignmentId"
WHERE s1."technicianId" = s2."technicianId"
  AND a1.status <> 'CANCELLED' AND a2.status <> 'CANCELLED'
  AND a1."isDeleted" = false AND a2."isDeleted" = false
  AND a1."startTime" < a2."endTime" AND a1."endTime" > a2."startTime"; -- expect 0

-- H7. Payments that were paid but never updated their invoice
SELECT p.id FROM payments p JOIN invoices i ON i.id = p."invoiceId"
WHERE p.status = 'PAID' AND i.status <> 'PAID';                        -- expect 0

-- H8. Feedback only on paid invoices
SELECT f.id FROM feedback f
JOIN work_orders wo ON wo.id = f."workOrderId"
JOIN invoices i ON i."workOrderId" = wo.id
WHERE i.status <> 'PAID';                                              -- expect 0

-- H9. Soft-delete leak (any read path missing the filter)
SELECT 'users' t, COUNT(*) FROM users WHERE "isDeleted" = true;        -- informational
```

---

## I. Reproduction checklist (order matters)

1. Seed `U-CUST-001`, `U-TECH-001` + `TP-001`, `U-ADM-001`, `U-APP-001`, `SVC-001`.
2. Follow Part C steps C1–C3 to create `SR-001`.
3. Follow Part E steps E2–E3 to create `WO-001`, `AS-001`, `AP-001`.
4. Follow Part D steps D3–D6 for accept → arrive → estimates → report.
5. Follow Part C step C7 for payment.
6. Follow Part C step C8 for feedback.
7. Run every query in Part H; all "expect 0 rows" queries must return empty.
8. Compare your final rows against Part F.
