'use client';

import { useState, useEffect, useCallback } from 'react';

export default function SpecsPage() {
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    code: 'SPEC-BOPP-48',
    name: 'Standard 48mm BOPP Packaging Tape',
    width_mm: 48,
    film_gsm: 25,
    coating_gsm: 22,
    solids_percent: '50.00',
    roll_length_m: 1000,
  });

  // Roll multiplier for BOM preview
  const [previewRolls, setPreviewRolls] = useState(1);
  const [previewData, setPreviewData] = useState(null);
  const [calculatingPreview, setCalculatingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(null);
  const [formError, setFormError] = useState(null);

  // Version creation modal state
  const [versionParent, setVersionParent] = useState(null);
  const [versionFormData, setVersionFormData] = useState({
    name: '',
    width_mm: 48,
    film_gsm: 25,
    coating_gsm: 22,
    solids_percent: '50.00',
    roll_length_m: 1000,
  });
  const [versionSubmitting, setVersionSubmitting] = useState(false);
  const [versionError, setVersionError] = useState(null);

  // Expanded spec detail view
  const [expandedSpecId, setExpandedSpecId] = useState(null);

  // Fetch all specs from server
  const loadSpecs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/specs');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch specifications.');
      }
      setSpecs(data.specs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSpecs();
  }, [loadSpecs]);

  // Server-authoritative preview calculation
  const updateBOMPreview = useCallback(async (form, rolls) => {
    setCalculatingPreview(true);
    try {
      const res = await fetch('/api/specs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          width_mm: Number(form.width_mm),
          film_gsm: Number(form.film_gsm),
          coating_gsm: Number(form.coating_gsm),
          solids_percent: form.solids_percent,
          roll_length_m: Number(form.roll_length_m),
          rolls: Number(rolls) || 1,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreviewData(data.preview);
        setFormError(null);
      } else {
        setPreviewData(null);
        setFormError(data.error);
      }
    } catch (err) {
      setPreviewData(null);
      setFormError('Failed to communicate with BOM calculation engine.');
    } finally {
      setCalculatingPreview(false);
    }
  }, []);

  // Update preview whenever form values or preview roll count change
  useEffect(() => {
    const timer = setTimeout(() => {
      updateBOMPreview(formData, previewRolls);
    }, 250);
    return () => clearTimeout(timer);
  }, [formData, previewRolls, updateBOMPreview]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleCreateSpec = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim() || undefined,
        width_mm: Number(formData.width_mm),
        film_gsm: Number(formData.film_gsm),
        coating_gsm: Number(formData.coating_gsm),
        solids_percent: formData.solids_percent,
        roll_length_m: Number(formData.roll_length_m),
      };

      const res = await fetch('/api/specs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create specification.');
      }

      setFormSuccess(`Specification '${data.spec.code}' v${data.spec.version} created successfully!`);
      loadSpecs();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Version modal pre-filled with parent spec data
  const openVersionModal = (parentSpec) => {
    setVersionParent(parentSpec);
    setVersionFormData({
      name: `${parentSpec.code} (v${parentSpec.version + 1})`,
      width_mm: parentSpec.width_mm,
      film_gsm: parentSpec.film_gsm,
      coating_gsm: parentSpec.coating_gsm,
      solids_percent: parentSpec.solids_percent_str,
      roll_length_m: parentSpec.roll_length_m,
    });
    setVersionError(null);
  };

  const handleCreateVersion = async (e) => {
    e.preventDefault();
    if (!versionParent) return;

    setVersionSubmitting(true);
    setVersionError(null);

    try {
      const payload = {
        name: versionFormData.name.trim() || undefined,
        width_mm: Number(versionFormData.width_mm),
        film_gsm: Number(versionFormData.film_gsm),
        coating_gsm: Number(versionFormData.coating_gsm),
        solids_percent: versionFormData.solids_percent,
        roll_length_m: Number(versionFormData.roll_length_m),
      };

      const res = await fetch(`/api/specs/${versionParent.id}/version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create new version.');
      }

      setVersionParent(null);
      loadSpecs();
    } catch (err) {
      setVersionError(err.message);
    } finally {
      setVersionSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page Title & Context */}
      <div className="card" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.35rem', color: '#f8fafc' }}>
              Tape Specifications & BOM Engine
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '780px' }}>
              Define immutable tape recipes (D4) and calculate authoritative Bills of Materials (BOM) in integer
              milligrams. Pre-calculates exact per-roll weight snapshots for film, dry adhesive, liquid adhesive, and cores.
            </p>
          </div>
          <button
            onClick={() => {
              setFormData({
                code: 'SPEC-BOPP-48',
                name: 'Standard 48mm BOPP Packaging Tape',
                width_mm: 48,
                film_gsm: 25,
                coating_gsm: 22,
                solids_percent: '50.00',
                roll_length_m: 1000,
              });
              setPreviewRolls(1);
            }}
            className="btn btn-secondary btn-sm"
          >
            Reset Golden Numbers
          </button>
        </div>
      </div>

      {/* Main Grid: Live Interactive BOM Calculator + Form */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.75rem' }}>
        {/* Left Column: Spec Definition Form */}
        <div className="card">
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '1.25rem', color: '#f1f5f9' }}>
            Create New Specification
          </h2>

          {formSuccess && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#064e3b',
                color: '#6ee7b7',
                borderRadius: '6px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              ✓ {formSuccess}
            </div>
          )}

          {formError && (
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#450a0a',
                color: '#fca5a5',
                borderRadius: '6px',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              ⚠ {formError}
            </div>
          )}

          <form onSubmit={handleCreateSpec} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Spec Code *
                </label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  className="input"
                  placeholder="e.g. SPEC-BOPP-48"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Tape Width (mm) *
                </label>
                <input
                  type="number"
                  name="width_mm"
                  min="1"
                  step="1"
                  value={formData.width_mm}
                  onChange={handleInputChange}
                  required
                  className="input"
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                Specification Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="input"
                placeholder="e.g. Standard 48mm BOPP Tape"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  BOPP Film GSM *
                </label>
                <input
                  type="number"
                  name="film_gsm"
                  min="1"
                  step="1"
                  value={formData.film_gsm}
                  onChange={handleInputChange}
                  required
                  className="input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Dry Coating GSM *
                </label>
                <input
                  type="number"
                  name="coating_gsm"
                  min="1"
                  step="1"
                  value={formData.coating_gsm}
                  onChange={handleInputChange}
                  required
                  className="input"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Adhesive Solids % *
                </label>
                <input
                  type="text"
                  name="solids_percent"
                  value={formData.solids_percent}
                  onChange={handleInputChange}
                  required
                  className="input"
                  placeholder="e.g. 50.00"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Roll Length (m) *
                </label>
                <input
                  type="number"
                  name="roll_length_m"
                  min="1"
                  step="1"
                  value={formData.roll_length_m}
                  onChange={handleInputChange}
                  required
                  className="input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || (previewData && previewData.hasFractionalLiquidMg)}
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', width: '100%' }}
            >
              {submitting ? 'Creating Specification...' : 'Save & Freeze Specification'}
            </button>
          </form>
        </div>

        {/* Right Column: Live Server-Authoritative BOM Preview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
                Live BOM Breakdown
              </h2>
              {calculatingPreview ? (
                <span style={{ fontSize: '0.75rem', color: '#38bdf8' }}>Calculating...</span>
              ) : previewData?.hasFractionalLiquidMg ? (
                <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                  ⚠ Fractional mg (D6 Shortage)
                </span>
              ) : (
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                  ✓ Exact Whole mg (D6 Valid)
                </span>
              )}
            </div>

            {/* Quick Rolls Multiplier Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Preview Quantity:</span>
              <button
                type="button"
                onClick={() => setPreviewRolls(1)}
                className={`btn btn-sm ${previewRolls === 1 ? 'btn-primary' : 'btn-secondary'}`}
              >
                1 Roll
              </button>
              <button
                type="button"
                onClick={() => setPreviewRolls(100)}
                className={`btn btn-sm ${previewRolls === 100 ? 'btn-primary' : 'btn-secondary'}`}
              >
                100 Rolls (Golden Test)
              </button>
              <input
                type="number"
                min="1"
                step="1"
                value={previewRolls}
                onChange={(e) => setPreviewRolls(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '80px',
                  padding: '0.35rem 0.5rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  color: '#fff',
                  fontSize: '0.85rem',
                }}
              />
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>rolls</span>
            </div>

            {previewData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Film Card */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>
                      BOPP Film (mg)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Area: {previewData.perRoll.area_m2} m² × {formData.film_gsm} GSM
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#38bdf8' }}>
                      {previewData.total.display.film_kg}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {previewData.perRoll.display.film_kg} / roll
                    </div>
                  </div>
                </div>

                {/* Dry Adhesive Card */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>
                      Dry Adhesive Coating
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Area: {previewData.perRoll.area_m2} m² × {formData.coating_gsm} GSM
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#38bdf8' }}>
                      {previewData.total.display.dry_adhesive_kg}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {previewData.perRoll.display.dry_adhesive_kg} / roll
                    </div>
                  </div>
                </div>

                {/* Liquid Adhesive Card */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>
                      Liquid Adhesive (Input)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Dry coat / ({previewData.solids_percent_str} solids)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#38bdf8' }}>
                      {previewData.total.display.liquid_adhesive_kg}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {previewData.perRoll.display.liquid_adhesive_kg} / roll
                    </div>
                  </div>
                </div>

                {/* Net Tape Weight Card */}
                <div
                  style={{
                    padding: '0.85rem 1rem',
                    background: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#f8fafc', fontSize: '0.9rem' }}>
                      Net Tape Weight (Finished)
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      Film + Dry adhesive (core excluded)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#4ade80' }}>
                      {previewData.total.display.net_tape_kg}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {previewData.perRoll.display.net_tape_kg} / roll
                    </div>
                  </div>
                </div>

                {/* Cores & Metres */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Paper Cores</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#e2e8f0' }}>
                      {previewData.total.display.cores}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Metres</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#e2e8f0' }}>
                      {previewData.total.display.metres}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Adjust parameters on the left to see live BOM calculations.
              </div>
            )}
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #334155' }}>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Golden check for <strong>48mm × 25 GSM film × 22 GSM coat × 50% solids × 1,000m</strong>:
              1 roll = 1.200 kg film / 1.056 kg dry adhesive / 2.112 kg liquid adhesive / 2.256 kg net tape / 1 core.
            </p>
          </div>
        </div>
      </div>

      {/* Specifications Repository Table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f1f5f9' }}>
              Registered Tape Specifications
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Active and historic recipes with immutable lock status (D4).
            </p>
          </div>
          <button onClick={loadSpecs} className="btn btn-secondary btn-sm" disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh List'}
          </button>
        </div>

        {error && (
          <div style={{ padding: '1rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '6px', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading && specs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading specifications...
          </div>
        ) : specs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No specifications registered yet. Use the form above to create the dummy specification.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Code & Version</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Name</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Dimensions</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Film / Coat GSM</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Solids %</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Per Roll Snapshot</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((spec) => (
                  <tr
                    key={spec.id}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: '600', color: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{spec.code}</span>
                        <span className="badge badge-staff" style={{ fontSize: '0.65rem' }}>
                          v{spec.version}
                        </span>
                      </div>
                      {spec.parent_spec_id && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          from parent #{spec.parent_spec_id}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {spec.name}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {spec.width_mm} mm × {spec.roll_length_m} m
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {spec.film_gsm} / {spec.coating_gsm} GSM
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      {spec.solids_percent_str}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', color: '#cbd5e1' }}>
                      <div>Film: {spec.film_kg_str}</div>
                      <div>Liquid: {spec.liquid_adhesive_kg_str}</div>
                      <div style={{ fontWeight: '600', color: '#4ade80' }}>
                        Net: {spec.net_tape_kg_str}
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {spec.is_locked ? (
                        <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                          🔒 Locked (D4)
                        </span>
                      ) : (
                        <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                          🟢 Unlocked
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          onClick={() => setExpandedSpecId(expandedSpecId === spec.id ? null : spec.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          {expandedSpecId === spec.id ? 'Hide' : 'Details'}
                        </button>
                        <button
                          onClick={() => openVersionModal(spec)}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                        >
                          + New Version
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detailed Snapshot Drawer / Box */}
        {expandedSpecId && (
          <div
            style={{
              marginTop: '1.25rem',
              padding: '1.25rem',
              backgroundColor: '#0f172a',
              borderRadius: '8px',
              border: '1px solid #334155',
            }}
          >
            {(() => {
              const spec = specs.find((s) => s.id === expandedSpecId);
              if (!spec) return null;
              return (
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.5rem' }}>
                    Integer Milligram Snapshot for {spec.code} (v{spec.version})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Film mg/roll: </span>
                      <strong style={{ color: '#38bdf8' }}>{Number(spec.film_mg_per_roll).toLocaleString()} mg</strong>
                      <span style={{ color: '#64748b' }}> ({spec.film_kg_str})</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Dry Adhesive mg/roll: </span>
                      <strong style={{ color: '#38bdf8' }}>{Number(spec.dry_adhesive_mg_per_roll).toLocaleString()} mg</strong>
                      <span style={{ color: '#64748b' }}> ({spec.dry_adhesive_kg_str})</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Liquid Adhesive mg/roll: </span>
                      <strong style={{ color: '#38bdf8' }}>{Number(spec.liquid_adhesive_mg_per_roll).toLocaleString()} mg</strong>
                      <span style={{ color: '#64748b' }}> ({spec.liquid_adhesive_kg_str})</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Net Tape mg/roll: </span>
                      <strong style={{ color: '#4ade80' }}>{Number(spec.net_tape_mg_per_roll).toLocaleString()} mg</strong>
                      <span style={{ color: '#64748b' }}> ({spec.net_tape_kg_str})</span>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Paper Core Pieces: </span>
                      <strong style={{ color: '#f8fafc' }}>{spec.core_pieces_per_roll} core</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Lock Status: </span>
                      <strong style={{ color: spec.is_locked ? '#f59e0b' : '#10b981' }}>
                        {spec.is_locked ? `Locked at ${new Date(spec.locked_at).toLocaleString()}` : 'Unlocked / Mutable'}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create Version Modal */}
      {versionParent && (
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
              maxWidth: '540px',
              width: '100%',
              backgroundColor: '#1e293b',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>
                Clone Spec into Version {versionParent.version + 1}
              </h3>
              <button
                type="button"
                onClick={() => setVersionParent(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.25rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Creating a new version clones parent spec <strong>{versionParent.code} (v{versionParent.version})</strong> with
              a link to <code style={{ color: '#38bdf8' }}>parent_spec_id: {versionParent.id}</code>. Existing production batches
              and orders will continue referencing version {versionParent.version} (D4).
            </p>

            {versionError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#450a0a', color: '#fca5a5', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {versionError}
              </div>
            )}

            <form onSubmit={handleCreateVersion} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Version Name / Description
                </label>
                <input
                  type="text"
                  value={versionFormData.name}
                  onChange={(e) => setVersionFormData({ ...versionFormData, name: e.target.value })}
                  className="input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Tape Width (mm)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={versionFormData.width_mm}
                    onChange={(e) => setVersionFormData({ ...versionFormData, width_mm: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Roll Length (m)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={versionFormData.roll_length_m}
                    onChange={(e) => setVersionFormData({ ...versionFormData, roll_length_m: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Film GSM
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={versionFormData.film_gsm}
                    onChange={(e) => setVersionFormData({ ...versionFormData, film_gsm: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Coating GSM
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={versionFormData.coating_gsm}
                    onChange={(e) => setVersionFormData({ ...versionFormData, coating_gsm: e.target.value })}
                    className="input"
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Solids %
                </label>
                <input
                  type="text"
                  value={versionFormData.solids_percent}
                  onChange={(e) => setVersionFormData({ ...versionFormData, solids_percent: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setVersionParent(null)}
                  className="btn btn-secondary"
                  disabled={versionSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={versionSubmitting}
                >
                  {versionSubmitting ? 'Creating Version...' : `Save as Version ${versionParent.version + 1}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
