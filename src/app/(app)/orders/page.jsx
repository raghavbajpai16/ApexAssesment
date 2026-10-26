'use client';

import { useState, useEffect, useCallback } from 'react';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // New Order Form state
  const [orderForm, setOrderForm] = useState({
    customer_id: '',
    spec_id: '',
    input_unit: 'rolls',
    input_qty: '',
    note: '',
  });
  const [orderIdempotencyKey, setOrderIdempotencyKey] = useState('');
  const [conversionPreview, setConversionPreview] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(null);

  // Dispatch Form state
  const [dispatchForm, setDispatchForm] = useState({ rolls: 1, note: '' });
  const [dispatchSubmitting, setDispatchSubmitting] = useState(false);
  const [dispatchError, setDispatchError] = useState(null);

  // Cancel Form state
  const [cancelForm, setCancelForm] = useState({ reason: '' });
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Audit state
  const [reconcileAudit, setReconcileAudit] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  // Fetch orders, customers, specs
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, custRes, specsRes] = await Promise.all([
        fetch(`/api/orders${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`),
        fetch('/api/customers'),
        fetch('/api/specs'),
      ]);

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
      }
      if (custRes.ok) {
        const data = await custRes.json();
        setCustomers(data.customers || []);
      }
      if (specsRes.ok) {
        const data = await specsRes.json();
        setSpecs(data.specs || []);
      }
    } catch (err) {
      console.error('Failed to load orders data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute live conversion preview when orderForm changes
  useEffect(() => {
    if (!orderForm.spec_id || !orderForm.input_qty || isNaN(parseFloat(orderForm.input_qty))) {
      setConversionPreview(null);
      return;
    }

    const selectedSpec = specs.find((s) => s.id === Number(orderForm.spec_id));
    if (!selectedSpec) return;

    const lengthM = Number(selectedSpec.roll_length_m);
    const netMgPerRoll = BigInt(selectedSpec.net_tape_mg_per_roll || 0);

    const unit = orderForm.input_unit;
    const qtyNum = parseFloat(orderForm.input_qty);

    if (qtyNum <= 0) {
      setConversionPreview(null);
      return;
    }

    if (unit === 'rolls') {
      const isInteger = Number.isInteger(qtyNum);
      if (!isInteger) {
        setConversionPreview({
          isValid: false,
          error: 'Rolls must be a positive whole integer.',
          alternatives: [
            { rolls: Math.floor(qtyNum), label: `${Math.floor(qtyNum)} rolls` },
            { rolls: Math.ceil(qtyNum), label: `${Math.ceil(qtyNum)} rolls` },
          ],
        });
        return;
      }
      const rolls = BigInt(Math.floor(qtyNum));
      const totalMetres = Number(rolls) * lengthM;
      const totalNetKg = (Number(rolls * netMgPerRoll) / 1000000).toFixed(3);
      setConversionPreview({
        isValid: true,
        rolls: Number(rolls),
        totalMetres,
        totalNetKg,
      });
    } else if (unit === 'metres') {
      const metres = Math.floor(qtyNum);
      if (metres % lengthM === 0) {
        const rolls = metres / lengthM;
        const totalNetKg = ((rolls * Number(netMgPerRoll)) / 1000000).toFixed(3);
        setConversionPreview({
          isValid: true,
          rolls,
          totalMetres: metres,
          totalNetKg,
        });
      } else {
        const lowerRolls = Math.floor(metres / lengthM);
        const upperRolls = lowerRolls + 1;
        setConversionPreview({
          isValid: false,
          error: `${metres.toLocaleString()} m is not a multiple of roll length (${lengthM.toLocaleString()} m).`,
          alternatives: [
            ...(lowerRolls > 0
              ? [{ rolls: lowerRolls, metres: lowerRolls * lengthM, label: `${(lowerRolls * lengthM).toLocaleString()} m (${lowerRolls} roll${lowerRolls === 1 ? '' : 's'})` }]
              : []),
            { rolls: upperRolls, metres: upperRolls * lengthM, label: `${(upperRolls * lengthM).toLocaleString()} m (${upperRolls} rolls)` },
          ],
        });
      }
    } else if (unit === 'kg') {
      const inputMg = Math.round(qtyNum * 1000000);
      const netMg = Number(netMgPerRoll);
      if (inputMg % netMg === 0) {
        const rolls = inputMg / netMg;
        setConversionPreview({
          isValid: true,
          rolls,
          totalMetres: rolls * lengthM,
          totalNetKg: qtyNum.toFixed(3),
        });
      } else {
        const lowerRolls = Math.floor(inputMg / netMg);
        const upperRolls = lowerRolls + 1;
        const lowerKg = ((lowerRolls * netMg) / 1000000).toFixed(3);
        const upperKg = ((upperRolls * netMg) / 1000000).toFixed(3);
        setConversionPreview({
          isValid: false,
          error: `${qtyNum.toFixed(3)} kg does not match exact roll net weight (${(netMg / 1000000).toFixed(3)} kg/roll).`,
          alternatives: [
            ...(lowerRolls > 0
              ? [{ rolls: lowerRolls, kg: lowerKg, label: `${lowerKg} kg (${lowerRolls} roll${lowerRolls === 1 ? '' : 's'})` }]
              : []),
            { rolls: upperRolls, kg: upperKg, label: `${upperKg} kg (${upperRolls} rolls)` },
          ],
        });
      }
    }
  }, [orderForm, specs]);

  // Open Order Modal
  const handleOpenOrderModal = () => {
    setOrderForm({
      customer_id: customers.length > 0 ? customers[0].id : '',
      spec_id: specs.length > 0 ? specs[0].id : '',
      input_unit: 'rolls',
      input_qty: '10',
      note: '',
    });
    setOrderIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `order-key-${Date.now()}`);
    setOrderError(null);
    setOrderSuccess(null);
    setShowOrderModal(true);
  };

  // Submit Order Form
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setOrderSubmitting(true);
    setOrderError(null);
    setOrderSuccess(null);

    try {
      const payload = {
        customer_id: Number(orderForm.customer_id),
        spec_id: Number(orderForm.spec_id),
        input_qty: orderForm.input_qty,
        input_unit: orderForm.input_unit,
        note: orderForm.note || null,
      };

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': orderIdempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details?.alternatives) {
          setOrderError({
            message: data.error,
            alternatives: data.details.alternatives,
          });
        } else {
          setOrderError({ message: data.error || 'Failed to place order' });
        }
        return;
      }

      setOrderSuccess(`Order #${data.order_no} created successfully! Reserved ${data.rolls_ordered_formatted}.`);
      fetchData();
      setTimeout(() => {
        setShowOrderModal(false);
      }, 1500);
    } catch (err) {
      setOrderError({ message: err.message || 'Network error occurred' });
    } finally {
      setOrderSubmitting(false);
    }
  };

  // Open Dispatch Modal
  const handleOpenDispatchModal = (order) => {
    setSelectedOrder(order);
    setDispatchForm({
      rolls: order.remaining_rolls,
      note: '',
    });
    setDispatchError(null);
    setShowDispatchModal(true);
  };

  // Submit Dispatch
  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setDispatchSubmitting(true);
    setDispatchError(null);

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/dispatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `dispatch-${Date.now()}`,
        },
        body: JSON.stringify({
          rolls: Number(dispatchForm.rolls),
          note: dispatchForm.note || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setDispatchError(data.error || 'Failed to dispatch order');
        return;
      }

      setShowDispatchModal(false);
      fetchData();
    } catch (err) {
      setDispatchError(err.message || 'Network error occurred');
    } finally {
      setDispatchSubmitting(false);
    }
  };

  // Open Cancel Modal
  const handleOpenCancelModal = (order) => {
    setSelectedOrder(order);
    setCancelForm({ reason: '' });
    setCancelError(null);
    setShowCancelModal(true);
  };

  // Submit Cancel
  const handleCancelSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    setCancelSubmitting(true);
    setCancelError(null);

    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `cancel-${Date.now()}`,
        },
        body: JSON.stringify({
          reason: cancelForm.reason || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCancelError(data.error || 'Failed to cancel order');
        return;
      }

      setShowCancelModal(false);
      fetchData();
    } catch (err) {
      setCancelError(err.message || 'Network error occurred');
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Run Reconcile Audit
  const handleRunReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch('/api/orders/reconcile');
      if (res.ok) {
        const data = await res.json();
        setReconcileAudit(data);
      } else {
        const err = await res.json();
        alert(`Audit failed: ${err.error || 'Access denied'}`);
      }
    } catch (err) {
      alert(`Audit network error: ${err.message}`);
    } finally {
      setReconciling(false);
    }
  };

  // Metrics
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'partially_dispatched').length;
  const totalReservedRolls = orders.reduce((sum, o) => sum + (o.remaining_rolls || 0), 0);
  const completedOrders = orders.filter((o) => o.status === 'completed').length;

  return (
    <div style={{ padding: '2rem 1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc', marginBottom: '0.25rem' }}>
            Customer Orders & Fulfillment
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
            Multi-unit order intake (rolls, linear metres, net kg), pessimistic stock reservations, partial dispatches, and balance releases.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleRunReconcile}
            disabled={reconciling}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
          >
            <span>{reconciling ? 'Auditing...' : '⚖️ Reconcile Invariants 2 & 3'}</span>
          </button>

          <button
            onClick={handleOpenOrderModal}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>➕ Place New Order</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Total Orders</span>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc', marginTop: '0.25rem' }}>{totalOrders}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Active Open Orders</span>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b', marginTop: '0.25rem' }}>{pendingOrders}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Rolls Currently Reserved</span>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#38bdf8', marginTop: '0.25rem' }}>{totalReservedRolls} rolls</div>
        </div>
        <div className="card" style={{ padding: '1.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>Fully Fulfilled</span>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginTop: '0.25rem' }}>{completedOrders}</div>
        </div>
      </div>

      {/* Reconcile Audit Result Panel */}
      {reconcileAudit && (
        <div
          className="card"
          style={{
            marginBottom: '2rem',
            padding: '1.25rem',
            borderLeft: `4px solid ${reconcileAudit.is_reconciled ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.2rem' }}>{reconcileAudit.is_reconciled ? '✅' : '❌'}</span>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
                Invariants 2 & 3 Audit: {reconcileAudit.is_reconciled ? 'Reconciled & Intact' : 'Discrepancy Detected'}
              </h3>
            </div>
            <button
              onClick={() => setReconcileAudit(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>
            Verified that <code>finished_stock.reserved_rolls == SUM(open orders)</code> and all order balances satisfy <code>shipped + cancelled &lt;= ordered</code>.
          </p>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Audited at: {new Date(reconcileAudit.verified_at).toLocaleString()} | Specs Checked: {reconcileAudit.specs?.length || 0}
          </div>
        </div>
      )}

      {/* Filter Tabs & Orders Table */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc', margin: 0 }}>
            Order Registry & Fulfillment
          </h2>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {['all', 'pending', 'partially_dispatched', 'completed', 'cancelled'].map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  border: '1px solid',
                  cursor: 'pointer',
                  backgroundColor: statusFilter === tab ? '#38bdf8' : '#1e293b',
                  color: statusFilter === tab ? '#0f172a' : '#94a3b8',
                  borderColor: statusFilter === tab ? '#38bdf8' : '#334155',
                }}
              >
                {tab === 'all'
                  ? 'All Orders'
                  : tab === 'partially_dispatched'
                  ? 'Partially Shipped'
                  : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading customer orders...</div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            No orders found matching the selected filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Specification</th>
                  <th>Customer Input</th>
                  <th>Rolls (Ord / Ship / Can / Rem)</th>
                  <th>Linear Metres</th>
                  <th>Net Weight</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const statusColor =
                    o.status === 'completed'
                      ? '#10b981'
                      : o.status === 'partially_dispatched'
                      ? '#38bdf8'
                      : o.status === 'cancelled'
                      ? '#64748b'
                      : '#f59e0b';

                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: '700', color: '#38bdf8' }}>{o.order_no}</td>
                      <td style={{ fontWeight: '600' }}>{o.customer_name}</td>
                      <td>
                        <span style={{ fontWeight: '600', color: '#f8fafc' }}>{o.spec_code}</span>
                      </td>
                      <td>
                        {o.input_qty} {o.input_unit}
                      </td>
                      <td>
                        <span style={{ fontWeight: '700', color: '#f8fafc' }}>{o.rolls_ordered}</span>
                        {' / '}
                        <span style={{ color: '#10b981' }}>{o.rolls_dispatched}</span>
                        {' / '}
                        <span style={{ color: '#ef4444' }}>{o.rolls_cancelled}</span>
                        {' / '}
                        <span style={{ fontWeight: '700', color: o.remaining_rolls > 0 ? '#f59e0b' : '#64748b' }}>
                          {o.remaining_rolls}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace' }}>{o.total_metres_str}</td>
                      <td style={{ fontFamily: 'monospace' }}>{o.total_net_kg_str}</td>
                      <td>
                        <span
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            backgroundColor: `${statusColor}20`,
                            color: statusColor,
                            border: `1px solid ${statusColor}40`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {o.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {o.remaining_rolls > 0 ? (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => handleOpenDispatchModal(o)}
                              className="btn btn-primary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              Dispatch
                            </button>
                            <button
                              onClick={() => handleOpenCancelModal(o)}
                              className="btn btn-secondary"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#ef4444' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Place New Order */}
      {showOrderModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '580px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                Place New Customer Order
              </h2>
              <button
                onClick={() => setShowOrderModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleOrderSubmit}>
              {/* Customer Selection */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Customer
                </label>
                <select
                  value={orderForm.customer_id}
                  onChange={(e) => setOrderForm({ ...orderForm, customer_id: e.target.value })}
                  className="input"
                  required
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Spec Selection */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Tape Specification
                </label>
                <select
                  value={orderForm.spec_id}
                  onChange={(e) => setOrderForm({ ...orderForm, spec_id: e.target.value })}
                  className="input"
                  required
                >
                  {specs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({s.roll_length_m}m, {(Number(s.net_tape_mg_per_roll) / 1000000).toFixed(3)}kg/roll)
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Selection & Quantity Input */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Order Unit
                  </label>
                  <select
                    value={orderForm.input_unit}
                    onChange={(e) => setOrderForm({ ...orderForm, input_unit: e.target.value })}
                    className="input"
                  >
                    <option value="rolls">Rolls (pcs)</option>
                    <option value="metres">Linear Metres (m)</option>
                    <option value="kg">Net Kilograms (kg)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                    Quantity
                  </label>
                  <input
                    type="text"
                    value={orderForm.input_qty}
                    onChange={(e) => setOrderForm({ ...orderForm, input_qty: e.target.value })}
                    className="input"
                    placeholder="e.g. 100 or 100000 or 225.600"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Conversion Preview & Alternatives */}
              {conversionPreview && (
                <div
                  style={{
                    backgroundColor: conversionPreview.isValid ? '#0f172a' : '#450a0a',
                    border: `1px solid ${conversionPreview.isValid ? '#1e293b' : '#991b1b'}`,
                    borderRadius: '6px',
                    padding: '0.85rem',
                    marginBottom: '1rem',
                    fontSize: '0.85rem',
                  }}
                >
                  {conversionPreview.isValid ? (
                    <div>
                      <div style={{ color: '#10b981', fontWeight: '700', marginBottom: '0.35rem' }}>
                        ✓ Converted Order Snapshot:
                      </div>
                      <div style={{ display: 'flex', gap: '1.25rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                        <span>
                          <strong>{conversionPreview.rolls}</strong> rolls
                        </span>
                        <span>
                          <strong>{conversionPreview.totalMetres?.toLocaleString()}</strong> m
                        </span>
                        <span>
                          <strong>{conversionPreview.totalNetKg}</strong> kg net
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color: '#f87171', fontWeight: '700', marginBottom: '0.35rem' }}>
                        ⚠️ Invalid Order Quantity:
                      </div>
                      <p style={{ color: '#fca5a5', margin: '0 0 0.5rem 0' }}>{conversionPreview.error}</p>

                      {conversionPreview.alternatives?.length > 0 && (
                        <div>
                          <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Valid Whole-Roll Alternatives:</span>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                            {conversionPreview.alternatives.map((alt, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (orderForm.input_unit === 'rolls') setOrderForm({ ...orderForm, input_qty: String(alt.rolls) });
                                  else if (orderForm.input_unit === 'metres') setOrderForm({ ...orderForm, input_qty: String(alt.metres) });
                                  else if (orderForm.input_unit === 'kg') setOrderForm({ ...orderForm, input_qty: String(alt.kg) });
                                }}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.75rem',
                                  backgroundColor: '#1e293b',
                                  border: '1px solid #38bdf8',
                                  color: '#38bdf8',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                Select {alt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Note */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Order Notes (Optional)
                </label>
                <textarea
                  value={orderForm.note}
                  onChange={(e) => setOrderForm({ ...orderForm, note: e.target.value })}
                  className="input"
                  rows={2}
                  placeholder="e.g. Rush delivery required"
                />
              </div>

              {/* Error Box */}
              {orderError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', borderRadius: '6px', color: '#fecaca', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <strong>Refusal / Error:</strong> {orderError.message}
                </div>
              )}

              {/* Success Box */}
              {orderSuccess && (
                <div style={{ padding: '0.75rem', backgroundColor: '#064e3b', borderRadius: '6px', color: '#a7f3d0', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {orderSuccess}
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="btn btn-secondary"
                  disabled={orderSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={orderSubmitting || (conversionPreview && !conversionPreview.isValid)}
                >
                  {orderSubmitting ? 'Reserving Stock...' : 'Confirm & Reserve Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Dispatch Order */}
      {showDispatchModal && selectedOrder && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                Dispatch Order #{selectedOrder.order_no}
              </h2>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDispatchSubmit}>
              <div style={{ backgroundColor: '#0f172a', padding: '0.85rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <div style={{ color: '#94a3b8' }}>
                  Customer: <strong style={{ color: '#f8fafc' }}>{selectedOrder.customer_name}</strong>
                </div>
                <div style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
                  Specification: <strong style={{ color: '#38bdf8' }}>{selectedOrder.spec_code}</strong>
                </div>
                <div style={{ color: '#94a3b8', marginTop: '0.25rem' }}>
                  Remaining Unfulfilled: <strong style={{ color: '#f59e0b' }}>{selectedOrder.remaining_rolls} rolls</strong>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Rolls to Dispatch (Max {selectedOrder.remaining_rolls})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedOrder.remaining_rolls}
                  value={dispatchForm.rolls}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, rolls: parseInt(e.target.value, 10) || 1 })}
                  className="input"
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Dispatch Note / Tracking # (Optional)
                </label>
                <input
                  type="text"
                  value={dispatchForm.note}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, note: e.target.value })}
                  className="input"
                  placeholder="e.g. Waybill #WB-9821"
                />
              </div>

              {dispatchError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', borderRadius: '6px', color: '#fecaca', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {dispatchError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="btn btn-secondary"
                  disabled={dispatchSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={dispatchSubmitting}>
                  {dispatchSubmitting ? 'Dispatching...' : `Ship ${dispatchForm.rolls} Rolls`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Cancel Order Balance */}
      {showCancelModal && selectedOrder && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                Cancel Remaining Balance
              </h2>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCancelSubmit}>
              <div style={{ backgroundColor: '#450a0a', border: '1px solid #991b1b', padding: '0.85rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <p style={{ color: '#fca5a5', margin: '0 0 0.5rem 0' }}>
                  This action will cancel the remaining <strong>{selectedOrder.remaining_rolls} rolls</strong> on Order #{selectedOrder.order_no} and immediately release them from reservation.
                </p>
                <div style={{ color: '#fecaca', fontSize: '0.8rem' }}>
                  Already Dispatched: <strong>{selectedOrder.rolls_dispatched} rolls</strong> (will remain recorded).
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  Reason for Cancellation (Optional)
                </label>
                <input
                  type="text"
                  value={cancelForm.reason}
                  onChange={(e) => setCancelForm({ ...cancelForm, reason: e.target.value })}
                  className="input"
                  placeholder="e.g. Customer requested cancellation"
                />
              </div>

              {cancelError && (
                <div style={{ padding: '0.75rem', backgroundColor: '#7f1d1d', borderRadius: '6px', color: '#fecaca', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  {cancelError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-secondary"
                  disabled={cancelSubmitting}
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                  disabled={cancelSubmitting}
                >
                  {cancelSubmitting ? 'Cancelling...' : `Release ${selectedOrder.remaining_rolls} Rolls`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
