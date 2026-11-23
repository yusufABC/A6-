# FSMS Build Guide (Feature by Feature with AI)
 
Read this once. Then use Part 3 (the loop) and Part 4 (the feature list) every day.
 
---
 
## Part 1: The Big Idea
 
Think of your project files like a **handbook for a new employee**.
 
| File | What it tells the AI |
|---|---|
| `skills/SKILL.md` | HOW to write code (folders, errors, auth, validation) + WHAT the rules are (status machines, endpoints) |
| `requirement-analysis.md` | What the business wants (roles, workflows, edge cases) |
| `database_model_relations.md` | The exact database tables, plus a worked example |
 
You do **not** need to paste rules into every prompt. The AI reads the handbook. You just say **which task to do**.
 
**Your job:** pick ONE feature, tell the AI, check the result, test it, move on.
**AI's job:** write the code.
 
---
 
## Part 2: One-Time Setup (10 minutes)
 
1. Put the three files above inside your project folder.
2. Create `AGENTS.md` in the project root (next to `package.json`):
```
Read @skills/SKILL.md, @requirement-analysis.md and @database_model_relations.md before any task.
Follow them exactly. Build only what I ask.
Plan first (list files), then implement, then stop and wait for my review.
If something is missing or unclear (e.g. a notification category), ask me. Do not guess.
```
 
3. Open OpenCode and ask: **"What rules will you follow for this project?"**
   - If it mentions module structure, AppError, and status machines, setup works.
   - If not, tell it: "Read @skills/SKILL.md first."
---
 
## Part 3: The Loop (repeat for every feature)
 
```
Prompt -> Check plan -> Build -> npm run build -> Test -> Fix -> Git commit -> Next
```
 
### Step 1: Prompt (short is fine)
 
```
Build feature 9: Approve service request
(POST /api/v1/service-requests/:id/approve).
Use SKILL.md, requirement-analysis.md and database_model_relations.md for all rules.
Only this feature. Plan first, then stop.
```
 
Three things matter: the **exact endpoint**, **"only this feature"**, and **"plan first, then stop"**.
 
### Step 2: Check the plan (30 seconds)
 
Before saying "go", make sure the plan lists the right files and mentions the key rules for that feature.
For approve, ask yourself: *Does it include WorkOrder creation, AuditLog, and one transaction?*
If something is missing, say: "Add the audit log. Then continue."
 
### Step 3: Build check
 
```
npm run build
npx biome lint ./src
```
 
If it fails, paste the error and say: "Fix this."
 
### Step 4: Test (one good case, one bad case)
 
- Correct role and input: expect 200/201.
- Wrong role: expect 403.
- Wrong status (e.g. already approved): expect 400.
- Fake ID: expect 404.
### Step 5: Fix
 
Paste the error or response and say: **"Fix only this bug. Do not change anything else."**
 
### Step 6: Commit to git
 
Commit after every working feature. If the AI breaks something later, you can go back.
 
### Habits that save time
 
- **New chat for each feature.** Long chats get confused.
- If the AI starts doing extra things, say: "Stop. Only do what I asked."
- **Test right after each feature**, not at the end. Like tasting food while cooking: easy to find a bad ingredient early, hard later.
---
 
## Part 4: Feature List (build in this order)
 
Your auth module is done, so start at **Feature 4**.
 
### Feature 0: Shared helpers (do early)
Three small helpers many features reuse:
- `createAuditLog(tx, {...})`
- `createNotification(tx, {...})`
- `assertTransition(machine, from, to)` (one place that checks status changes)
### Phase 1: Auth (DONE)
1. Register + verify-email
2. Login + refresh-token + Google login
3. Forgot / reset password
### Phase 2: Users and catalog
4. **Profile:** `GET/PATCH /users/me`, `PATCH /users/me/address`, `PATCH /users/me/password`, `POST /users/me/profile-image`
5. **Services:** public `GET /services`, `GET /services/:id`; Admin create, update, soft-delete, `GET /services/all`
6. **Admin user management:** suspend, activate, change role, soft delete (audit log on each)
### Phase 3: Service requests
7. **Create request** (CUSTOMER, TECHNICIAN): snapshot service name, price, address; upload photos; `PENDING_REVIEW`; audit `REQUEST_CREATED`
8. **List / get own requests + cancel:** customer can cancel only in `PENDING_REVIEW` or `AWAITING_ASSIGNMENT`
9. **Approve** (MANAGER, ADMIN): one transaction: create WorkOrder, request becomes `APPROVED`, audit log, notify customer
10. **Decline:** reason goes into `AuditLog.metadata` (there is no reason column)
### Phase 4: Technician onboarding
11. **Submit application** (CUSTOMER, multipart): one `PENDING` per user, with a row lock
12. **Admin approve / reject:** approve = set role + create TechnicianProfile + audit, all in one transaction; reject requires `reviewNote`
13. **Technician profile + public profile** (average rating computed live)
### Phase 5: Dispatch
14. **Available technicians:** skill match (trim + lowercase), exclude suspended
15. **Assign + schedule:** advisory lock, overlap check (409), self-assignment guard, WO `ASSIGNED`
16. **Accept / reject assignment:** accept gives `SCHEDULED`; reject cancels appointment and WO returns to `AWAITING_ASSIGNMENT`
17. **Reassign (same row), reschedule, cancel appointment**
18. **Cancel work order:** assignment, appointment, WO and request all cancelled in one transaction
### Phase 6: Field work
19. **Arrive:** WO `ARRIVED`
20. **Send estimate** (versioned): old `SENT` becomes `SUPERSEDED`; allowed from `ARRIVED` or `IN_PROGRESS`
21. **Customer estimate decisions:** approve / request revision / reject (reject behaves differently before vs during work)
22. **Start work:** WO `IN_PROGRESS`
23. **Submit report + complete:** one transaction: report, invoice from last approved estimate, WO `WORK_COMPLETED`
### Phase 7: Payment (riskiest, go slowly)
24. **Checkout:** create idempotency key first, then call bKash
25. **bKash callback:** public route; verify with bKash; update Payment, Invoice, WO, Request in ONE transaction; safe to replay
26. **Timeout handling:** ask bKash before cancelling
### Phase 8: Finishing
27. Feedback (invoice must be `PAID`, one per WO)
28. Notifications (list, read, read-all)
29. Audit logs (Admin)
30. Analytics
31. Helmet, rate limit, Postman collection, deploy, final check against SKILL.md section 21
---
 
## Part 5: Review Checklist (use when something looks wrong)
 
**Service file**
- [ ] Multi-table write uses `prisma.$transaction(async (tx) => ...)`
- [ ] Inside the transaction, only `tx` is used (never `prisma`)
- [ ] Checks existence first, then status, then writes
- [ ] Writes an AuditLog
- [ ] Creates a Notification where the rules say so
- [ ] No `req` or `res` in the service
**Controller file**
- [ ] Wrapped in `catchAsync`
- [ ] Calls exactly one service function
- [ ] Uses `sendResponse`
- [ ] No Prisma calls
**Route file**
- [ ] Path starts with `/`
- [ ] ONE `auth(...)` call with all allowed roles
- [ ] Mounted in `app.ts`
---
 
## Part 6: Common Mistakes
 
| Mistake | How to spot it |
|---|---|
| Business logic in controller | Prisma calls or `if` rules inside the controller |
| Two writes without a transaction | Two `await prisma.x.update(...)` in a row |
| Skipping a status | e.g. WorkOrder jumps straight to `COMPLETED` |
| Missing audit log | No `AuditLog` created for a critical action |
| Missing `isDeleted: false` | Deleted records show up in lists |
| `...req.body` into Prisma | Always pick exact fields instead |
| Using `prisma` inside a transaction | Must be `tx` |
| Two `auth()` calls on one route | Only the last one counts; use one call with all roles |
| AI builds extra features | Always say "Only this feature" |
 
---
 
## Part 7: The Notification Category Question (decide later)
 
Each notification has a **category label**. Your schema has four: `ASSIGNMENT`, `ESTIMATE`, `PAYMENT`, `COMPLETION`.
 
"Request approved" does not fit any of them. Two options:
 
1. **Add `SYSTEM`** to the enum in `enums.prisma`, then run a migration. Clean, tiny change.
2. **Skip that notification.** The requirements do not list it as mandatory.
You can decide when you reach Feature 9. Because `AGENTS.md` says "ask me, do not guess", the AI will ask you instead of picking a random category.
 
---
 
## Part 8: Golden Rule
 
The AI is fast, but it does not know your project. You do.
 
1. Give it ONE feature.
2. Check the plan.
3. Run `npm run build`.
4. Test one good case and one bad case.
5. Commit.
6. Only then start the next feature.
 