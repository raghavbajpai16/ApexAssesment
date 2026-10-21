# Apex Tape Stock Management System

An industrial adhesive tape manufacturing inventory, BOM calculation, production balance, and order fulfillment system. Built with **Next.js 14 (App Router)**, **React**, **MySQL 8 (InnoDB)**, and **Vitest**.

---

## 1. Quick Start

### Prerequisites
- **Node.js**: v18.17+ or v20+
- **MySQL 8**: Either via local installation or Docker.

### Installation
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
# Copy example environment configuration
cp .env.example .env
# Adjust credentials in .env if using custom MySQL setup

# 3. Start MySQL (Option A: via Docker)
docker compose up -d

# 4. Run tests
npm test

# 5. Start development server
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

---

## 2. System Verification & Health Check

- **Landing Page**: `GET /`
- **Database Health**: `GET /api/health` — Performs `SELECT 1` ping against MySQL pool.
- **Unit Tests**: `npm test` — Executes Vitest test suite.

---

## 3. Demo Credentials (For Phase 1+)
- **Staff User**: `staff@demo.local` / `Staff@123`
- **Admin User**: `admin@demo.local` / `Admin@123`

---

## 4. Documentation & Architecture
- **[Development Log](docs/DEVLOG.md)**: Detailed phase-by-phase execution log and rationale.
- **[Architectural Decisions (ADR)](docs/DECISIONS.md)**: Formal decision records (D1–D8).
- **[AI Usage Log](docs/AI_USAGE.md)**: Transparent record of AI assistance and human review.
- **[Phase 0 Learning Guide](docs/learning/phase-0.md)**: Transition guide for MERN developers.
