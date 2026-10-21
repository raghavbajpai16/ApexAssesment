export default function HomePage() {
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid #334155', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', color: '#f8fafc' }}>
            Apex Tape Stock System
          </h1>
          <span className="badge badge-success">Phase 0 Ready</span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
          Industrial inventory, exact BOM calculation, production balance, and order fulfillment.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#38bdf8' }}>
            System Architecture
          </h2>
          <ul style={{ listStyle: 'none', paddingLeft: 0, color: '#cbd5e1', lineHeight: '1.8' }}>
            <li><strong>Frontend:</strong> React (Next.js App Router)</li>
            <li><strong>Backend:</strong> Next.js Route Handlers (`app/api/`)</li>
            <li><strong>Database:</strong> MySQL 8 with InnoDB ACID</li>
            <li><strong>Ledger Math:</strong> Exact Integer Milligrams (BIGINT)</li>
          </ul>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', color: '#38bdf8' }}>
            System Health & APIs
          </h2>
          <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
            Verify the database connection pool status and API endpoints.
          </p>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-block' }}
          >
            Check Database Health (/api/health)
          </a>
        </div>
      </div>

      <footer style={{ borderTop: '1px solid #1e293b', paddingTop: '1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
        Apex Tape Stock Application &bull; Phase 0 Foundation Completed
      </footer>
    </main>
  );
}
