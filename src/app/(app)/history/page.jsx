'use client';

import { useState, useEffect, useCallback } from 'react';

export default function HistoryPage() {
  const [events, setEvents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery.trim().length > 0) params.set('search', searchQuery.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotalCount(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHistory();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchHistory]);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (categoryFilter !== 'all') params.set('category', categoryFilter);
    if (searchQuery.trim().length > 0) params.set('search', searchQuery.trim());
    params.set('format', 'csv');

    window.open(`/api/history?${params.toString()}`, '_blank');
  };

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', marginBottom: '0.25rem' }}>
            Unified Audit History & Compliance Stream
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Full immutable forensic timeline aggregating raw materials, production batches, customer dispatches, and administrative corrections.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
        >
          <span>📥 Export to CSV (RFC-4180)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Category Chips */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Events' },
              { id: 'materials', label: 'Raw Materials' },
              { id: 'production', label: 'Manufacturing' },
              { id: 'dispatches', label: 'Order Dispatches' },
              { id: 'corrections', label: 'Admin Corrections' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  border: '1px solid',
                  cursor: 'pointer',
                  backgroundColor: categoryFilter === tab.id ? '#38bdf8' : '#1e293b',
                  color: categoryFilter === tab.id ? '#0f172a' : '#94a3b8',
                  borderColor: categoryFilter === tab.id ? '#38bdf8' : '#334155',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ minWidth: '240px' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, note, user..."
              className="input"
              style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
            />
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Showing <strong>{events.length}</strong> of <strong>{totalCount}</strong> recorded events
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading chronological audit stream...</div>
        ) : events.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
            No audit records match the selected filter criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Timestamp</th>
                  <th>Category</th>
                  <th>Action / Type</th>
                  <th>Reference</th>
                  <th>Quantity / Impact</th>
                  <th>Note / Reason</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const categoryBadgeColor =
                    e.category === 'materials'
                      ? '#38bdf8'
                      : e.category === 'production'
                      ? '#f59e0b'
                      : e.category === 'dispatches'
                      ? '#10b981'
                      : '#d8b4fe';

                  const deltaColor =
                    e.delta_direction === 'inflow'
                      ? '#10b981'
                      : e.delta_direction === 'outflow'
                      ? '#ef4444'
                      : '#94a3b8';

                  return (
                    <tr key={e.id}>
                      <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{e.id}</td>
                      <td style={{ color: '#cbd5e1', whiteSpace: 'nowrap' }}>
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span
                          style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: '700',
                            backgroundColor: `${categoryBadgeColor}15`,
                            color: categoryBadgeColor,
                            border: `1px solid ${categoryBadgeColor}35`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {e.category}
                        </span>
                      </td>
                      <td style={{ fontWeight: '600' }}>{e.event_type.replace('_', ' ')}</td>
                      <td style={{ fontWeight: '700', color: '#f8fafc' }}>{e.reference}</td>
                      <td style={{ fontWeight: '700', color: deltaColor, fontFamily: 'monospace' }}>
                        {e.quantity_formatted}
                      </td>
                      <td style={{ maxWidth: '280px', color: '#cbd5e1' }}>{e.note || '—'}</td>
                      <td style={{ color: '#64748b' }}>{e.user_email}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
