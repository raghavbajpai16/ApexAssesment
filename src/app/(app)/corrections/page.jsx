'use client';

import { useState, useEffect, useCallback } from 'react';

export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('receipt'); // 'receipt' | 'damage' | 'batch'

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('receipt'); // 'receipt' | 'damage' | 'batch'
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Form State
  const [form, setForm] = useState({
    target_id: '',
    qty: '',
    supplier: '',
    rolls: '',
    film_kg: '',
    liquid_kg: '',
    waste_kg: '0.000',
    reason: '',
    approved_by: '',
  });

  const fetchCorrections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/corrections');
      if (res.ok) {
        const data = await res.json();
        setCorrections(data.corrections || []);
      } else {
        const err = await res.json();
        setErrorMsg(err.error || 'Failed to load corrections');
      }
    } catch (err) {
      console.error('Failed to fetch corrections:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCorrections();
  }, [fetchCorrections]);

  const handleOpenModal = (type) => {
    setModalType(type);
    setForm({
      target_id: '',
      qty: '',
      supplier: '',
      rolls: '100',
      film_kg: '120.000',
      liquid_kg: '211.200',
      waste_kg: '0.000',
      reason: '',
      approved_by: '',
    });
    setErrorMsg(null);
    setSuccessMsg(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `corr-${Date.now()}`;

    try {
      let endpoint = '';
      let payload = {};

      if (modalType === 'receipt') {
        endpoint = '/api/corrections/material-receipt';
        payload = {
          txn_id: parseInt(form.target_id, 10),
          qty: form.qty,
          supplier: form.supplier || null,
          reason: form.reason,
          approved_by: form.approved_by || null,
        };
      } else if (modalType === 'damage') {
        endpoint = '/api/corrections/material-damage';
        payload = {
          txn_id: parseInt(form.target_id, 10),
          qty: form.qty,
          reason: form.reason,
          approved_by: form.approved_by || null,
        };
      } else if (modalType === 'batch') {
        endpoint = '/api/corrections/production-batch';
        payload = {
          batch_id: parseInt(form.target_id, 10),
          rolls: parseInt(form.rolls, 10),
          film_kg: form.film_kg,
          liquid_kg: form.liquid_kg,
          waste_kg: form.waste_kg,
          reason: form.reason,
          approved_by: form.approved_by || null,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Correction failed');
        return;
      }

      setSuccessMsg(`Correction #${data.correction_id} executed successfully! Linked reversal and replacement entries recorded.`);
      fetchCorrections();
      setTimeout(() => {
        setShowModal(false);
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Network error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
              Administrative Corrections
            </h1>
            <span className="badge badge-admin" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
              Admin Only
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Compensating transactions with reversal + replacement entries. Original rows are permanent and immutable (ADR D8).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={() => handleOpenModal('receipt')} className="btn btn-secondary">
            <span>📦 Correct Receipt</span>
          </button>
          <button onClick={() => handleOpenModal('damage')} className="btn btn-secondary">
            <span>⚠️ Correct Damage</span>
          </button>
          <button onClick={() => handleOpenModal('batch')} className="btn btn-primary">
            <span>⚙️ Correct Batch</span>
          </button>
        </div>
      </div>

      {/* Info Notice */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '2rem',
          backgroundColor: '#0f172a',
          borderLeft: '4px solid #38bdf8',
        }}
      >
        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#38bdf8', margin: '0 0 0.35rem 0' }}>
          Accounting Immutability Standard (ADR D8)
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: 0, lineHeight: 1.5 }}>
          When an error is corrected, the original ledger row is <strong>never modified or deleted</strong>. Instead, our service atomic transaction appends two linked rows: a <code>correction_reversal</code> row (negating the original) and a <code>correction_replacement</code> row (recording the accurate data). Pre-flight checks ensure no material drops below zero and no active customer reservation is broken.
        </p>
      </div>

      {/* Corrections Audit Table */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', marginBottom: '1.25rem' }}>
          Correction Audit Trail
        </h2>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading correction logs...</div>
        ) : corrections.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No administrative corrections recorded yet. All ledger rows remain in their original state.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Correction #</th>
                  <th>Target Type</th>
                  <th>Target ID</th>
                  <th>Reason</th>
                  <th>Authorized By</th>
                  <th>Admin Email</th>
                  <th>Timestamp</th>
                  <th>Audit Payload</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: '700', color: '#d8b4fe' }}>CORR #{c.id}</td>
                    <td>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: '#1e293b',
                          color: '#38bdf8',
                          border: '1px solid #334155',
                          textTransform: 'uppercase',
                        }}
                      >
                        {c.target_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>#{c.target_id}</td>
                    <td style={{ maxWidth: '280px', color: '#f8fafc' }}>{c.reason}</td>
                    <td style={{ color: '#10b981', fontWeight: '600' }}>{c.approved_by || '—'}</td>
                    <td style={{ color: '#94a3b8' }}>{c.admin_email}</td>
                    <td style={{ color: '#64748b' }}>{new Date(c.created_at).toLocaleString()}</td>
                    <td>
                      <details style={{ cursor: 'pointer' }}>
                        <summary style={{ color: '#38bdf8', fontSize: '0.75rem' }}>View Diffs</summary>
                        <pre style={{ backgroundColor: '#0f172a', padding: '0.5rem', borderRadius: '4px', fontSize: '0.7rem', color: '#94a3b8', margin: '0.5rem 0 0 0' }}>
                          {JSON.stringify(c.payload, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Correction Modal */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '540px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                {modalType === 'receipt' && 'Correct Material Receipt'}
                {modalType === 'damage' && 'Correct Material Damage Report'}
                {modalType === 'batch' && 'Correct Production Batch'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Target ID */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  {modalType === 'batch' ? 'Production Batch ID' : 'Material Transaction ID (Txn #)'}
                </label>
                <input
                  type="number"
                  value={form.target_id}
                  onChange={(e) => setForm({ ...form, target_id: e.target.value })}
                  className="input"
                  placeholder="e.g. 101"
                  required
                />
              </div>

              {/* Receipt / Damage inputs */}
              {modalType !== 'batch' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Corrected Quantity (kg for Film/Adhesive, pieces for Cores)
                  </label>
                  <input
                    type="text"
                    value={form.qty}
                    onChange={(e) => setForm({ ...form, qty: e.target.value })}
                    className="input"
                    placeholder="e.g. 40.000"
                    required
                  />
                </div>
              )}

              {modalType === 'receipt' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Supplier Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    className="input"
                    placeholder="e.g. Apex Polymer Co (Amended PO)"
                  />
                </div>
              )}

              {/* Production Batch inputs */}
              {modalType === 'batch' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                        Rolls Produced
                      </label>
                      <input
                        type="number"
                        value={form.rolls}
                        onChange={(e) => setForm({ ...form, rolls: e.target.value })}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                        Film Issued (kg)
                      </label>
                      <input
                        type="text"
                        value={form.film_kg}
                        onChange={(e) => setForm({ ...form, film_kg: e.target.value })}
                        className="input"
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                        Liquid Adhesive (kg)
                      </label>
                      <input
                        type="text"
                        value={form.liquid_kg}
                        onChange={(e) => setForm({ ...form, liquid_kg: e.target.value })}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                        Dry Wastage (kg)
                      </label>
                      <input
                        type="text"
                        value={form.waste_kg}
                        onChange={(e) => setForm({ ...form, waste_kg: e.target.value })}
                        className="input"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Reason (Mandatory) */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Correction Reason (Mandatory, Min 5 characters)
                </label>
                <textarea
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="e.g. Scale calibration discrepancy discovered during morning audit."
                  required
                />
              </div>

              {/* Approved By (Drill extension) */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Approved By (Sign-off Authorization)
                </label>
                <input
                  type="text"
                  value={form.approved_by}
                  onChange={(e) => setForm({ ...form, approved_by: e.target.value })}
                  className="input"
                  placeholder="e.g. Plant Manager J. Smith"
                />
              </div>

              {/* Error Box */}
              {errorMsg && (
                <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', borderRadius: '6px', color: '#fecaca', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <strong>Refusal / Error:</strong> {errorMsg}
                </div>
              )}

              {/* Success Box */}
              {successMsg && (
                <div style={{ padding: '0.75rem', backgroundColor: '#064e3b', borderRadius: '6px', color: '#a7f3d0', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {successMsg}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn btn-secondary"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Applying Compensating Entries...' : 'Commit Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
