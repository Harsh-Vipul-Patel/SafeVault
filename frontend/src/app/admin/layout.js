'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export default function AdminLayout({ children }) {
    const pathname = usePathname();

    const navItems = [
        { icon: '📡', label: 'System Monitor', path: '/admin/dashboard' },
        { icon: '📊', label: 'Global MIS', path: '/admin/mis-dashboard' },
        { icon: '💸', label: 'Fee Management', path: '/admin/fees' },
        { icon: '👥', label: 'User Provisioning', path: '/admin/users' },
        { icon: '🏦', label: 'Branch Management', path: '/admin/branches' },
        { icon: '⚙️', label: 'System Configuration', path: '/admin/config' },
        { icon: '📜', label: 'Global Audit Log', path: '/admin/audit' },
        { icon: '🔐', label: 'Roles & Permissions', path: '/admin/roles' },
        { icon: '⏳', label: 'Scheduler/Batch Jobs', path: '/admin/scheduler' },
        { icon: '💾', label: 'Backup & Recovery', path: '/admin/backup' },
    ];

    return (
        <div className={styles.layout}>
            {/* SIDEBAR NAVIGATION (Darker Theme for Admin) */}
            <aside className={styles.sidebar}>
                <div className={styles.brandBox}>
                    <div className={styles.bankName}>Suraksha <span>Bank</span></div>
                    <div className={styles.consoleTag}>System Admin Console (ROOT)</div>
                </div>

                <div className={styles.adminProfile}>
                    <div className={styles.avatar}>🛡️</div>
                    <div className={styles.info}>
                        <div className={styles.name}>System Root</div>
                        <div className={styles.role}>E/S Level: 0</div>
                    </div>
                </div>

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

                <button className={styles.dangerBtn}>TERMINATE SESSION</button>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main className={styles.mainContent}>
                <header className={styles.topbar}>
                    <div className={styles.systemStatus}>
                        <span className={styles.pulse}></span>
                        ALL SYSTEMS NOMINAL · ORACLE DB CONNECTED · NODE-MUM-01
                    </div>
                    <div className={styles.topActions}>
                        <div className={styles.dateStamp}>05 Mar 2026 • 11:02 AM IST</div>
                    </div>
                </header>

                <div className={styles.contentWrap}>
                    {children}
                </div>
            </main>
        </div>
    );
}
