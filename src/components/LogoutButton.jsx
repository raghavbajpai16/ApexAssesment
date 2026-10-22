'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className="btn btn-secondary btn-sm"
      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
    >
      {isLoading ? 'Exiting...' : 'Sign Out'}
    </button>
  );
}
