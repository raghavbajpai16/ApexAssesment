import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser, SESSION_COOKIE_NAME } from '@/lib/auth';
import LogoutButton from '@/components/LogoutButton';

export default async function AppShellLayout({ children }) {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    redirect('/login');
  }

  let user = null;
  try {
    user = await getSessionUser(sessionToken);
  } catch (err) {
    console.error('[APP_SHELL_AUTH_ERROR]', err);
  }

  if (!user) {
    redirect('/login');
  }

  const isAdmin = user.role === 'admin';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header & Role-Aware Navigation Bar */}
      <header
        style={{
          backgroundColor: 'rgba(7, 13, 24, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '0.85rem 1.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Logo & Navigation Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
            <Link
              href="/dashboard"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                textDecoration: 'none',
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  boxShadow: '0 0 12px rgba(56, 189, 248, 0.4)',
                }}
              >
                🎞️
              </div>
              <span
                style={{
                  fontSize: '1.15rem',
                  fontWeight: '800',
                  color: '#f8fafc',
                  letterSpacing: '-0.025em',
                }}
              >
                APEX <span style={{ color: '#38bdf8' }}>STOCK</span>
              </span>
            </Link>

            <nav style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.88rem', fontWeight: 600 }}>
              <Link href="/dashboard" style={{ color: '#cbd5e1' }}>
                Dashboard
              </Link>
              <Link href="/specs" style={{ color: '#cbd5e1' }}>
                Specs
              </Link>
              <Link href="/materials" style={{ color: '#cbd5e1' }}>
                Materials
              </Link>
              <Link href="/production" style={{ color: '#cbd5e1' }}>
                Production
              </Link>
              <Link href="/finished" style={{ color: '#cbd5e1' }}>
                Finished
              </Link>
              <Link href="/orders" style={{ color: '#cbd5e1' }}>
                Orders
              </Link>
              <Link href="/history" style={{ color: '#cbd5e1' }}>
                History
              </Link>
              {isAdmin && (
                <Link
                  href="/corrections"
                  style={{
                    color: '#d8b4fe',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  Corrections
                  <span className="badge badge-admin" style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem' }}>
                    Admin
                  </span>
                </Link>
              )}
            </nav>
          </div>

          {/* User Profile & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 500 }}>{user.email}</span>
              <span className={isAdmin ? 'badge badge-admin' : 'badge badge-staff'}>
                {user.role}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: '1280px', width: '100%', margin: '0 auto', padding: '2rem 1.75rem' }}>
        {children}
      </main>
    </div>
  );
}
