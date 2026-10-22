'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [adminCheckResult, setAdminCheckResult] = useState(null);
  const [loadingCheck, setLoadingCheck] = useState(false);

  const testAdminPrivilege = async () => {
    setLoadingCheck(true);
    setAdminCheckResult(null);
    try {
      const res = await fetch('/api/admin/check');
      const data = await res.json();
      setAdminCheckResult({
        status: res.status,
        data,
      });
    } catch (err) {
      setAdminCheckResult({
        status: 500,
        data: { error: err.message },
      });
    } finally {
      setLoadingCheck(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Hero Welcome */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', color: '#f8fafc' }}>
          Manufacturing Operations Dashboard
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', maxWidth: '720px' }}>
          Welcome to the Apex Tape Stock System. All inventory weights are tracked in integer milligrams
          with strict double-entry ledger accounting and InnoDB concurrency locks.
        </p>
      </div>

      {/* Role-Based Security Verification Widget */}
      <div className="card">
        <h2 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '0.5rem', color: '#f1f5f9' }}>
          Role-Based Authorization Probe
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Test server-side authorization enforcement by pinging the protected Admin-only endpoint (
          <code style={{ color: '#38bdf8' }}>GET /api/admin/check</code>). Admin accounts receive 200 OK, while Staff accounts receive 403 Forbidden.
        </p>

        <button
          onClick={testAdminPrivilege}
          disabled={loadingCheck}
          className="btn btn-secondary btn-sm"
        >
          {loadingCheck ? 'Verifying...' : 'Probe Admin Endpoint'}
        </button>

        {adminCheckResult && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
              backgroundColor: adminCheckResult.status === 200 ? '#022c22' : '#450a0a',
              border: `1px solid ${adminCheckResult.status === 200 ? '#065f46' : '#991b1b'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span
                className={adminCheckResult.status === 200 ? 'badge badge-success' : 'badge badge-warning'}
                style={{ fontSize: '0.7rem' }}
              >
                HTTP {adminCheckResult.status}
              </span>
              <span style={{ fontWeight: '600', fontSize: '0.85rem', color: '#f8fafc' }}>
                {adminCheckResult.status === 200 ? 'Authorized as Admin' : 'Access Denied (Staff Restricted)'}
              </span>
            </div>
            <pre style={{ fontSize: '0.8rem', color: '#cbd5e1', overflowX: 'auto', marginTop: '0.35rem' }}>
              {JSON.stringify(adminCheckResult.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Operational Modules Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.35rem', color: '#e2e8f0' }}>
            Material Ledger
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Record raw material receipts and monitor on-hand BOPP film, liquid adhesive, and paper cores.
          </p>
          <Link href="/materials" className="btn btn-secondary btn-sm">
            View Materials
          </Link>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.35rem', color: '#e2e8f0' }}>
            Tape Specifications
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Manage immutable tape recipes and compute exact Bills of Materials (BOM) per roll.
          </p>
          <Link href="/specs" className="btn btn-secondary btn-sm">
            View Specs
          </Link>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.35rem', color: '#e2e8f0' }}>
            Production Batches
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Log tape slitting & coating batches with zero-tolerance material balance verification.
          </p>
          <Link href="/production" className="btn btn-secondary btn-sm">
            Log Batch
          </Link>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.35rem', color: '#e2e8f0' }}>
            Customer Orders
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Reserve stock, convert orders from metres or kg, and dispatch tape rolls.
          </p>
          <Link href="/orders" className="btn btn-secondary btn-sm">
            Manage Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
