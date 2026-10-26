'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      // Successful login -> Full navigation to dashboard ensuring cookies transmit cleanly
      window.location.href = '/dashboard';
    } catch {
      setError('Network connection error. Please verify the server is running.');
      setIsLoading(false);
    }
  };

  const handleQuickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background Decorative Rings */}
      <div
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.08) 0%, transparent 70%)',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem 2.25rem',
          position: 'relative',
          zIndex: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(56, 189, 248, 0.1)',
        }}
      >
        {/* Brand Icon & Heading */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.25) 0%, rgba(56, 189, 248, 0.1) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              marginBottom: '1rem',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)',
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>🎞️</span>
          </div>
          <h1
            style={{
              fontSize: '1.85rem',
              fontWeight: '800',
              color: '#f8fafc',
              letterSpacing: '-0.025em',
              marginBottom: '0.4rem',
            }}
          >
            Apex Tape Stock
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.4 }}>
            Industrial stock management, BOM calculations, and zero-drift manufacturing ledgers
          </p>
        </div>

        {error && (
          <div className="alert-error" style={{ marginBottom: '1.5rem' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '600',
                marginBottom: '0.45rem',
                color: '#cbd5e1',
              }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="input"
              placeholder="e.g. staff@demo.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: '600',
                marginBottom: '0.45rem',
                color: '#cbd5e1',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', fontSize: '0.95rem', marginTop: '0.5rem' }}
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : 'Sign In to Command Center'}
          </button>
        </form>

        {/* Quick Demo Autofill Section */}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '0.85rem',
            }}
          >
            <span style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
              Quick Evaluation Fill
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', flexDirection: 'column', padding: '0.65rem 0.5rem', gap: '0.15rem' }}
              onClick={() => handleQuickFill('staff@demo.local', 'Staff123!')}
              disabled={isLoading}
            >
              <span style={{ fontWeight: 700, color: '#93c5fd', fontSize: '0.82rem' }}>Staff Account</span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>staff@demo.local</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', flexDirection: 'column', padding: '0.65rem 0.5rem', gap: '0.15rem' }}
              onClick={() => handleQuickFill('admin@demo.local', 'Admin123!')}
              disabled={isLoading}
            >
              <span style={{ fontWeight: 700, color: '#d8b4fe', fontSize: '0.82rem' }}>Admin Account</span>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>admin@demo.local</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
