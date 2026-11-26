# Feature 5: Service Catalog — Postman Testing Guide

Base path: `/api/v1/services`

This guide covers all six endpoints:

| Method | Path | Access |
|---|---|---|
| GET | `/services` | Public |
| GET | `/services/:id` | Public |
| GET | `/services/all` | ADMIN |
| POST | `/services` | ADMIN |
| PATCH | `/services/:id` | ADMIN |
| DELETE | `/services/:id` | ADMIN |

---

## 1. Prerequisites

1. Database is migrated and seeded (`0A` completed).
2. `.env` contains the seeded user credentials:
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`
   - `CUSTOMER_EMAIL` / `CUSTOMER_PASSWORD`
3. Start the server:
   ```bash
   npm run dev
   ```
4. Note the port from `.env` (`PORT`), for example `5000`.

---

## 2. Postman environment

Create a Postman environment with these variables:

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://localhost:5000` |
| `adminEmail` | your seeded admin email |
| `adminPassword` | your seeded admin password |
| `customerEmail` | your seeded customer email |
| `customerPassword` | your seeded customer password |
| `adminToken` | leave empty |
| `customerToken` | leave empty |
| `serviceId` | leave empty |
| `inactiveServiceId` | leave empty |
| `deleteServiceId` | leave empty |

Do not commit real passwords.

---

## 3. Get tokens

### 3.1 Login as ADMIN

`POST {{baseUrl}}/api/v1/auth/login`

Body (raw JSON):

```json
{
  "email": "{{adminEmail}}",
  "password": "{{adminPassword}}"
}
```

Tests tab:

```js
pm.test("Admin login succeeds", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.success).to.eql(true);
  pm.environment.set("adminToken", json.data.accessToken);
});
```

Expected: `200`, and `adminToken` is saved.

### 3.2 Login as CUSTOMER

Repeat the same request with `customerEmail` / `customerPassword`, or duplicate it.

Tests tab:

```js
pm.test("Customer login succeeds", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.success).to.eql(true);
  pm.environment.set("customerToken", json.data.accessToken);
});
```

For all ADMIN requests below, set:

- Authorization type: **Bearer Token**
- Token: `{{adminToken}}`

For public requests, select **No Auth** and send no `Authorization` header.

---

## 4. Public catalog tests

### 4.1 GET /services — public active list

`GET {{baseUrl}}/api/v1/services`

No auth.

Expected:
- `200`
- `data` is an array
- every item has `isActive: true` and `isDeleted: false`

Tests tab:

```js
pm.test("Public list succeeds", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.data).to.be.an("array");
});

pm.test("Only active, non-deleted services are returned", () => {
  const json = pm.response.json();
  json.data.forEach((service) => {
    pm.expect(service.isActive).to.eql(true);
    pm.expect(service.isDeleted).to.eql(false);
  });
});
```

### 4.2 GET /services/:id — public detail

Use a real id from the public list, or create one first (section 5).

`GET {{baseUrl}}/api/v1/services/{{serviceId}}`

No auth.

Expected: `200`, `data.id === {{serviceId}}`.

### 4.3 Route-order check: `/all` must not be treated as an id

`GET {{baseUrl}}/api/v1/services/all`

No auth.

Expected: `401 Unauthorized` (not `404 Service not found`).

This proves `/all` is registered before `/:id`.

---

## 5. Create a service (ADMIN)

`POST {{baseUrl}}/api/v1/services`

Auth: Bearer `{{adminToken}}`

Body (raw JSON):

```json
{
  "name": "Split AC Servicing",
  "description": "Full servicing of a split air conditioner",
  "requiredSkill": "AC Repair",
  "basePriceAmount": "1500.00",
  "estimatedDurationMinutes": 90,
  "isActive": true
}
```

Expected:
- `201`
- `data.name === "Split AC Servicing"`
- `data.requiredSkill === "AC Repair"` (trimmed, case preserved)
- `data.basePriceAmount === "1500"` (Prisma Decimal serialized as string)
- `data.estimatedDurationMinutes === 90`
- `data.isActive === true`
- `data.isDeleted === false`

Tests tab:

```js
pm.test("Service created", () => {
  pm.response.to.have.status(201);
  const json = pm.response.json();
  pm.expect(json.success).to.eql(true);
  pm.expect(json.data.requiredSkill).to.eql("AC Repair");
  pm.environment.set("serviceId", json.data.id);
});
```

### 5.1 Create an inactive service

`POST {{baseUrl}}/api/v1/services` (ADMIN)

Body:

```json
{
  "name": "Inactive Test Service",
  "description": "Should never appear in the public list",
  "requiredSkill": "Plumbing",
  "basePriceAmount": "500.00",
  "estimatedDurationMinutes": 45,
  "isActive": false
}
```

Tests tab:

```js
const json = pm.response.json();
pm.environment.set("inactiveServiceId", json.data.id);
```

### 5.2 Create a disposable service for the DELETE test

Create one more service and save its id as `deleteServiceId`:

```js
const json = pm.response.json();
pm.environment.set("deleteServiceId", json.data.id);
```

---

## 6. Verify trimming and public visibility

### 6.1 Public list excludes inactive service

`GET {{baseUrl}}/api/v1/services`

Tests tab:

```js
const json = pm.response.json();
const ids = json.data.map((service) => service.id);

pm.test("Inactive service is hidden from the public list", () => {
  pm.expect(ids).to.not.include(pm.environment.get("inactiveServiceId"));
});
```

### 6.2 Public detail of an inactive service returns 404

`GET {{baseUrl}}/api/v1/services/{{inactiveServiceId}}`

Expected: `404 Service not found`.

---

## 7. Update a service (ADMIN)

`PATCH {{baseUrl}}/api/v1/services/{{serviceId}}`

Auth: Bearer `{{adminToken}}`

Body:

```json
{
  "name": "Split AC Servicing",
  "description": "Updated description",
  "requiredSkill": "   AC Repair   ",
  "basePriceAmount": "1750.50",
  "estimatedDurationMinutes": 120,
  "isActive": true
}
```

Expected:
- `200`
- `data.requiredSkill === "AC Repair"` (trimmed)
- `data.basePriceAmount === "1750.5"` (or equivalent decimal string)
- `data.estimatedDurationMinutes === 120`

Tests tab:

```js
pm.test("Service updated", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.data.requiredSkill).to.eql("AC Repair");
  pm.expect(json.data.estimatedDurationMinutes).to.eql(120);
});
```

### 7.1 PATCH must reject fields outside the allow-list

`PATCH {{baseUrl}}/api/v1/services/{{serviceId}}` (ADMIN)

Body:

```json
{
  "role": "ADMIN"
}
```

Expected: `400` because the update schema is strict and `role` is not allowed.

Also test:

```json
{
  "isDeleted": true
}
```

Expected: `400`.

---

## 8. Admin list: GET /services/all (ADMIN)

`GET {{baseUrl}}/api/v1/services/all`

Auth: Bearer `{{adminToken}}`

Expected:
- `200`
- `data` is an array
- `meta` contains `page`, `limit`, `total`, `totalPages`

Tests tab:

```js
pm.test("Admin list has pagination meta", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.meta).to.include.keys("page", "limit", "total", "totalPages");
});
```

### 8.1 Pagination

`GET {{baseUrl}}/api/v1/services/all?page=1&limit=5`

Expected: `meta.page === 1`, `meta.limit === 5`, `data.length <= 5`.

### 8.2 Search

`GET {{baseUrl}}/api/v1/services/all?searchTerm=AC`

Matches `name`, `description`, or `requiredSkill` case-insensitively.

### 8.3 isActive filter

`GET {{baseUrl}}/api/v1/services/all?isActive=false`

Expected: every returned service has `isActive: false`.

### 8.4 Sorting

`GET {{baseUrl}}/api/v1/services/all?sortBy=basePriceAmount&sortOrder=asc`

Expected: amounts are in ascending order.

Other valid `sortBy` values: `name`, `estimatedDurationMinutes`, `isActive`, `isDeleted`, `createdAt`, `updatedAt`.

Invalid values:

`GET {{baseUrl}}/api/v1/services/all?sortBy=password`

Expected: `400`.

### 8.5 Invalid pagination

`GET {{baseUrl}}/api/v1/services/all?page=0&limit=10`

Expected: `400`.

`GET {{baseUrl}}/api/v1/services/all?page=1&limit=1000`

Expected: `400` because `limit` is capped at `100`.

### 8.6 Admin list includes inactive services

`GET {{baseUrl}}/api/v1/services/all` (ADMIN)

Tests tab:

```js
const json = pm.response.json();
const ids = json.data.map((service) => service.id);

pm.test("Admin list includes inactive service", () => {
  pm.expect(ids).to.include(pm.environment.get("inactiveServiceId"));
});
```

---

## 9. Access-control tests

### 9.1 Public endpoints work without a token

Already covered in section 4.

### 9.2 Customer cannot use admin endpoints

Use the customer token (`{{customerToken}}`).

| Request | Expected |
|---|---|
| `GET /api/v1/services/all` | `403` |
| `POST /api/v1/services` | `403` |
| `PATCH /api/v1/services/{{serviceId}}` | `403` |
| `DELETE /api/v1/services/{{serviceId}}` | `403` |

### 9.3 No token on admin endpoints

Remove the Authorization header.

| Request | Expected |
|---|---|
| `GET /api/v1/services/all` | `401` |
| `POST /api/v1/services` | `401` |
| `PATCH /api/v1/services/{{serviceId}}` | `401` |
| `DELETE /api/v1/services/{{serviceId}}` | `401` |

---

## 10. Validation tests (ADMIN)

All of these should return `400`.

### 10.1 Invalid decimal amount

```json
{
  "name": "Invalid Price",
  "requiredSkill": "AC Repair",
  "basePriceAmount": "10.123",
  "estimatedDurationMinutes": 60
}
```

### 10.2 Zero price

```json
{
  "name": "Zero Price",
  "requiredSkill": "AC Repair",
  "basePriceAmount": "0",
  "estimatedDurationMinutes": 60
}
```

### 10.3 Duration must be a positive integer

```json
{
  "name": "Bad Duration",
  "requiredSkill": "AC Repair",
  "basePriceAmount": "100.00",
  "estimatedDurationMinutes": 0
}
```

Repeat with `1.5` and `-10`; all should return `400`.

### 10.4 Missing required skill

```json
{
  "name": "No Skill",
  "basePriceAmount": "100.00",
  "estimatedDurationMinutes": 60
}
```

### 10.5 Extra fields are rejected

```json
{
  "name": "Mass Assignment Attempt",
  "requiredSkill": "AC Repair",
  "basePriceAmount": "100.00",
  "estimatedDurationMinutes": 60,
  "isDeleted": false
}
```

Expected: `400`.

### 10.6 PATCH with no allowed field

`PATCH {{baseUrl}}/api/v1/services/{{serviceId}}`

Body: `{}`

Expected: `400`.

---

## 11. Soft delete (ADMIN)

`DELETE {{baseUrl}}/api/v1/services/{{deleteServiceId}}`

Auth: Bearer `{{adminToken}}`

Expected:
- `200`
- `data.isDeleted === true`
- `data.deletedAt` is set
- the row still exists (soft delete, not hard delete)

Tests tab:

```js
pm.test("Service soft-deleted", () => {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.expect(json.data.isDeleted).to.eql(true);
  pm.expect(json.data.deletedAt).to.not.eql(null);
});
```

### 11.1 Deleted service disappears from public list

`GET {{baseUrl}}/api/v1/services`

Tests tab:

```js
const json = pm.response.json();
const ids = json.data.map((service) => service.id);

pm.test("Deleted service is hidden publicly", () => {
  pm.expect(ids).to.not.include(pm.environment.get("deleteServiceId"));
});
```

### 11.2 Deleted service returns 404 on public detail

`GET {{baseUrl}}/api/v1/services/{{deleteServiceId}}`

Expected: `404 Service not found`.

### 11.3 Deleted service is still visible in the admin list

`GET {{baseUrl}}/api/v1/services/all` (ADMIN)

Tests tab:

```js
const json = pm.response.json();
const ids = json.data.map((service) => service.id);

pm.test("Admin list still shows the soft-deleted service", () => {
  pm.expect(ids).to.include(pm.environment.get("deleteServiceId"));
});
```

This is intentional for Feature 5: the admin `/all` list does not filter `isDeleted`.

### 11.4 Deleting twice returns 404

`DELETE {{baseUrl}}/api/v1/services/{{deleteServiceId}}` (ADMIN)

Expected: `404 Service not found`.

### 11.5 Patching a deleted service returns 404

`PATCH {{baseUrl}}/api/v1/services/{{deleteServiceId}}` (ADMIN)

Body:

```json
{
  "isActive": false
}
```

Expected: `404 Service not found`.

---

## 12. Suggested execution order

1. Login as admin and customer.
2. `GET /services` public list.
3. `POST /services` create primary service (`serviceId`).
4. `POST /services` create inactive service (`inactiveServiceId`).
5. `POST /services` create disposable service (`deleteServiceId`).
6. `GET /services/:id` public detail.
7. `PATCH /services/:id` update primary service.
8. `GET /services/all` admin pagination/search/filter tests.
9. Access-control tests with customer token and no token.
10. Validation tests.
11. `DELETE /services/{{deleteServiceId}}` and verify soft-delete behavior.
12. Confirm deleted service is absent publicly and present in `/all`.

---

## 13. Common Postman test snippets

Envelope check:

```js
pm.test("Success envelope", () => {
  const json = pm.response.json();
  pm.expect(json.success).to.eql(true);
  pm.expect(json.statusCode).to.eql(pm.response.code);
});
```

Error check:

```js
pm.test("Error envelope", () => {
  const json = pm.response.json();
  pm.expect(json.success).to.eql(false);
  pm.expect(json.statusCode).to.eql(pm.response.code);
});
```

Save a service id:

```js
const json = pm.response.json();
pm.environment.set("serviceId", json.data.id);
```
