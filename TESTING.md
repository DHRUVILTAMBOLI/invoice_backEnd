# Backend Developer Testing Guide

This guide explains how to verify and test the Invoice App Backend features, specifically the multi-tenancy and plan limits.

## 1. Prerequisites
- Server running: `npm run dev` (Default: `http://localhost:3000`)
- Database synced: `npx prisma db push`

---

## 2. Testing Flow (Step-by-Step)

### Step 1: Register a New Account (Tenant)
Create a new company account.
```bash
curl -X POST http://localhost:3000/auth/signup \
-H "Content-Type: application/json" \
-d '{
  "name": "Admin User",
  "email": "admin@test.com",
  "password": "password123",
  "companyName": "Test Corp"
}'
```

### Step 2: Login to get the JWT Token
This token identifies both you and your company.
```bash
curl -X POST http://localhost:3000/auth/login \
-H "Content-Type: application/json" \
-d '{
  "email": "admin@test.com",
  "password": "password123"
}'
```
*Copy the `token` from the response.*

### Step 3: Test Multi-Tenant Invoice Creation
Replace `<TOKEN>` with the token from Step 2.
```bash
curl -X POST http://localhost:3000/invoices \
-H "Authorization: Bearer <TOKEN>" \
-H "Content-Type: application/json" \
-d '{
  "invoiceNumber": "INV-001",
  "amount": 100.50,
  "customerName": "Customer A"
}'
```

---

## 3. Testing Plan Limits

### Testing the FREE Limit (10 Invoices)
1. Use a bash loop to create 10 invoices quickly:
   ```bash
   for i in {1..10}; do
     curl -s -X POST http://localhost:3000/invoices \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d "{\"invoiceNumber\": \"INV-$i\", \"amount\": 10.0, \"customerName\": \"Test\"}"
   done
   ```
2. Attempt to create the **11th invoice**.
3. **Expected Result**: You should receive a `403 Forbidden` with the message: `"After 10 generate invoice to show message upgrade plant selected plant Free"`.

### Testing the PRO Limit (100 Invoices)
1. Upgrade your account:
   ```bash
   curl -X PATCH http://localhost:3000/invoices/upgrade \
   -H "Authorization: Bearer <TOKEN>"
   ```
2. Now create another invoice.
3. **Expected Result**: Success! The limit is now increased to 100.

---

## 4. Useful Tools
- **REST Clients**: Use [Postman](https://www.postman.com/) or the [Thunder Client](https://www.thunderclient.com/) (VS Code extension) for a better GUI experience.
- **Database GUI**: Use **Prisma Studio** to visualize your data:
  ```bash
  npx prisma studio
  ```

## 5. Automated Testing (Optional)
If you wish to add automated unit tests, I recommend installing **Vitest**:
```bash
npm install -D vitest
```
You can then create `.test.ts` files to test your route logic programmatically.
