'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './loan.module.css';

export default function LoanManagerLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        setHydrated(true);
        const token = localStorage.getItem('suraksha_token');
        const role = localStorage.getItem('user_role');
        if (!token || !role || role.toUpperCase() !== 'LOAN_MANAGER') {
            router.push('/login');
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.clear();
        router.push('/');
    };

    const navItems = [
        { icon: '📈', label: 'Portfolio Dashboard', path: '/loan/dashboard' },
        { icon: '📝', label: 'Application Intake', path: '/loan/intake' },
        { icon: '📋', label: 'App Tracking & Status', path: '/loan/applications' },
        { icon: '💸', label: 'Loan Disbursements', path: '/loan/disburse' },
        { icon: '🔄', label: 'EMI Repayments', path: '/loan/repayments' },
    ];

    if (!hydrated) return null;

    return (
        <div className={styles.layout}>
            {/* SIDEBAR NAVIGATION */}
            <aside className={styles.sidebar}>
                <div className={styles.brandBox}>
                    <div className={styles.bankName}>Suraksha <span>Bank</span></div>
                    <div className={styles.branchName}>Loan Division (003)</div>
                </div>

                <div className={styles.managerProfile}>
                    <div className={styles.avatar}>💼</div>
                    <div className={styles.info}>
                        <div className={styles.name}>A. Krishnan</div>
                        <div className={styles.role}>LOAN MANAGER</div>
                    </div>
                </div>

                <div className={styles.navSection}>LENDING OPERATIONS</div>
                <ul className={styles.navList}>
                    {navItems.map((item) => (
                        <li key={item.path} className={pathname === item.path ? styles.activeNav : ''}>
                            <Link href={item.path}>
                                <span className={styles.navIcon}>{item.icon}</span>
                                {item.label}
                            </Link>
                        </li>
                    ))}
                </ul>

                <button onClick={handleLogout} className={styles.logoutBtn}>⏻ Secure Logout</button>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className={styles.mainContent}>
                <header className={styles.topbar}>
                    <div className={styles.breadcrumb}>Loan Supervisor Console / <span className={styles.crumbActive}>
                        {navItems.find(n => n.path === pathname)?.label || 'Dashboard'}
                    </span></div>
                    <div className={styles.topActions}>
                        <div className={styles.dateStamp}>{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                        <div className={styles.actionBtn}>⚙️</div>
                        <div className={styles.actionBtn}>🔔</div>
                    </div>
                </header>

                <div className={styles.contentWrap}>
                    {children}
                </div>
            </main>
        </div>
    );
}
