'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { calculateBOM } from '@/lib/domain/bom';
import { checkProductionBalance } from '@/lib/domain/balance';
import { kgToMg, mgToKgString } from '@/lib/domain/units';
import { formatKg, formatPieces } from '@/lib/format';

export default function ProductionPage() {
  const [specs, setSpecs] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    batch_no: `BATCH-${Date.now().toString().slice(-6)}`,
    spec_id: '',
    rolls: 100,
    film_kg: '120.000',
    liquid_kg: '211.200',
    waste_kg: '0.000',
    shift: 'morning',
    note: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  // Load specs and batch history
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [specsRes, batchesRes] = await Promise.all([
        fetch('/api/specs'),
        fetch('/api/production'),
      ]);

      const specsData = await specsRes.json();
      const batchesData = await batchesRes.json();

      if (!specsRes.ok) throw new Error(specsData.error || 'Failed to load specs.');
      if (!batchesRes.ok) throw new Error(batchesData.error || 'Failed to load batches.');

      const loadedSpecs = specsData.specs || [];
      setSpecs(loadedSpecs);
      setBatches(batchesData.batches || []);

      // Default to dummy spec or first spec if not yet set
      if (loadedSpecs.length > 0 && !formData.spec_id) {
        const dummy = loadedSpecs.find((s) => s.code === 'SPEC-BOPP-48') || loadedSpecs[0];
        setFormData((prev) => ({ ...prev, spec_id: String(dummy.id) }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Selected spec object
  const selectedSpec = useMemo(() => {
    return specs.find((s) => String(s.id) === String(formData.spec_id)) || null;
  }, [specs, formData.spec_id]);

  // Live client-side BOM and Balance Calculation
  const liveCalculation = useMemo(() => {
    if (!selectedSpec || !formData.rolls || Number(formData.rolls) <= 0) {
      return null;
    }

    try {
      const rollsNum = Number(formData.rolls);
      const expected = calculateBOM(
        {
          width_mm: selectedSpec.width_mm,
          film_gsm: selectedSpec.film_gsm,
          coating_gsm: selectedSpec.coating_gsm,
          solids_bp: selectedSpec.solids_bp,
          roll_length_m: selectedSpec.roll_length_m,
        },
        rollsNum
      );

      const filmMg = kgToMg(formData.film_kg || '0');
      const liquidMg = kgToMg(formData.liquid_kg || '0');
      const wasteMg = kgToMg(formData.waste_kg || '0');

      const balance = checkProductionBalance({
        spec: selectedSpec,
        rolls: rollsNum,
        film_mg: filmMg,
        liquid_mg: liquidMg,
        waste_mg: wasteMg,
      });

      return {
        expected,
        balance,
        filmMg,
        liquidMg,
        wasteMg,
      };
    } catch (err) {
      return { error: err.message };
    }
  }, [selectedSpec, formData.rolls, formData.film_kg, formData.liquid_kg, formData.waste_kg]);

  // Pre-fill Golden Numbers for currently selected spec and roll count
  const handlePreFillExpected = () => {
    if (!selectedSpec) return;
    const rollsNum = Number(formData.rolls) || 100;
    const expected = calculateBOM(selectedSpec, rollsNum);

    setFormData((prev) => ({
      ...prev,
      film_kg: mgToKgString(expected.total.film_mg, 3),
      liquid_kg: mgToKgString(expected.total.liquid_adhesive_mg, 3),
      waste_kg: '0.000',
    }));
  };

  const handleSubmitBatch = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `prod-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const res = await fetch('/api/production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          batch_no: formData.batch_no.trim(),
          spec_id: Number(formData.spec_id),
          rolls: Number(formData.rolls),
          film_kg: formData.film_kg,
          liquid_kg: formData.liquid_kg,
          waste_kg: formData.waste_kg,
          shift: formData.shift,
          note: formData.note.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record production batch.');
      }

      setFormSuccess(
        `Batch '${data.batch_no}' logged successfully! Produced ${data.rolls_produced} finished rolls. Spec locked (D4).`
      );
      setFormData((prev) => ({
        ...prev,
        batch_no: `BATCH-${Date.now().toString().slice(-6)}`,
        note: '',
      }));
      loadData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header Card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.35rem', color: '#f8fafc' }}>
          Manufacturing Execution & Production Batches
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '780px' }}>
          Log tape slitting & coating batches in multi-table atomic transactions. Zero-tolerance mass balance
          verification (D3) ensures chemical mass conservation. Automatically freezes the specification upon completion (D4).
        </p>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Main Grid: Batch Entry Form + Live Balance Verification */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.75rem' }}>
        {/* Left Column: Form */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
              Log Production Batch
            </h2>
            <button
              type="button"
              onClick={handlePreFillExpected}
              disabled={!selectedSpec}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem' }}
            >
              Fill Golden BOM
            </button>
          </div>

          {formSuccess && (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#064e3b', color: '#6ee7b7', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
              ✓ {formSuccess}
            </div>
          )}

          {formError && (
            <div style={{ padding: '0.75rem 1rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
              ⚠ {formError}
            </div>
          )}

          <form onSubmit={handleSubmitBatch} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Batch Number *
                </label>
                <input
                  type="text"
                  value={formData.batch_no}
                  onChange={(e) => setFormData({ ...formData, batch_no: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Tape Specification *
                </label>
                <select
                  value={formData.spec_id}
                  onChange={(e) => setFormData({ ...formData, spec_id: e.target.value })}
                  className="input"
                  required
                >
                  {specs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} v{s.version} ({s.width_mm}mm × {s.roll_length_m}m)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Rolls to Produce *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formData.rolls}
                  onChange={(e) => setFormData({ ...formData, rolls: parseInt(e.target.value) || '' })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Operating Shift
                </label>
                <select
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                  className="input"
                >
                  <option value="morning">Morning Shift (06:00 - 14:00)</option>
                  <option value="evening">Evening Shift (14:00 - 22:00)</option>
                  <option value="night">Night Shift (22:00 - 06:00)</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Actual Film Used (kg) *
                </label>
                <input
                  type="text"
                  value={formData.film_kg}
                  onChange={(e) => setFormData({ ...formData, film_kg: e.target.value })}
                  placeholder="e.g. 120.000"
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Actual Liquid Adhesive (kg) *
                </label>
                <input
                  type="text"
                  value={formData.liquid_kg}
                  onChange={(e) => setFormData({ ...formData, liquid_kg: e.target.value })}
                  placeholder="e.g. 211.200"
                  className="input"
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                Dry Wastage (kg) - Trimmings / Edge Trim
              </label>
              <input
                type="text"
                value={formData.waste_kg}
                onChange={(e) => setFormData({ ...formData, waste_kg: e.target.value })}
                placeholder="0.000"
                className="input"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                Batch Notes (Optional)
              </label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="e.g. Line 3 operator test run"
                className="input"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (liveCalculation && !liveCalculation.balance?.isBalanced)}
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              {submitting ? 'Executing Atomic Transaction...' : 'Commit Batch & Credit Finished Stock'}
            </button>
          </form>
        </div>

        {/* Right Column: Live Expected vs Actual Comparison & Mass Balance */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
                Production Mass Balance
              </h2>
              {liveCalculation?.balance?.isBalanced ? (
                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                  ✓ 0.000 kg Balanced
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '0.75rem' }}>
                  ⚠ Imbalanced ({liveCalculation?.balance?.diff_kg_str || 'Mismatch'})
                </span>
              )}
            </div>

            {liveCalculation?.expected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Balance Status Banner */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    backgroundColor: liveCalculation.balance.isBalanced ? '#064e3b' : '#450a0a',
                    border: `1px solid ${liveCalculation.balance.isBalanced ? '#10b981' : '#ef4444'}`,
                  }}
                >
                  <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f8fafc' }}>
                    {liveCalculation.balance.isBalanced
                      ? '✓ Material Mass Conservation Satisfied (D3 Zero Tolerance)'
                      : `⚠ Production Balance Discrepancy: ${liveCalculation.balance.diff_kg_str}`}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
                    Formula: <code>film_mg × 10000 + liquid_mg × {selectedSpec.solids_bp} == (net_tape + waste) × 10000</code>
                  </div>
                </div>

                {/* Film Comparison */}
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#cbd5e1' }}>BOPP Film</span>
                    <span style={{ fontWeight: '600', color: '#38bdf8' }}>
                      Actual: {formatKg(liveCalculation.filmMg)} | Expected: {liveCalculation.expected.total.display.film_kg}
                    </span>
                  </div>
                </div>

                {/* Liquid Adhesive Comparison */}
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#cbd5e1' }}>Liquid Adhesive</span>
                    <span style={{ fontWeight: '600', color: '#38bdf8' }}>
                      Actual: {formatKg(liveCalculation.liquidMg)} | Expected: {liveCalculation.expected.total.display.liquid_adhesive_kg}
                    </span>
                  </div>
                </div>

                {/* Paper Cores */}
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#cbd5e1' }}>Paper Cores Required</span>
                    <span style={{ fontWeight: '600', color: '#f8fafc' }}>
                      {liveCalculation.expected.total.display.cores} (1 core per roll)
                    </span>
                  </div>
                </div>

                {/* Finished Output Summary */}
                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: '#cbd5e1' }}>Finished Output (Net Tape)</span>
                    <span style={{ fontWeight: '700', color: '#4ade80' }}>
                      {liveCalculation.expected.total.display.net_tape_kg} ({liveCalculation.expected.total.display.metres})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Select a specification and specify rolls to see live calculations.
              </div>
            )}
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #334155', fontSize: '0.75rem', color: '#94a3b8' }}>
            Section 4 Golden Numbers for <strong>100 rolls</strong>: Film 120.000 kg, Liquid Adhesive 211.200 kg (50% solids), Cores 100, Net Tape 225.600 kg.
          </div>
        </div>
      </div>

      {/* Production Batch History Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
              Production Batch Log
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Historical tape slitting and coating runs with mass balance audit metrics.
            </p>
          </div>
          <button onClick={loadData} className="btn btn-secondary btn-sm" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading && batches.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading batch history...
          </div>
        ) : batches.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No batches logged yet. Use the form above to log the first production run.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Batch #</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Spec</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Rolls Produced</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Actual Film / Liquid</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Dry Waste</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Balance Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Operator</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', color: '#38bdf8', fontFamily: 'monospace' }}>
                      {batch.batch_no}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {batch.created_at ? new Date(batch.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#f8fafc' }}>
                      {batch.spec_code}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '700', color: '#4ade80' }}>
                      {batch.rolls_formatted}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      <div>Film: {batch.film_kg_str}</div>
                      <div>Adhesive: {batch.liquid_kg_str}</div>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {batch.waste_kg_str}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                        ✓ {batch.diff_kg_str} kg (Exact)
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: '#94a3b8' }}>
                      {batch.user_email}
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
