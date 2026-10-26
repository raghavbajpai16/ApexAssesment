'use client';

import { useState, useEffect, useCallback } from 'react';

export default function MaterialsPage() {
  const [materials, setMaterials] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [selectedMaterialFilter, setSelectedMaterialFilter] = useState('');

  // Modal states
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    material_code: 'film',
    qty: '',
    supplier: '',
    note: '',
  });
  const [receiptSubmitting, setReceiptSubmitting] = useState(false);
  const [receiptError, setReceiptError] = useState(null);
  const [receiptSuccess, setReceiptSuccess] = useState(null);

  const [showDamageModal, setShowDamageModal] = useState(false);
  const [damageForm, setDamageForm] = useState({
    material_code: 'film',
    qty: '',
    note: '',
  });
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageError, setDamageError] = useState(null);
  const [damageSuccess, setDamageSuccess] = useState(null);

  // Reconciliation state
  const [reconcileResult, setReconcileResult] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  // Load inventory and ledger
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matRes, txnRes] = await Promise.all([
        fetch('/api/materials'),
        fetch(`/api/materials/transactions${selectedMaterialFilter ? `?material_code=${selectedMaterialFilter}` : ''}`),
      ]);

      const matData = await matRes.json();
      const txnData = await txnRes.json();

      if (!matRes.ok) throw new Error(matData.error || 'Failed to fetch inventory.');
      if (!txnRes.ok) throw new Error(txnData.error || 'Failed to fetch ledger transactions.');

      setMaterials(matData.materials || []);
      setTransactions(txnData.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMaterialFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run admin reconciliation audit
  const runReconciliation = async () => {
    setReconciling(true);
    setReconcileResult(null);
    try {
      const res = await fetch('/api/materials/reconcile');
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

  // Submit Stock Receipt
  const handleReceiptSubmit = async (e) => {
    e.preventDefault();
    setReceiptSubmitting(true);
    setReceiptError(null);
    setReceiptSuccess(null);

    try {
      // Generate unique idempotency key for this submission
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `receipt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await fetch('/api/materials/receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          material_code: receiptForm.material_code,
          qty: receiptForm.qty,
          supplier: receiptForm.supplier.trim() || undefined,
          note: receiptForm.note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record receipt.');
      }

      setReceiptSuccess(`Received ${data.qty_added_formatted} ${data.material.name}!`);
      setReceiptForm({
        material_code: 'film',
        qty: '',
        supplier: '',
        note: '',
      });
      loadData();
      setTimeout(() => setShowReceiptModal(false), 1200);
    } catch (err) {
      setReceiptError(err.message);
    } finally {
      setReceiptSubmitting(false);
    }
  };

  // Submit Material Damage
  const handleDamageSubmit = async (e) => {
    e.preventDefault();
    setDamageSubmitting(true);
    setDamageError(null);
    setDamageSuccess(null);

    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `damage-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await fetch('/api/materials/damage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          material_code: damageForm.material_code,
          qty: damageForm.qty,
          note: damageForm.note.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record damage.');
      }

      setDamageSuccess(`Deducted ${data.qty_deducted_formatted} damaged material.`);
      setDamageForm({
        material_code: 'film',
        qty: '',
        note: '',
      });
      loadData();
      setTimeout(() => setShowDamageModal(false), 1200);
    } catch (err) {
      setDamageError(err.message);
    } finally {
      setDamageSubmitting(false);
    }
  };

  // Find material on-hand for quick checks in damage modal
  const selectedDamageMat = materials.find((m) => m.code === damageForm.material_code);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Header Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.35rem', color: '#f8fafc' }}>
              Material Inventory & Double-Entry Ledger
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '780px' }}>
              Raw stock balances are maintained in integer milligrams with pessimistic row locking (<code>FOR UPDATE</code>)
              and an append-only transaction ledger (D1, D8).
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setReceiptError(null);
                setReceiptSuccess(null);
                setShowReceiptModal(true);
              }}
              className="btn btn-primary"
            >
              + Receive Material
            </button>
            <button
              onClick={() => {
                setDamageError(null);
                setDamageSuccess(null);
                setShowDamageModal(true);
              }}
              className="btn btn-secondary"
            >
              ⚠ Report Damage
            </button>
            <button
              onClick={runReconciliation}
              className="btn btn-secondary"
              disabled={reconciling}
            >
              {reconciling ? 'Auditing...' : 'Audit Invariant 1'}
            </button>
          </div>
        </div>
      </div>

      {/* Global Error Notice */}
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Reconciliation Audit Result Banner */}
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
                {reconcileResult.data?.is_reconciled ? '✓ Invariant 1 Verified' : '⚠ Ledger Mismatch'}
              </span>
              <span style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.95rem' }}>
                {reconcileResult.data?.is_reconciled
                  ? 'All on-hand material balances exactly equal the sum of transaction ledger records (Zero discrepancy).'
                  : 'Discrepancy detected between stored balance and ledger sums!'}
              </span>
            </div>
            <button
              onClick={() => setReconcileResult(null)}
              style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          {reconcileResult.data?.materials && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              {reconcileResult.data.materials.map((m) => (
                <div
                  key={m.code}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.25)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ fontWeight: '600', color: '#f1f5f9' }}>{m.name}</div>
                  <div style={{ color: '#cbd5e1' }}>On-hand: {m.on_hand_formatted}</div>
                  <div style={{ color: '#94a3b8' }}>Ledger Sum: {m.ledger_sum_formatted}</div>
                  <div style={{ color: m.is_matched ? '#4ade80' : '#f87171', fontWeight: '600' }}>
                    {m.is_matched ? '✓ Exact Match' : `Short/Surplus: ${m.discrepancy}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Material Stock Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {materials.map((mat) => {
          const isMg = mat.unit === 'mg';
          return (
            <div
              key={mat.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderLeft: `4px solid ${mat.code === 'film' ? '#38bdf8' : mat.code === 'adhesive' ? '#f59e0b' : '#10b981'}`,
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span className="badge badge-staff" style={{ fontSize: '0.7rem' }}>
                    {mat.code.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Unit: {mat.display_unit}</span>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.25rem' }}>
                  {mat.name}
                </h3>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#38bdf8', margin: '0.75rem 0' }}>
                  {mat.on_hand_formatted}
                </div>
                {isMg && (
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Raw integer: {Number(mat.on_hand).toLocaleString()} milligrams
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #334155' }}>
                <button
                  onClick={() => {
                    setReceiptForm((prev) => ({ ...prev, material_code: mat.code }));
                    setReceiptError(null);
                    setReceiptSuccess(null);
                    setShowReceiptModal(true);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, fontSize: '0.75rem' }}
                >
                  + Receive
                </button>
                <button
                  onClick={() => {
                    setDamageForm((prev) => ({ ...prev, material_code: mat.code }));
                    setDamageError(null);
                    setDamageSuccess(null);
                    setShowDamageModal(true);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1, fontSize: '0.75rem' }}
                >
                  ⚠ Damage
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction History Ledger Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
              Append-Only Material Ledger (Audit History)
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Immutable audit log of all receipts, production issues, and damage records (D8).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <select
              value={selectedMaterialFilter}
              onChange={(e) => setSelectedMaterialFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.85rem',
              }}
            >
              <option value="">All Materials</option>
              <option value="film">BOPP Film</option>
              <option value="adhesive">Liquid Adhesive</option>
              <option value="core">Paper Cores</option>
            </select>
            <button onClick={loadData} className="btn btn-secondary btn-sm" disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading && transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading ledger transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No material transactions recorded yet. Use '+ Receive Material' to record the first stock receipt.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Txn ID</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Material</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Transaction Kind</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Quantity Impact</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Operator</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Notes / Supplier</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((txn) => (
                  <tr
                    key={txn.id}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.75rem 0.5rem', color: '#64748b', fontFamily: 'monospace' }}>
                      #{txn.id}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {txn.created_at ? new Date(txn.created_at).toLocaleString() : '-'}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', color: '#f8fafc' }}>
                      {txn.material_name}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span
                        className={`badge ${
                          txn.kind === 'receipt'
                            ? 'badge-success'
                            : txn.kind === 'damage'
                            ? 'badge-warning'
                            : 'badge-staff'
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
                        fontSize: '0.9rem',
                      }}
                    >
                      {txn.qty_formatted}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8' }}>
                      {txn.user_email || `User #${txn.created_by}`}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {txn.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receive Material Modal */}
      {showReceiptModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '500px',
              width: '100%',
              backgroundColor: '#1e293b',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
                Record Material Receipt
              </h3>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            {receiptSuccess && (
              <div style={{ padding: '0.75rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ✓ {receiptSuccess}
              </div>
            )}

            {receiptError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ⚠ {receiptError}
              </div>
            )}

            <form onSubmit={handleReceiptSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Material Type *
                </label>
                <select
                  value={receiptForm.material_code}
                  onChange={(e) => setReceiptForm({ ...receiptForm, material_code: e.target.value })}
                  className="input"
                  required
                >
                  <option value="film">BOPP Film (kg)</option>
                  <option value="adhesive">Liquid Adhesive (kg)</option>
                  <option value="core">Paper Cores (pieces)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Quantity ({receiptForm.material_code === 'core' ? 'pieces' : 'kg, up to 6 decimals'}) *
                </label>
                <input
                  type="text"
                  value={receiptForm.qty}
                  onChange={(e) => setReceiptForm({ ...receiptForm, qty: e.target.value })}
                  placeholder={receiptForm.material_code === 'core' ? 'e.g. 500' : 'e.g. 100.000'}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Supplier Name (Optional)
                </label>
                <input
                  type="text"
                  value={receiptForm.supplier}
                  onChange={(e) => setReceiptForm({ ...receiptForm, supplier: e.target.value })}
                  placeholder="e.g. Polymar Film Corp"
                  className="input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Note / Batch Reference
                </label>
                <input
                  type="text"
                  value={receiptForm.note}
                  onChange={(e) => setReceiptForm({ ...receiptForm, note: e.target.value })}
                  placeholder="e.g. Delivery truck #452"
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="btn btn-secondary"
                  disabled={receiptSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={receiptSubmitting}
                >
                  {receiptSubmitting ? 'Recording...' : 'Save Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Damage Modal */}
      {showDamageModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '500px',
              width: '100%',
              backgroundColor: '#1e293b',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc' }}>
                Report Material Damage / Scrap
              </h3>
              <button
                type="button"
                onClick={() => setShowDamageModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            {selectedDamageMat && (
              <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#0f172a', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.8rem' }}>
                <span style={{ color: '#94a3b8' }}>Currently available on-hand: </span>
                <strong style={{ color: '#38bdf8' }}>{selectedDamageMat.on_hand_formatted}</strong>
              </div>
            )}

            {damageSuccess && (
              <div style={{ padding: '0.75rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ✓ {damageSuccess}
              </div>
            )}

            {damageError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                ⚠ {damageError}
              </div>
            )}

            <form onSubmit={handleDamageSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Material Type *
                </label>
                <select
                  value={damageForm.material_code}
                  onChange={(e) => setDamageForm({ ...damageForm, material_code: e.target.value })}
                  className="input"
                  required
                >
                  <option value="film">BOPP Film (kg)</option>
                  <option value="adhesive">Liquid Adhesive (kg)</option>
                  <option value="core">Paper Cores (pieces)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Damage Quantity ({damageForm.material_code === 'core' ? 'pieces' : 'kg, up to 6 decimals'}) *
                </label>
                <input
                  type="text"
                  value={damageForm.qty}
                  onChange={(e) => setDamageForm({ ...damageForm, qty: e.target.value })}
                  placeholder={damageForm.material_code === 'core' ? 'e.g. 10' : 'e.g. 5.000'}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Damage Reason / Incident Note *
                </label>
                <textarea
                  rows="3"
                  value={damageForm.note}
                  onChange={(e) => setDamageForm({ ...damageForm, note: e.target.value })}
                  placeholder="e.g. Water damage during storm in warehouse bay B"
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDamageModal(false)}
                  className="btn btn-secondary"
                  disabled={damageSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#dc2626' }}
                  disabled={damageSubmitting}
                >
                  {damageSubmitting ? 'Recording...' : 'Confirm Damage Deduction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
