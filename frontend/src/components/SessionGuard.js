'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * SessionGuard
 * Installed once at the root layout level.
 * Monkey-patches window.fetch so that any 401 or 403 response from the API
 * automatically clears local storage and redirects to the login page with
 * ?reason=session_expired — matching the documented Error 9 behaviour.
 */
export default function SessionGuard() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Avoid patching multiple times (e.g. HMR in dev)
        if (window.__sessionGuardInstalled) return;
        window.__sessionGuardInstalled = true;

        const originalFetch = window.fetch;

        window.fetch = async (...args) => {
            const response = await originalFetch(...args);

            // Only intercept auth failures that are NOT already on the login page
            if ((response.status === 401 || response.status === 403) &&
                !window.location.pathname.startsWith('/login')) {

                // Clear all session data
                localStorage.removeItem('suraksha_token');
                localStorage.removeItem('user_role');
                localStorage.removeItem('suraksha_user');

                // Hard redirect so the router picks up the query param cleanly
                window.location.href = '/login?reason=session_expired';
            }

            return response;
        };

        return () => {
            // On unmount (practically never for root layout), restore original
            window.fetch = originalFetch;
            window.__sessionGuardInstalled = false;
        };
    }, []);

    // Renders nothing — pure side-effect component
    return null;
}
