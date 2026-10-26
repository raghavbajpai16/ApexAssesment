'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminCheckResult, setAdminCheckResult] = useState(null);
  const [loadingCheck, setLoadingCheck] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Hero Welcome */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          marginBottom: '2rem',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.35rem', color: '#f8fafc' }}>
              Apex Tape Stock Command Center
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '680px', margin: 0 }}>
              Zero-float mathematical precision across industrial tape manufacturing, stock reservation, and unbroken double-entry audit ledgers.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/orders" className="btn btn-primary" style={{ fontSize: '0.85rem' }}>
              ➕ New Order
            </Link>
            <Link href="/production" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              ⚙️ Log Batch
            </Link>
            <Link href="/materials" className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
              📦 Receive Stock
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading executive operational summary...</div>
      ) : !summary ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444' }}>Failed to load operational data.</div>
      ) : (
        <>
          {/* Invariant Health Banner */}
          <div
            className="card"
            style={{
              marginBottom: '2rem',
              padding: '1.25rem',
              borderLeft: `4px solid ${summary.invariants?.all_healthy ? '#10b981' : '#ef4444'}`,
              backgroundColor: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{summary.invariants?.all_healthy ? '🛡️' : '⚠️'}</span>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                    System Invariants Integrity: {summary.invariants?.all_healthy ? '100% Reconciled & Healthy' : 'Discrepancy Detected'}
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.2rem 0 0 0' }}>
                    Zero-tolerance equality continuously verified between physical warehouse stock and double-entry transaction ledgers.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: '#1e293b', color: summary.invariants?.invariant_1?.is_reconciled ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                  Inv 1: Materials {summary.invariants?.invariant_1?.is_reconciled ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: '#1e293b', color: summary.invariants?.invariant_2?.is_reconciled ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                  Inv 2: Finished {summary.invariants?.invariant_2?.is_reconciled ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', backgroundColor: '#1e293b', color: summary.invariants?.invariant_3?.is_reconciled ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                  Inv 3: Orders {summary.invariants?.invariant_3?.is_reconciled ? '✓' : '✗'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Raw Materials Stock */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Raw Materials Inventory
              </h2>
              <Link href="/materials" style={{ fontSize: '0.85rem', color: '#38bdf8', textDecoration: 'none' }}>
                View Materials Ledger →
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {/* Film */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#94a3b8' }}>BOPP Film</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#1e293b', color: '#38bdf8', fontWeight: '700' }}>
                    RAW ROLL
                  </span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', fontFamily: 'monospace' }}>
                  {summary.materials?.film?.on_hand_formatted || '0.000 kg'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Raw Milligrams: {summary.materials?.film?.on_hand || '0'} mg
                </div>
              </div>

              {/* Adhesive */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#94a3b8' }}>Adhesive Liquid</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#1e293b', color: '#38bdf8', fontWeight: '700' }}>
                    DRUM CHEMICAL
                  </span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', fontFamily: 'monospace' }}>
                  {summary.materials?.adhesive?.on_hand_formatted || '0.000 kg'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Raw Milligrams: {summary.materials?.adhesive?.on_hand || '0'} mg
                </div>
              </div>

              {/* Cores */}
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#94a3b8' }}>Paper Cores</span>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#1e293b', color: '#38bdf8', fontWeight: '700' }}>
                    CARDBOARD
                  </span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', fontFamily: 'monospace' }}>
                  {summary.materials?.core?.on_hand_formatted || '0 pieces'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                  1 Core per Finished Tape Roll
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Finished Goods & Commercial Pipeline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Finished Stock Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                  Finished Tape Warehouse
                </h3>
                <Link href="/finished" style={{ fontSize: '0.85rem', color: '#38bdf8', textDecoration: 'none' }}>
                  Details →
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem', textAlign: 'center' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>On Hand</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f8fafc' }}>
                    {summary.finished?.total_on_hand_rolls}
                  </div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Reserved</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f59e0b' }}>
                    {summary.finished?.total_reserved_rolls}
                  </div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Available</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#10b981' }}>
                    {summary.finished?.total_available_rolls}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                <span>Total Manufactured Length:</span>
                <strong style={{ color: '#f8fafc', fontFamily: 'monospace' }}>{summary.finished?.total_metres_str}</strong>
              </div>
            </div>

            {/* Orders Pipeline Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                  Commercial Order Pipeline
                </h3>
                <Link href="/orders" style={{ fontSize: '0.85rem', color: '#38bdf8', textDecoration: 'none' }}>
                  Manage Orders →
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Active Open Orders</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#f59e0b' }}>
                    {summary.orders?.open_orders}
                  </div>
                </div>
                <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Rolls Earmarked</span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#38bdf8' }}>
                    {summary.orders?.total_rolls_reserved} rolls
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                <span>Completed Orders Shipped:</span>
                <strong style={{ color: '#10b981' }}>{summary.orders?.completed_orders} orders ({summary.orders?.total_rolls_dispatched} rolls)</strong>
              </div>
            </div>
          </div>

          {/* Section 3: Recent Production Batches & History Shortcut */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Recent Production Runs & Mass Balance Status
              </h3>
              <Link href="/history" style={{ fontSize: '0.85rem', color: '#38bdf8', textDecoration: 'none' }}>
                View Full Unified Audit History →
              </Link>
            </div>

            {summary.recent_batches?.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>No production batches recorded yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Batch No</th>
                      <th>Spec</th>
                      <th>Rolls Produced</th>
                      <th>Mass Balance Diff (ADR D3)</th>
                      <th>Status</th>
                      <th>Logged At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent_batches?.map((b) => (
                      <tr key={b.id}>
                        <td style={{ fontWeight: '700', color: '#38bdf8' }}>{b.batch_no}</td>
                        <td style={{ fontWeight: '600' }}>{b.spec_code}</td>
                        <td style={{ fontWeight: '700' }}>{b.rolls_formatted}</td>
                        <td style={{ fontFamily: 'monospace' }}>{b.diff_kg_str}</td>
                        <td>
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              backgroundColor: b.is_balanced ? '#10b98120' : '#ef444420',
                              color: b.is_balanced ? '#10b981' : '#ef4444',
                              border: `1px solid ${b.is_balanced ? '#10b98140' : '#ef444440'}`,
                            }}
                          >
                            {b.is_balanced ? 'BALANCED' : 'IMBALANCE'}
                          </span>
                        </td>
                        <td style={{ color: '#64748b' }}>{new Date(b.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 4: Role-Based Authorization Probe */}
          <div className="card" style={{ padding: '1.25rem', backgroundColor: '#0f172a' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.35rem' }}>
              Role-Based Authorization Probe
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Verify server-side authorization guard by pinging <code>GET /api/admin/check</code>. Admin accounts receive 200 OK; Staff accounts receive 403 Forbidden.
            </p>

            <button onClick={testAdminPrivilege} disabled={loadingCheck} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
              {loadingCheck ? 'Verifying...' : 'Probe Admin Endpoint'}
            </button>

            {adminCheckResult && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  backgroundColor: adminCheckResult.status === 200 ? '#064e3b' : '#7f1d1d',
                  color: adminCheckResult.status === 200 ? '#a7f3d0' : '#fecaca',
                }}
              >
                <strong>Status {adminCheckResult.status}:</strong> {JSON.stringify(adminCheckResult.data)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
