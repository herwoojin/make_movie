'use client';

import { useEffect, useState } from 'react';
import { subscribeAuth, type AuthUser } from './auth';
import { isFirebaseConfigured } from './config';

export function useAuth(): { user: AuthUser | null; ready: boolean; configured: boolean } {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return;
    return subscribeAuth((u) => {
      setUser(u);
      setReady(true);
    });
  }, [configured]);

  return { user, ready, configured };
}
