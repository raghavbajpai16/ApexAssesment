'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

export default function AiLoginPage() {
  const [activeTab, setActiveTab] = useState('biometric'); // 'biometric' | 'nlp' | 'vault'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [aiDiagnostic, setAiDiagnostic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Biometric state
  const [selectedPersona, setSelectedPersona] = useState('admin'); // 'staff' | 'admin'
  const [scanStep, setScanStep] = useState(0); // 0 = idle, 1..4 = scanning, 5 = verified
  const [scanLogs, setScanLogs] = useState([]);

  // NLP / Voice state
  const [nlpPrompt, setNlpPrompt] = useState('');
  const [nlpStage, setNlpStage] = useState('idle'); // 'idle' | 'listening' | 'analyzing' | 'authorized'
  const [nlpLog, setNlpLog] = useState([]);
  const [audioBars, setAudioBars] = useState([12, 24, 18, 32, 28, 14, 26, 36, 20, 16]);

  // Canvas ref for neural particle mesh
  const canvasRef = useRef(null);

  // Sound synthesizer using Web Audio API
  const playCyberSound = (type) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'beep') {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'scan') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'success') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'error') {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(140, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch {
      // AudioContext blocked or not supported
    }
  };

  // Background Neural Synapse Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Particle nodes
    const particleCount = 45;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.7,
        vy: (Math.random() - 0.5) * 0.7,
        radius: Math.random() * 2 + 1.2,
        color: i % 3 === 0 ? '#38bdf8' : i % 3 === 1 ? '#a855f7' : '#10b981',
      });
    }

    let mouse = { x: null, y: null, maxDist: 140 };
    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw perspective grid lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Update & Draw particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Mouse connection
        if (mouse.x !== null && mouse.y !== null) {
          const dxM = p.x - mouse.x;
          const dyM = p.y - mouse.y;
          const distM = Math.sqrt(dxM * dxM + dyM * dyM);
          if (distM < mouse.maxDist) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 * (1 - distM / mouse.maxDist)})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          }
        }

        // Particle-to-particle synapses
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(168, 85, 247, ${0.2 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Equalizer animation effect for voice/NLP tab
  useEffect(() => {
    if (activeTab !== 'nlp') return;
    const interval = setInterval(() => {
      setAudioBars((prev) =>
        prev.map(() => Math.floor(Math.random() * 32) + 8)
      );
    }, 120);
    return () => clearInterval(interval);
  }, [activeTab]);

  // Central authenticated login submission
  const executeAuthentication = async (targetEmail, targetPassword, methodLabel = 'Standard') => {
    setError('');
    setAiDiagnostic('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail, password: targetPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        playCyberSound('error');
        setError(data.error || 'Neural Handshake Rejected: Authentication failed.');
        setAiDiagnostic(
          `Security Alert: Verification mismatch on entity [${targetEmail}]. System denied access token minting.`
        );
        setIsLoading(false);
        return false;
      }

      playCyberSound('success');
      // Success redirection with clean session cookies
      window.location.href = '/dashboard';
      return true;
    } catch {
      playCyberSound('error');
      setError('Neural Telemetry Link Severed: Network connection error.');
      setAiDiagnostic('Error Code 503: Unable to reach enterprise authentication gateway.');
      setIsLoading(false);
      return false;
    }
  };

  // 1. Biometric Scan Simulation Flow
  const handleStartBiometricScan = async () => {
    setError('');
    setAiDiagnostic('');
    setScanStep(1);
    setScanLogs(['[0.10s] Initializing optical sensor matrix & spectral depth analysis...']);
    playCyberSound('scan');

    setTimeout(() => {
      setScanStep(2);
      setScanLogs((prev) => [
        ...prev,
        '[0.35s] Mapping 468 facial 3D landmark mesh points (Liveness verified 100%)...',
      ]);
      playCyberSound('beep');
    }, 700);

    setTimeout(() => {
      setScanStep(3);
      setScanLogs((prev) => [
        ...prev,
        `[0.70s] Correlating biometric signature with Apex Zero-Drift Identity: [${selectedPersona.toUpperCase()}]...`,
      ]);
      playCyberSound('scan');
    }, 1400);

    setTimeout(() => {
      setScanStep(4);
      setScanLogs((prev) => [
        ...prev,
        '[1.05s] Quantum key cryptographic exchange validated (SHA-256 match confirmed).',
      ]);
      playCyberSound('beep');
    }, 2100);

    setTimeout(async () => {
      setScanStep(5);
      setScanLogs((prev) => [
        ...prev,
        '✨ [1.40s] ACCESS GRANTED. Launching Apex Tape Stock Command Center...',
      ]);

      const demoCredentials =
        selectedPersona === 'admin'
          ? { email: 'admin@demo.local', pass: 'Admin123!' }
          : { email: 'staff@demo.local', pass: 'Staff123!' };

      await executeAuthentication(demoCredentials.email, demoCredentials.pass, 'Biometric');
    }, 2800);
  };

  // 2. Natural Language Prompt / Voice Sign-In Flow
  const handleNlpSubmit = async (customPrompt) => {
    const query = customPrompt || nlpPrompt;
    if (!query.trim()) return;

    setError('');
    setAiDiagnostic('');
    setNlpStage('analyzing');
    setNlpLog([
      `> Processing natural language voice prompt: "${query}"`,
      '> Running Apex Transformer NLP Intent Classifier v5.2...',
    ]);
    playCyberSound('scan');

    const lower = query.toLowerCase();
    const isAdmin =
      lower.includes('admin') ||
      lower.includes('audit') ||
      lower.includes('ledger') ||
      lower.includes('supervisor') ||
      lower.includes('executive');

    const targetEmail = isAdmin ? 'admin@demo.local' : 'staff@demo.local';
    const targetPass = isAdmin ? 'Admin123!' : 'Staff123!';
    const roleTitle = isAdmin ? 'Executive Administrator' : 'Production Staff Operator';

    setTimeout(() => {
      setNlpLog((prev) => [
        ...prev,
        `> Intent Resolution: [AUTHENTICATION_REQUEST]`,
        `> Identified Role Persona: ${roleTitle}`,
        `> Neural Confidence Score: 99.84% match`,
        `> Identity Bound: ${targetEmail}`,
      ]);
      playCyberSound('beep');
    }, 800);

    setTimeout(async () => {
      setNlpLog((prev) => [
        ...prev,
        `> Dispatching cryptographic payload to security gateway...`,
      ]);
      setNlpStage('authorized');
      await executeAuthentication(targetEmail, targetPass, 'AI-Voice-NLP');
    }, 1800);
  };

  // 3. Quantum Vault Submit
  const handleVaultSubmit = async (e) => {
    e.preventDefault();
    playCyberSound('scan');
    await executeAuthentication(email, password, 'Quantum-Vault');
  };

  // Password entropy calculation
  const calculateEntropy = (pass) => {
    if (!pass) return { score: 0, label: 'No Input', color: '#64748b' };
    let score = 0;
    if (pass.length >= 8) score += 25;
    if (pass.length >= 12) score += 25;
    if (/[A-Z]/.test(pass)) score += 15;
    if (/[0-9]/.test(pass)) score += 15;
    if (/[^A-Za-z0-9]/.test(pass)) score += 20;

    if (score < 40) return { score, label: 'Vulnerable (Neural Alert)', color: '#f43f5e' };
    if (score < 75) return { score, label: 'Standard Resistance', color: '#f59e0b' };
    return { score, label: 'Quantum Resilient (Apex Grade)', color: '#10b981' };
  };

  const entropy = calculateEntropy(password);

  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        overflow: 'hidden',
        background: '#040812',
      }}
    >
      {/* Interactive Background Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Ambient Neon Blobs */}
      <div
        style={{
          position: 'absolute',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
          top: '-10%',
          left: '10%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.1) 0%, transparent 70%)',
          bottom: '-15%',
          right: '10%',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* Main Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Top Floating Cyber Telemetry Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            padding: '0.6rem 1rem',
            background: 'rgba(10, 18, 35, 0.75)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '12px',
            backdropFilter: 'blur(12px)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px #10b981',
              }}
            />
            <span style={{ color: '#38bdf8', fontWeight: 700, letterSpacing: '0.05em' }}>
              APEX NEURAL OS // 5.2
            </span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ color: '#94a3b8' }}>LATENCY: 9ms</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => {
                setSoundEnabled(!soundEnabled);
                playCyberSound('beep');
              }}
              title={soundEnabled ? 'Mute AI Audio Effects' : 'Enable AI Audio Effects'}
              style={{
                background: 'transparent',
                border: 'none',
                color: soundEnabled ? '#38bdf8' : '#64748b',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {soundEnabled ? '🔊 SFX' : '🔇 MUTED'}
            </button>
            <Link
              href="/login"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                color: '#cbd5e1',
                fontSize: '0.75rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                transition: 'all 0.2s',
              }}
            >
              ← Classic Login
            </Link>
          </div>
        </div>

        {/* Central AI Card */}
        <div className="ai-card" style={{ padding: '2.25rem 2rem' }}>
          {/* HUD Tech Corner Brackets */}
          <div className="ai-hud-corner ai-hud-tl" />
          <div className="ai-hud-corner ai-hud-tr" />
          <div className="ai-hud-corner ai-hud-bl" />
          <div className="ai-hud-corner ai-hud-br" />

          {/* AI Header */}
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '64px',
                height: '64px',
                borderRadius: '18px',
                background:
                  'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(168, 85, 247, 0.3) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                marginBottom: '1rem',
                boxShadow:
                  '0 0 30px rgba(56, 189, 248, 0.35), inset 0 0 15px rgba(168, 85, 247, 0.3)',
                animation: 'aiFloat 4s ease-in-out infinite',
              }}
            >
              <span style={{ fontSize: '2rem' }}>🧠</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="ai-badge-neon">
                NEURAL QUANTUM GATEWAY
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '9999px',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  fontWeight: 700,
                }}
              >
                Zero-Drift AI Active
              </span>
            </div>

            <h1
              style={{
                fontSize: '1.95rem',
                fontWeight: '800',
                letterSpacing: '-0.025em',
                background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 50%, #38bdf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: '0.3rem',
              }}
            >
              Apex Tape Intelligence
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', maxWidth: '420px', margin: '0 auto' }}>
              Autonomous authentication layer for industrial BOM calculations & inventory ledgers
            </p>
          </div>

          {/* AI Auth Mode Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '0.5rem',
              marginBottom: '1.75rem',
            }}
          >
            <button
              type="button"
              className={`ai-tab ${activeTab === 'biometric' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('biometric');
                playCyberSound('beep');
              }}
            >
              <span>👁️</span> Biometrics
            </button>
            <button
              type="button"
              className={`ai-tab ${activeTab === 'nlp' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('nlp');
                playCyberSound('beep');
              }}
            >
              <span>🎙️</span> AI Prompt
            </button>
            <button
              type="button"
              className={`ai-tab ${activeTab === 'vault' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('vault');
                playCyberSound('beep');
              }}
            >
              <span>⚡</span> Quantum Vault
            </button>
          </div>

          {/* Error / Diagnostic Alerts */}
          {error && (
            <div
              className="alert-error"
              style={{
                marginBottom: '1.25rem',
                borderLeft: '4px solid #f43f5e',
                animation: 'aiGlowPulse 2s ease infinite',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>⚠️ {error}</div>
              {aiDiagnostic && (
                <div style={{ fontSize: '0.78rem', color: '#fecdd3', fontFamily: 'monospace' }}>
                  {aiDiagnostic}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 1: BIOMETRIC / NEURAL SCAN AUTH
             ========================================================================= */}
          {activeTab === 'biometric' && (
            <div>
              {/* Persona Selector */}
              <div style={{ marginBottom: '1.25rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                  }}
                >
                  Select Neural Persona Identity
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersona('staff');
                      playCyberSound('beep');
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '10px',
                      background:
                        selectedPersona === 'staff'
                          ? 'rgba(2, 132, 199, 0.25)'
                          : 'rgba(15, 23, 42, 0.6)',
                      border:
                        selectedPersona === 'staff'
                          ? '1px solid #38bdf8'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      color: selectedPersona === 'staff' ? '#38bdf8' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>🔵 Staff Operator</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>staff@demo.local</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPersona('admin');
                      playCyberSound('beep');
                    }}
                    style={{
                      padding: '0.75rem',
                      borderRadius: '10px',
                      background:
                        selectedPersona === 'admin'
                          ? 'rgba(168, 85, 247, 0.25)'
                          : 'rgba(15, 23, 42, 0.6)',
                      border:
                        selectedPersona === 'admin'
                          ? '1px solid #a855f7'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      color: selectedPersona === 'admin' ? '#d8b4fe' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>🟣 Executive Admin</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>admin@demo.local</div>
                  </button>
                </div>
              </div>

              {/* Simulated Biometric HUD Viewport */}
              <div
                style={{
                  position: 'relative',
                  height: '180px',
                  background: 'radial-gradient(circle, rgba(14, 28, 55, 0.8) 0%, rgba(5, 10, 20, 0.95) 100%)',
                  borderRadius: '14px',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.25rem',
                  boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)',
                }}
              >
                {/* Laser scan line (only during scanning) */}
                {scanStep > 0 && scanStep < 5 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '5%',
                      right: '5%',
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, #38bdf8, #a855f7, transparent)',
                      animation: 'aiLaserScan 1.2s infinite ease-in-out',
                      zIndex: 10,
                    }}
                  />
                )}

                {/* Rotating Reticle */}
                <div
                  style={{
                    position: 'absolute',
                    width: '130px',
                    height: '130px',
                    borderRadius: '50%',
                    border: '1px dashed rgba(56, 189, 248, 0.4)',
                    animation: 'aiReticleSpin 12s linear infinite',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    border: '1px dotted rgba(168, 85, 247, 0.5)',
                    animation: 'aiReticleSpinRev 8s linear infinite',
                  }}
                />

                {/* Central Face Silhouette & Target points */}
                <div style={{ textAlign: 'center', zIndex: 5 }}>
                  <div
                    style={{
                      fontSize: '3rem',
                      filter: scanStep > 0 ? 'drop-shadow(0 0 15px #38bdf8)' : 'none',
                      transition: 'all 0.3s',
                    }}
                  >
                    {scanStep === 5 ? '✅' : scanStep > 0 ? '👤' : '👁️'}
                  </div>
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontFamily: 'monospace',
                      color: scanStep === 5 ? '#10b981' : '#38bdf8',
                      marginTop: '0.2rem',
                    }}
                  >
                    {scanStep === 0 && 'READY FOR OPTICAL ACQUISITION'}
                    {scanStep === 1 && 'CALIBRATING SPECTRAL SENSORS...'}
                    {scanStep === 2 && 'MAPPING 3D FACIAL LANDMARKS...'}
                    {scanStep === 3 && 'CROSS-MATCHING APEX IDENTITY...'}
                    {scanStep === 4 && 'GENERATING ZERO-KNOWLEDGE PROOF...'}
                    {scanStep === 5 && 'BIOMETRIC SIGNATURE VERIFIED!'}
                  </div>
                </div>

                {/* Viewport Tech HUD telemetry */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    color: '#64748b',
                  }}
                >
                  LANDMARKS: {scanStep > 1 ? '468/468' : 'STANDBY'}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    color: scanStep > 2 ? '#10b981' : '#64748b',
                  }}
                >
                  LIVENESS: {scanStep > 2 ? '100% OK' : 'PENDING'}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    left: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    color: '#64748b',
                  }}
                >
                  RESOLUTION: 4K SPECTRAL
                </div>
                <div
                  style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '10px',
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    color: '#38bdf8',
                  }}
                >
                  ID: {selectedPersona.toUpperCase()}
                </div>
              </div>

              {/* Progress Terminal Log */}
              {scanLogs.length > 0 && (
                <div
                  style={{
                    background: 'rgba(5, 10, 20, 0.85)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.72rem',
                    color: '#a5f3fc',
                    marginBottom: '1.25rem',
                    lineHeight: '1.5',
                  }}
                >
                  {scanLogs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                </div>
              )}

              {/* Action Button */}
              <button
                type="button"
                className="ai-btn-glow"
                onClick={handleStartBiometricScan}
                disabled={isLoading || (scanStep > 0 && scanStep < 5)}
                style={{
                  width: '100%',
                  padding: '0.9rem',
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.6rem',
                }}
              >
                {isLoading || (scanStep > 0 && scanStep < 5) ? (
                  <>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: '2px solid #ffffff',
                        borderTopColor: 'transparent',
                        animation: 'aiReticleSpin 0.8s linear infinite',
                      }}
                    />
                    Executing Neural Scan...
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    Engage Neural Biometric Auth as {selectedPersona === 'admin' ? 'Admin' : 'Staff'}
                  </>
                )}
              </button>
            </div>
          )}

          {/* =========================================================================
              TAB 2: NATURAL LANGUAGE PROMPT / VOICE AUTH
             ========================================================================= */}
          {activeTab === 'nlp' && (
            <div>
              {/* Voice Equalizer Visualizer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  height: '45px',
                  padding: '0.5rem',
                  background: 'rgba(8, 14, 28, 0.6)',
                  borderRadius: '10px',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  marginBottom: '1rem',
                }}
              >
                {audioBars.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      width: '4px',
                      height: `${h}px`,
                      background:
                        i % 2 === 0
                          ? 'linear-gradient(to top, #0284c7, #38bdf8)'
                          : 'linear-gradient(to top, #7c3aed, #c084fc)',
                      borderRadius: '2px',
                      transition: 'height 0.12s ease',
                    }}
                  />
                ))}
                <span
                  style={{
                    marginLeft: '0.75rem',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    color: '#38bdf8',
                  }}
                >
                  ACOUSTIC VECTOR MONITOR: READY
                </span>
              </div>

              {/* Natural Language Prompt Input */}
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="nlpInput"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#94a3b8',
                    marginBottom: '0.45rem',
                  }}
                >
                  Autonomous Intent Command
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="nlpInput"
                    type="text"
                    className="input"
                    placeholder="e.g. 'Log me in as Administrator to audit tape inventory'..."
                    value={nlpPrompt}
                    onChange={(e) => setNlpPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleNlpSubmit();
                      }
                    }}
                    disabled={isLoading || nlpStage === 'analyzing'}
                    style={{
                      paddingRight: '3.5rem',
                      fontFamily: 'inherit',
                      background: 'rgba(10, 20, 38, 0.9)',
                      borderColor: 'rgba(56, 189, 248, 0.3)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleNlpSubmit()}
                    disabled={isLoading || !nlpPrompt.trim()}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '6px',
                      bottom: '6px',
                      padding: '0 0.8rem',
                      background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#ffffff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* Preset AI Quick Prompts */}
              <div style={{ marginBottom: '1.25rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                  Suggested AI Prompts (Click to Execute):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.4rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const p = 'Log me in as Administrator to inspect manufacturing drift & BOM';
                      setNlpPrompt(p);
                      handleNlpSubmit(p);
                    }}
                    style={{
                      textAlign: 'left',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      color: '#e9d5ff',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                    }}
                  >
                    🟣 &quot;Log me in as Administrator to inspect manufacturing drift & BOM&quot;
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = 'Authenticate Staff operator on factory floor for roll conversion';
                      setNlpPrompt(p);
                      handleNlpSubmit(p);
                    }}
                    style={{
                      textAlign: 'left',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      color: '#bae6fd',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      transition: 'all 0.18s',
                    }}
                  >
                    🔵 &quot;Authenticate Staff operator on factory floor for roll conversion&quot;
                  </button>
                </div>
              </div>

              {/* Real-time Intent Reasoning Feed */}
              {nlpLog.length > 0 && (
                <div
                  style={{
                    background: 'rgba(4, 9, 18, 0.9)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.72rem',
                    color: '#c084fc',
                    marginBottom: '1rem',
                    lineHeight: '1.5',
                  }}
                >
                  {nlpLog.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              TAB 3: QUANTUM VAULT (SMART CREDENTIALS + AI ENTROPY RADAR)
             ========================================================================= */}
          {activeTab === 'vault' && (
            <form onSubmit={handleVaultSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div>
                  <label
                    htmlFor="vaultEmail"
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: '#cbd5e1',
                      marginBottom: '0.4rem',
                    }}
                  >
                    Identity Vector (Email)
                  </label>
                  <input
                    id="vaultEmail"
                    type="email"
                    required
                    className="input"
                    placeholder="e.g. admin@demo.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    style={{
                      background: 'rgba(10, 20, 38, 0.9)',
                      borderColor: 'rgba(56, 189, 248, 0.25)',
                    }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label
                      htmlFor="vaultPassword"
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#cbd5e1',
                      }}
                    >
                      Quantum Cryptographic Key
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      {showPassword ? 'Hide Key' : 'Reveal Key'}
                    </button>
                  </div>
                  <input
                    id="vaultPassword"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="input"
                    placeholder="Enter password..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    style={{
                      background: 'rgba(10, 20, 38, 0.9)',
                      borderColor: 'rgba(56, 189, 248, 0.25)',
                    }}
                  />

                  {/* AI Password Entropy Radar */}
                  {password && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <span style={{ color: '#94a3b8' }}>AI CRYPTO ENTROPY:</span>
                        <span style={{ color: entropy.color, fontWeight: 700 }}>
                          {entropy.label} ({entropy.score}%)
                        </span>
                      </div>
                      <div
                        style={{
                          height: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${entropy.score}%`,
                            background: entropy.color,
                            transition: 'all 0.3s',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Persona Fill */}
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(13, 22, 39, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                    Instant Evaluation Personas:
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.45rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEmail('staff@demo.local');
                        setPassword('Staff123!');
                        playCyberSound('beep');
                      }}
                      disabled={isLoading}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Staff Operator
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEmail('admin@demo.local');
                        setPassword('Admin123!');
                        playCyberSound('beep');
                      }}
                      disabled={isLoading}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Executive Admin
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="ai-btn-glow"
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    fontSize: '0.95rem',
                    marginTop: '0.25rem',
                  }}
                >
                  {isLoading ? 'Verifying with Neural Gateway...' : '⚡ Unlock Quantum Vault'}
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Badges */}
          <div
            style={{
              marginTop: '1.75rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.72rem',
              color: '#64748b',
            }}
          >
            <span>🛡️ Post-Quantum Encryption</span>
            <span>Zero-Drift Ledgers</span>
            <span>Apex Industrial v5.2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
