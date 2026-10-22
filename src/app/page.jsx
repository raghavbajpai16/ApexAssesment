import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#f8fafc' }}>
            Apex Tape Stock System
          </h1>
          <span className="badge badge-success">Phase 1 Online</span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
          Industrial inventory control, exact BOM calculation, production balancing, and order fulfillment.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#38bdf8' }}>
            Authentication & Access
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.25rem' }}>
            Database-backed session authentication with role-based authorization for Staff and Admin operators.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/login" className="btn btn-primary">
              Sign In to Application
            </Link>
            <Link href="/dashboard" className="btn btn-secondary">
              Open Dashboard
            </Link>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#38bdf8' }}>
            System Diagnostics
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '1.25rem' }}>
            Verify MySQL pool connectivity and endpoint responsiveness.
          </p>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ display: 'inline-block' }}
          >
            Check Health API (/api/health)
          </a>
        </div>
      </div>

      <footer style={{ borderTop: '1px solid #1e293b', paddingTop: '1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
        Apex Tape Stock Application &bull; Phase 1 Authentication & Ledger Foundation
      </footer>
    </main>
  );
}
