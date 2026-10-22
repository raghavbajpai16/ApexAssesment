# Phase 1 Concept Guide: Authentication, Sessions, and Relational Security

Welcome to Phase 1, Raghav! In this lesson, we will cover the core principles of backend security, comparing them with what you might already know from MERN (MongoDB + Express + React + Node).

---

## 1. Core Concepts

### Concept 1: Password Hashing vs Encryption
- **Encryption is two-way**: Given a secret key, plaintext `secret123` becomes ciphertext, and using the key you can decrypt it back to `secret123`.
- **Hashing is one-way**: A mathematical function converts `secret123` into an irreversible digest (e.g., `$2a$10$vI8aWBnW3fID.ZQ4...`). You can **never** reverse a hash to obtain the original password.
- **Why bcrypt?** Fast hashes (like MD5 or SHA-256) are dangerous for passwords because modern GPUs can compute billions of guesses per second (brute-force). `bcrypt` is intentionally computationally heavy and includes a **salt** (random bits prepended to the password), preventing rainbow table attacks.
- **Verification**: To check a password on login, the server hashes the incoming plaintext with the stored salt and compares the two hashes in constant time.

### Concept 2: Database Sessions vs Stateless JWT
In beginner MERN tutorials, people often use JWTs (JSON Web Tokens) stored in `localStorage`. In real financial or stock-control systems, database-backed sessions are much safer:

| Feature | Stateless JWT | Database-Backed Session (Our Stack) |
|---|---|---|
| **Storage location** | Often client `localStorage` (vulnerable to XSS) | Server `sessions` table + `HttpOnly` cookie |
| **Revocation** | Impossible until expiration (unless you keep a blacklist DB) | Instant! `DELETE FROM sessions WHERE token_hash = ?` immediately logs out the user |
| **Token leakage** | If leaked, attacker has access until expiry | Session token is hashed with SHA-256 in DB (D7). Even if DB leaks, attacker cannot forge session cookies |
| **Payload size** | Grows with user claims, sent on every request | Tiny 32-byte opaque random string |

### Concept 3: Cookies: `HttpOnly`, `SameSite=Lax`, and `Secure`
When a browser receives a `Set-Cookie` header:
- **`HttpOnly`**: JavaScript (`document.cookie`) **cannot read** the cookie. This makes token theft via Cross-Site Scripting (XSS) impossible.
- **`SameSite=Lax`**: The cookie is not sent on cross-site requests (e.g., if a malicious site embeds your API or tries to submit a form from outside), preventing Cross-Site Request Forgery (CSRF).
- **`Secure`**: The cookie is only transmitted over HTTPS (encrypted in transit), preventing network sniffing.

### Concept 4: SQL Injection vs Parameterized Queries
In MongoDB, you might do `User.findOne({ email: req.body.email })` with Mongoose.
In raw SQL, if you concatenate strings:
```javascript
// DANGEROUS / VULNERABLE:
const query = `SELECT * FROM users WHERE email = '${email}'`;
```
If an attacker enters `' OR '1'='1`, the query becomes:
`SELECT * FROM users WHERE email = '' OR '1'='1'` — and logs them in as the first user!

With **parameterized queries**:
```javascript
// SAFE:
const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
```
The MySQL engine parses the query structure *before* substituting the parameters. The input `?` is treated purely as a string literal data value, never as executable SQL instructions.

---

## 2. MERN Developer Comparison Table

| Concept | Express + MongoDB (What you know) | Next.js App Router + MySQL (This project) |
|---|---|---|
| **Route Definition** | `app.post('/api/login', handler)` | `src/app/api/auth/login/route.js` exporting `export async function POST(req)` |
| **Middleware Auth** | `app.use(authMiddleware)` | `requireUser(req)` called inside route handler + Next.js `middleware.js` for redirects |
| **Data Model** | `const User = mongoose.model('User', schema)` | SQL schema migration (`001_initial_schema.sql`) executed in MySQL |
| **DB Queries** | `await User.findOne({ email })` | `const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email])` |
| **Session Tracking**| `express-session` or manual JWT | Native web cookies via `cookies().set(...)` + MySQL `sessions` table |
| **Validation** | Joi or Mongoose validators | `zod` schema: `loginSchema.parse(body)` |

---

## 3. Tiny Runnable Example: Password Hashing & Parameterized Query

Here is a minimal demonstration of how `bcryptjs` and parameterized `mysql2` work together:

```javascript
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

// 1. Hash a password during registration/seeding
const password = 'Staff123!';
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);

// 2. Save safely using parameterized SQL
const pool = mysql.createPool({ host: '127.0.0.1', user: 'tape_user', database: 'apex_tape_stock' });
await pool.execute(
  'INSERT INTO users (email, role, password_hash) VALUES (?, ?, ?)',
  ['staff@demo.local', 'staff', hashedPassword]
);

// 3. Verify on login
const userEnteredPassword = 'Staff123!';
const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', ['staff@demo.local']);
const user = rows[0];

const isMatch = await bcrypt.compare(userEnteredPassword, user.password_hash);
console.log('Login successful?', isMatch); // true
```

---

## 4. Common Mistakes to Avoid

1. **Checking auth only in Next.js middleware**:
   - Next.js edge middleware can have routing bypasses or header spoofing if misconfigured. Section 6 explicitly commands: **Always call `requireUser()` inside the Route Handler itself**.
2. **Returning different errors for "User not found" vs "Wrong password"**:
   - An attacker can use this to enumerate which emails are registered on your platform. Always return a generic error: `"Invalid email or password"`.
3. **Storing plain session tokens in the database**:
   - If a hacker extracts a database backup, plain session tokens allow immediate account hijacking. By storing `SHA256(token)`, the token in the database is useless without the unhashed cookie!

---

## 5. Check Your Understanding (Quiz)

Try to answer these without looking at the bottom:

1. Why do we store passwords as hashes instead of encrypting them with an AES key?
2. If an attacker submits `' OR '1'='1' --` into the email field of a parameterized query `SELECT * FROM users WHERE email = ?`, what does MySQL do?
3. What does the `HttpOnly` flag on a cookie prevent, and why can't client-side React code access an `HttpOnly` cookie?
4. What is the difference between `401 Unauthorized` and `403 Forbidden`?
5. Why do we store the SHA-256 hash of a session token in the database rather than the raw session token itself?

---

<details>
<summary><strong>Click to reveal Quiz Answers</strong></summary>

1. **Answer**: Encryption has a decryption key. If a server is compromised or the key is leaked, all user passwords are exposed. Hashing is one-way: there is no key to decrypt the original password.
2. **Answer**: MySQL treats the entire string `"' OR '1'='1' --"` as a literal email address and searches for a user whose email equals that exact text. No SQL injection occurs.
3. **Answer**: `HttpOnly` tells the browser that the cookie must never be accessible via JavaScript (`document.cookie`). If an attacker injects a malicious XSS script, they cannot steal the session cookie.
4. **Answer**: `401 Unauthorized` means the user is not authenticated (not logged in or session expired). `403 Forbidden` means the user is authenticated, but lacks the necessary permission/role (e.g., Staff trying to perform an Admin action).
5. **Answer**: To prevent session hijacking from database leaks. If an attacker gains read access to the database (e.g. through a SQL dump or read vulnerability), they cannot use the stored SHA-256 hashes as cookies because SHA-256 is one-way. Only the user with the original unhashed cookie in their browser can authenticate.

</details>
