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
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0.85rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Logo & Navigation Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <Link
              href="/dashboard"
              style={{
                fontSize: '1.15rem',
                fontWeight: '800',
                color: '#38bdf8',
                letterSpacing: '-0.02em',
                textDecoration: 'none',
              }}
            >
              APEX TAPE STOCK
            </Link>

            <nav style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', fontSize: '0.9rem' }}>
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
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  Corrections
                  <span className="badge badge-admin" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                    Admin
                  </span>
                </Link>
              )}
            </nav>
          </div>

          {/* User Profile & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{user.email}</span>
              <span className={isAdmin ? 'badge badge-admin' : 'badge badge-staff'}>
                {user.role}
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {children}
      </main>
    </div>
  );
}
