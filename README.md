# Invoice App Backend - Frontend Integration Guide

This guide provides instructions on how to connect your frontend application to this Fastify backend.

## Base URL
The backend runs by default at: `http://localhost:3000`

---

## 1. Authentication Flow

The backend uses JWT (JSON Web Tokens) for authentication. Every protected request must include the token in the headers.

### Sign Up
**Endpoint:** `POST /auth/signup`
**Body:**
```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "strongpassword",
  "companyName": "My Company"
}
```
*Note: This creates both the user and their specific tenant (account) with a default **FREE** plan.*

### Log In
**Endpoint:** `POST /auth/login`
**Body:**
```json
{
  "email": "user@example.com",
  "password": "strongpassword"
}
```
**Response:**
```json
{
  "token": "eyJhbG..."
}
```
*Save this token in your frontend's `localStorage` or `sessionStorage`.*

---

## 2. Using the Token
For all protected routes (like `/invoices`), include the token in the `Authorization` header:

```http
Authorization: Bearer <YOUR_TOKEN_HERE>
```

---

## 3. Invoice Management

### Get All Invoices
**Endpoint:** `GET /invoices`
- Returns an array of invoices scoped to your tenant.

### Create Invoice
**Endpoint:** `POST /invoices`
**Body:**
```json
{
  "invoiceNumber": "INV-001",
  "amount": 250.00,
  "customerName": "John Doe"
}
```

#### Plan Limits & Errors
- **FREE Plan**: Max 10 invoices. If you exceed this, you will receive a `403 Forbidden` error with the message: `"After 10 generate invoice to show message upgrade plant selected plant Free"`.
- **PRO Plan**: Max 100 invoices. Price: **RS: 500/Monthly**.

### Upgrade Plan
**Endpoint:** `PATCH /invoices/upgrade`
- Changes the current tenant's plan from FREE to PRO.
- Once upgraded, the limit increases to 100 invoices.

---

## 4. Frontend Example (Fetch)

```javascript
const createInvoice = async (invoiceData) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch('http://localhost:3000/invoices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(invoiceData)
  });

  if (response.status === 403) {
    const error = await response.json();
    alert(error.message); // "After 10 generate invoice to show message upgrade plant..."
  }
  
  return await response.json();
};
```

## 5. Environment Troubleshooting
If you encounter a `P1001` or `P1000` error:
- Ensure PostgreSQL is running.
- If running on port **4000**, check that your `.env` says: `DATABASE_URL="postgresql://postgres:password@localhost:4000/invoice_db?schema=public"`
- Use `npx prisma db push` to initialize tables.
