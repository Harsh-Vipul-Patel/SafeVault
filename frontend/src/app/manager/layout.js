'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './manager.module.css';

export default function ManagerLayout({ children }) {
    const pathname = usePathname();

    const navItems = [
        { icon: '📈', label: 'Branch Overview', path: '/manager/dashboard' },
        { icon: '📊', label: 'MIS Dashboard', path: '/manager/mis-dashboard' },
        { icon: '⚖️', label: 'Dual Approval Queue', path: '/manager/approvals' },
        { icon: '🛡️', label: 'Compliance & Flags', path: '/manager/compliance' },
        { icon: '🏦', label: 'Settle Transfers', path: '/manager/settlement' },
        { icon: '👥', label: 'Account Lifecycle', path: '/manager/accounts' },
        { icon: '📅', label: 'Mature Deposits', path: '/manager/fd-rd-maturity' },
        { icon: '📋', label: 'Branch Audit Log', path: '/manager/audit' },
        { icon: '🎫', label: 'Assign Service Requests', path: '/manager/service-requests' },
        { icon: '👔', label: 'Staff Management', path: '/manager/staff' },
        { icon: '⚙️', label: 'Batch Job Status', path: '/manager/batch-jobs' },
    ];

    return (
        <div className={styles.layout}>
            {/* SIDEBAR NAVIGATION */}
            <aside className={styles.sidebar}>
                <div className={styles.brandBox}>
                    <div className={styles.bankName}>Suraksha <span>Bank</span></div>
                    <div className={styles.branchName}>Mumbai Central (003)</div>
                </div>

                <div className={styles.managerProfile}>
                    <div className={styles.avatar}>👔</div>
                    <div className={styles.info}>
                        <div className={styles.name}>R.K. Sharma</div>
                        <div className={styles.role}>BRANCH MANAGER</div>
                    </div>
                </div>

                <div className={styles.navSection}>OPERATIONS & OVERSIGHT</div>
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

                <button className={styles.logoutBtn}>⏻ Secure Logout</button>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className={styles.mainContent}>
                <header className={styles.topbar}>
                    <div className={styles.breadcrumb}>Manager Console / <span className={styles.crumbActive}>Branch Overview</span></div>
                    <div className={styles.topActions}>
                        <div className={styles.dateStamp}>05 Mar 2026 • 10:45 AM</div>
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
