# Phase 0 Learning Guide: Next.js App Router, Route Handlers & MySQL2 Pools

Welcome Raghav! In this phase, we transition your MERN intuition (React + Express + MongoDB) into the stack required by the company: **React + Next.js (App Router) + MySQL 8**.

---

## 1. Goal
Understand how Next.js handles routing and API endpoints without Express, and how database pooling works in MySQL compared to Mongoose.

---

## 2. Core Concepts

### Concept 1: Next.js App Router vs Express Server
In standard MERN, you write an Express server:
```javascript
// Express way
const express = require('express');
const app = express();
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.listen(5000);
```
In **Next.js App Router**, there is no separate Express server. Next.js uses **file-system based routing**:
- Any file named `route.js` inside `src/app/api/...` becomes an HTTP API endpoint!
- Folder path = URL path: `src/app/api/health/route.js` serves `GET /api/health`.
- You export named async functions matching HTTP verbs: `GET`, `POST`, `PUT`, `DELETE`.
- Handlers receive a Web standard `Request` object and return a `Response` (or `NextResponse.json(...)`).

### Concept 2: Server Components vs Client Components
In Next.js:
- **Server Components (Default)**: Render on the server into HTML. They can directly query databases, use secrets, and don't ship JS to the client. They **cannot** use `useState` or `useEffect` or browser events (`onClick`).
- **Client Components (`'use client'`)**: Standard interactive React components (like you use in standard React / Vite). They run in the browser and can have state, effects, and click listeners.

### Concept 3: Database Connection Pooling (`mysql2/promise`) vs Mongoose
In Mongoose:
- You call `mongoose.connect(uri)`. Mongoose internally maintains a connection pool and schemas.
In MySQL with `mysql2`:
- We create a **Connection Pool** using `mysql.createPool(...)`.
- A pool is a collection of reusable database connections. Instead of opening and closing a TCP connection to MySQL for every incoming request (which is very slow), the pool keeps a few connections open.
- When an API route runs `pool.query(sql, [params])`, it borrows a connection from the pool, executes the query, and automatically returns the connection to the pool.

### Concept 4: Environment Variables & Security
- Secrets (like DB passwords) are kept in `.env`.
- `.env` must **NEVER** be committed to Git. It is listed in `.gitignore`.
- We commit `.env.example` with blank or dummy values so anyone cloning the repo knows which variables are required.

---

## 3. MERN Comparison Table

| MERN Feature | Next.js + MySQL Equivalent | Why the difference? |
|---|---|---|
| `app.get('/api/users', handler)` | `export async function GET(request)` in `app/api/users/route.js` | Built-in file-system routing, eliminates Express boilerplate. |
| `req.body` | `await request.json()` | Web standard `Request` API. |
| `res.status(200).json(data)` | `NextResponse.json(data, { status: 200 })` | Modern Web `Response` object. |
| `mongoose.connect()` | `mysql.createPool({ host, user, ... })` | Relational DB connection pooling for high concurrency. |
| Mongoose models (`User.find()`) | `const [rows] = await pool.query('SELECT ...')` | Raw SQL gives 100% control over queries, indexes, and transactions. |

---

## 4. Tiny Runnable Example

Here is what a complete Next.js route handler looks like:

```javascript
// src/app/api/health/route.js
import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    // 1. Run a quick ping query on MySQL
    const [rows] = await pool.query('SELECT 1 AS alive');
    
    // 2. Return JSON response
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // 3. Graceful failure response
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
```

---

## 5. Common Mistakes to Avoid
1. **Accidentally committing `.env`**: Always initialize `.gitignore` first.
2. **Opening a new connection on every request with `mysql.createConnection` instead of `createPool`**: This exhausts database connections under load.
3. **Using `res.send()` or Express patterns inside Next.js**: Remember to return `NextResponse.json(...)`.
4. **Putting client state (`useState`) in Server Components without `'use client'`**.

---

## 6. Self-Check Quiz

Test your understanding before we begin:

1. In Next.js App Router, how do you define a `POST` endpoint at `/api/login`?
2. Why do we use a connection pool (`createPool`) instead of single connections (`createConnection`)?
3. Where should database credentials be stored, and should they be committed to Git?
4. What is the difference between a Server Component and a Client Component in Next.js?
5. Why does Next.js eliminate the need for a separate Express server in our project?

<details>
<summary>Click to view Quiz Answers</summary>

1. Create a file at `src/app/api/login/route.js` and export an `async function POST(request) { ... }`.
2. A pool maintains a set of open connections that requests share and reuse. Opening a new TCP connection on every request adds significant latency and quickly crashes MySQL by exhausting the max connections limit.
3. In a `.env` file; it should NEVER be committed to Git (it must be in `.gitignore`). We provide `.env.example` as a template with dummy values.
4. Server Components render on the server, have direct backend access, and send no JS bundle to the browser; Client Components (`'use client'`) run in the browser and support state, effects, and interactive UI events.
5. Next.js includes a built-in Node.js server with file-system Route Handlers (`app/api/**/route.js`) that handle HTTP requests natively.
</details>
