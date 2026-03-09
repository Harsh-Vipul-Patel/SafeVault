'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './customer.module.css';

function decodeJWT(token) {
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
}

export default function CustomerLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const [userName, setUserName] = useState('Customer');
    const [initials, setInitials] = useState('C');

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : null;
        if (!token) { router.push('/login'); return; }
        const payload = decodeJWT(token);
        if (!payload) { router.push('/login'); return; }
        const name = payload.name || payload.username || 'Customer';
        setUserName(name);
        setInitials(name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2));
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('suraksha_token');
        router.push('/login');
    };

    const topNavItems = [
        { icon: '🏠', label: 'Dashboard', path: '/customer/dashboard' },
        { icon: '💳', label: 'My Accounts', path: '/customer/accounts' },
        { icon: '🏦', label: 'Fixed/Recurring Deposits', path: '/customer/deposits' },
        { icon: '🔄', label: 'Transfer Funds', path: '/customer/internal' },
        { icon: '🌐', label: 'External Transfer', path: '/customer/external' },
        { icon: '👥', label: 'Manage Beneficiaries', path: '/customer/beneficiaries' },
        { icon: '📅', label: 'Standing Instructions', path: '/customer/standing-instructions' },
        { icon: '📄', label: 'Statements', path: '/customer/statements' },
    ];

    const bottomNavItems = [
        { icon: '🆔', label: 'My KYC Status', path: '/customer/kyc' },
        { icon: '🎫', label: 'Service Requests', path: '/customer/service-requests' },
        { icon: '📓', label: 'Cheque Book', path: '/customer/cheque-request' },
        { icon: '👤', label: 'Profile & Security', path: '/customer/profile' },
        { icon: '📞', label: 'Contact Branch', path: '/customer/support' }
    ];

    return (
        <div className={styles.layout}>
            {/* SIDEBAR */}
            <aside className={styles.sidebar}>
                <div className={styles.userProfile}>
                    <div className={styles.avatar}>{initials}</div>
                    <div className={styles.userInfo}>
                        <div className={styles.userName}>{userName}</div>
                        <div className={styles.userRole}>CUSTOMER</div>
                    </div>
                </div>

                <nav className={styles.navMenu}>
                    <ul className={styles.navList}>
                        {topNavItems.map((item) => (
                            <li key={item.path}>
                                <Link
                                    href={item.path}
                                    className={`${styles.navLink} ${pathname === item.path ? styles.activeLink : ''}`}
                                >
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>

                    <div className={styles.navDivider}></div>

                    <ul className={styles.navList}>
                        {bottomNavItems.map((item) => (
                            <li key={item.path}>
                                <Link
                                    href={item.path}
                                    className={`${styles.navLink} ${pathname === item.path ? styles.activeLink : ''}`}
                                >
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                <button className={styles.logoutBtn} onClick={handleLogout}>
                    🚪 Logout
                </button>
            </aside>

            {/* PAGE CONTENT */}
            <main className={styles.mainContent}>
                {children}
            </main>
        </div>
    );
}
