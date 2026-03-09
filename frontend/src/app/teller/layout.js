'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './teller.module.css';

export default function TellerLayout({ children }) {
    const pathname = usePathname();

    const mainNav = [
        { icon: '🖥️', label: 'Counter Queue', path: '/teller/dashboard' },
        { icon: '💰', label: 'Deposit Cash', path: '/teller/deposit' },
        { icon: '💸', label: 'Withdrawal', path: '/teller/withdraw' },
        { icon: '🔄', label: 'Fund Transfer', path: '/teller/transfer' },
        { icon: '🆕', label: 'Open Account', path: '/teller/open-account' },
        { icon: '🏦', label: 'Open FD/RD', path: '/teller/open-fd-rd' },
        { icon: '🆔', label: 'Verify KYC', path: '/teller/kyc-verify' },
        { icon: '📓', label: 'Cheque Ops', path: '/teller/cheque-ops' },
        { icon: '👤', label: 'Customer Lookup', path: '/teller/lookup' },
        { icon: '🎫', label: 'Service Requests', path: '/teller/service-requests' },
        { icon: '📋', label: 'Print Statement', path: '/teller/statement' },
        { icon: '🌐', label: 'External Transfer', path: '/teller/external' },
        { icon: '📊', label: 'Branch Reports', path: '/teller/reports' },
    ];

    const restrictedNav = [
        { icon: '🔒', label: 'Freeze Account', path: null, restricted: true },
        { icon: '✅', label: 'Approve Transfers', path: null, restricted: true },
        { icon: '⚙️', label: 'System Config', path: null, restricted: true },
    ];

    return (
        <div className={styles.layout}>
            {/* SIDEBAR */}
            <aside className={styles.sidebar}>
                {/* EMPLOYEE CARD */}
                <div className={styles.employeeCard}>
                    <div className={styles.avatar}>🏦</div>
                    <div className={styles.empInfo}>
                        <div className={styles.empName}>Priya Desai</div>
                        <div className={styles.empRole}>TELLER · BRN-MUM-003</div>
                    </div>
                </div>

                {/* MAIN NAV */}
                <ul className={styles.navList}>
                    {mainNav.map((item) => (
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

                {/* RESTRICTED (greyed out) */}
                <div className={styles.navDivider}></div>
                <ul className={styles.navList}>
                    {restrictedNav.map((item, i) => (
                        <li key={i}>
                            <span className={styles.navLinkRestricted}>
                                <span className={styles.navIcon}>{item.icon}</span>
                                <s>{item.label}</s>
                            </span>
                        </li>
                    ))}
                </ul>
            </aside>

            {/* CONTENT */}
            <div className={styles.contentColumn}>
                {/* MASTHEAD */}
                <header className={styles.masthead}>
                    <div className={styles.bankBrand}>
                        <span className={styles.bankLogo}>S</span>
                        <div>
                            <div className={styles.bankName}>Suraksha <span>Bank</span></div>
                            <div className={styles.bankTagline}>Core Banking System · Mumbai Central (BRN-MUM-003)</div>
                        </div>
                    </div>
                    <div className={styles.sessionInfo}>
                        <div className={styles.sessionLabel}>EMPLOYEE SESSION</div>
                        <div className={styles.sessionTimer}>09:41:22</div>
                    </div>
                </header>

                {/* PAGE CONTENT */}
                <main className={styles.contentArea}>
                    {children}
                </main>

                <footer className={styles.footer}>
                    <div>Suraksha Bank · DBMS Project · 2026</div>
                    <div>BUILD 4.0.2 · MUM-003-NODE-01</div>
                </footer>
            </div>
        </div>
    );
}
