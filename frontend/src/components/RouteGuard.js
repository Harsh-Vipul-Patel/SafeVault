'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * RouteGuard — wraps each protected layout to enforce session validity.
 * 
 * On every render AND route change (including browser back/forward),
 * it validates the JWT token. If the token is missing, expired, or the
 * role doesn't match, it immediately redirects to /login and REPLACES
 * the history entry so the back button can't resurrect a dead session.
 */

function decodeJWT(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch {
        return null;
    }
}

export default function RouteGuard({ allowedRoles, children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    const checkSession = useCallback(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : null;

        if (!token) {
            setAuthorized(false);
            router.replace('/login?reason=session_expired');
            return;
        }

        const payload = decodeJWT(token);
        if (!payload) {
            localStorage.clear();
            setAuthorized(false);
            router.replace('/login?reason=session_expired');
            return;
        }

        // Check JWT expiry (payload.exp is in seconds)
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            localStorage.clear();
            setAuthorized(false);
            router.replace('/login?reason=session_expired');
            return;
        }

        // Check role authorization
        if (allowedRoles && allowedRoles.length > 0) {
            const userRole = payload.role?.toUpperCase();
            if (!allowedRoles.map(r => r.toUpperCase()).includes(userRole)) {
                setAuthorized(false);
                router.replace('/login');
                return;
            }
        }

        setAuthorized(true);
    }, [allowedRoles, router]);

    // Check on mount AND on every route change
    useEffect(() => {
        checkSession();
    }, [pathname, checkSession]);

    // Also check when tab becomes visible again and on popstate (back/forward)
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                checkSession();
            }
        };

        const handlePopState = () => {
            checkSession();
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('popstate', handlePopState);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [checkSession]);

    // Don't render children until authorized — prevents flash of protected content
    if (!authorized) {
        return null;
    }

    return children;
}
