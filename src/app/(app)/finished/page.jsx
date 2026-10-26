'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function FinishedStockPage() {
  const [stock, setStock] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invariant 2 Reconcile audit state
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockRes, txnRes] = await Promise.all([
        fetch('/api/finished'),
        fetch('/api/finished/transactions'),
      ]);

      const stockData = await stockRes.json();
      const txnData = await txnRes.json();

      if (!stockRes.ok) throw new Error(stockData.error || 'Failed to load finished stock.');
      if (!txnRes.ok) throw new Error(txnData.error || 'Failed to load finished transactions.');

      setStock(stockData.stock || []);
      setTransactions(txnData.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run Invariant 2 reconciliation audit
  const runReconciliation = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch('/api/finished/reconcile');
      const data = await res.json();
      setReconcileResult({
        status: res.status,
        data,
      });
    } catch (err) {
      setReconcileResult({
        status: 500,
        data: { error: err.message },
      });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.35rem', color: '#f8fafc' }}>
              Finished Goods Inventory & Dispatch Readiness
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '780px' }}>
              Manufactured tape rolls available for customer allocation and dispatch. Track on-hand vs reserved balances
              and verify double-entry finished goods accounting (Invariant 2).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/production" className="btn btn-primary btn-sm">
              + Log Production Batch
            </Link>
            <button
              onClick={runReconciliation}
              className="btn btn-secondary btn-sm"
              disabled={reconciling}
            >
              {reconciling ? 'Auditing...' : 'Audit Invariant 2'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Invariant 2 Audit Result Banner */}
      {reconcileResult && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: '8px',
            backgroundColor: reconcileResult.data?.is_reconciled ? '#064e3b' : '#450a0a',
            border: `1px solid ${reconcileResult.data?.is_reconciled ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                className={`badge ${reconcileResult.data?.is_reconciled ? 'badge-success' : 'badge-warning'}`}
                style={{ fontSize: '0.75rem' }}
              >
                {reconcileResult.data?.is_reconciled ? '✓ Invariant 2 Verified' : '⚠ Finished Stock Mismatch'}
              </span>
              <span style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.95rem' }}>
                {reconcileResult.data?.is_reconciled
                  ? 'All on-hand finished rolls exactly equal the sum of finished goods transaction rows.'
                  : 'Discrepancy detected between stored finished rolls and transaction sums!'}
              </span>
            </div>
            <button
              onClick={() => setReconcileResult(null)}
              style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {reconcileResult.data?.specs && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {reconcileResult.data.specs.map((s) => (
                <div
                  key={s.spec_id}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#f1f5f9' }}>{s.spec_code}</div>
                  <div style={{ color: '#cbd5e1' }}>On-hand: {s.on_hand_rolls} rolls</div>
                  <div style={{ color: '#94a3b8' }}>Ledger: {s.ledger_sum_rolls} rolls</div>
                  <div style={{ color: s.is_matched ? '#4ade80' : '#f87171', fontWeight: '600' }}>
                    {s.is_matched ? '✓ Exact Match' : `Discrepancy: ${s.discrepancy}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Finished Stock Inventory Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {stock.length === 0 && !loading && (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
            No finished stock produced yet. Visit the{' '}
            <Link href="/production" style={{ color: '#38bdf8' }}>
              Production Module
            </Link>{' '}
            to log your first batch.
          </div>
        )}

        {stock.map((item) => (
          <div
            key={item.spec_id}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderLeft: '4px solid #10b981',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  {item.spec_code}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {item.width_mm}mm × {item.roll_length_m}m
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.75rem' }}>
                {item.spec_name || item.spec_code}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', margin: '0.75rem 0' }}>
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total On-Hand</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc' }}>
                    {item.on_hand_rolls} <span style={{ fontSize: '0.8rem', fontWeight: '400', color: '#94a3b8' }}>rolls</span>
                  </div>
                </div>

                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Available (Unreserved)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#4ade80' }}>
                    {item.available_rolls} <span style={{ fontSize: '0.8rem', fontWeight: '400', color: '#94a3b8' }}>rolls</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#cbd5e1', marginTop: '0.5rem' }}>
                <span>Reserved for Orders: <strong>{item.reserved_rolls} rolls</strong></span>
                <span>Net Weight: <strong>{item.total_net_kg_str}</strong></span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Total Physical Length: {item.total_metres_str}
              </div>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
              <Link href="/orders" className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>
                Reserve in Order →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Finished Goods Ledger Audit Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
              Finished Stock Ledger (Append-Only)
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Complete audit history of production additions, reservations, releases, and customer dispatches.
            </p>
          </div>
          <button onClick={loadData} className="btn btn-secondary btn-sm" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading && transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading finished stock transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No finished stock transactions recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Txn #</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Spec Code</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Action Kind</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Rolls Impact</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Operator</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Notes / Ref</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr key={txn.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontFamily: 'monospace' }}>
                      #{txn.id}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {txn.created_at ? new Date(txn.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', color: '#f8fafc' }}>
                      {txn.spec_code}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        className={`badge ${
                          txn.kind === 'production'
                            ? 'badge-success'
                            : txn.kind === 'reserve'
                            ? 'badge-staff'
                            : 'badge-warning'
                        }`}
                        style={{ fontSize: '0.65rem' }}
                      >
                        {txn.kind.toUpperCase()}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '0.75rem 0.5rem',
                        fontWeight: '700',
                        color: txn.is_positive ? '#4ade80' : '#f87171',
                        fontFamily: 'monospace',
                      }}
                    >
                      {txn.rolls_formatted}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8' }}>
                      {txn.user_email || `User #${txn.created_by}`}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {txn.note || (txn.ref_type ? `${txn.ref_type} #${txn.ref_id}` : '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
