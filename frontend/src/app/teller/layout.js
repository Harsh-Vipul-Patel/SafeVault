'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Monitor,
    CircleDollarSign,
    ArrowDownToLine,
    ArrowRightLeft,
    UserPlus,
    PieChart,
    ShieldCheck,
    BookOpen,
    UserSearch,
    Ticket,
    FileText,
    Globe,
    BarChart3,
    Lock,
    CheckCircle2,
    Settings,
    LogOut,
    Search
} from 'lucide-react';
import styles from './teller.module.css';
import DBNotifications from '../../components/DBNotifications';

export default function TellerLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('suraksha_token');
            if (token) {
                await fetch('http://localhost:5000/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) {
            console.error('Logout API error:', err);
        }
        localStorage.clear();
        router.push('/login');
    };

    const [user, setUser] = useState({ name: 'Loading...', role: 'TELLER', branch: '---' });

    useEffect(() => {
        const storedUser = localStorage.getItem('suraksha_user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                if (!['TELLER', 'BRANCH_MANAGER'].includes(parsedUser.role)) {
                    router.push('/login'); // Redirect unauthorized users
                } else {
                    setUser({
                        name: parsedUser.name || parsedUser.username,
                        role: parsedUser.role,
                        branch: 'MUM-003' // Default branch for now
                    });
                }
            } catch (e) {
                console.error("Failed to parse user", e);
            }
        } else {
            router.push('/login');
        }
    }, [router]);

    // Scroll active link into view
    useEffect(() => {
        const activeLink = document.querySelector(`.${styles.activeLink}`);
        if (activeLink) {
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [pathname]);

    const mainNav = [
        { icon: <Monitor size={18} />, label: 'Counter Queue', path: '/teller/dashboard' },
        { icon: <CircleDollarSign size={18} />, label: 'Deposit Cash', path: '/teller/deposit' },
        { icon: <ArrowDownToLine size={18} />, label: 'Withdrawal', path: '/teller/withdraw' },
        { icon: <ArrowRightLeft size={18} />, label: 'Fund Transfer', path: '/teller/transfer' },
        { icon: <UserPlus size={18} />, label: 'Open Account', path: '/teller/open-account' },
        { icon: <PieChart size={18} />, label: 'Open FD/RD', path: '/teller/open-fd-rd' },
        { icon: <ShieldCheck size={18} />, label: 'Verify KYC', path: '/teller/kyc-verify' },
        { icon: <BookOpen size={18} />, label: 'Cheque Ops', path: '/teller/cheque-ops' },
        { icon: <UserSearch size={18} />, label: 'Customer Lookup', path: '/teller/lookup' },
        { icon: <Ticket size={18} />, label: 'Service Requests', path: '/teller/service-requests' },
        { icon: <FileText size={18} />, label: 'Print Statement', path: '/teller/statement' },
        { icon: <Globe size={18} />, label: 'External Transfer', path: '/teller/external' },
        { icon: <BarChart3 size={18} />, label: 'Branch Reports', path: '/teller/reports' },
    ];

    const restrictedNav = [
        { icon: <Lock size={18} />, label: 'Freeze Account', path: null, restricted: true },
        { icon: <CheckCircle2 size={18} />, label: 'Approve Transfers', path: null, restricted: true },
        { icon: <Settings size={18} />, label: 'System Config', path: null, restricted: true },
    ];

    const sidebarVariants = {
        hidden: { x: -20, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
    };

    const navItemVariants = {
        hidden: { x: -10, opacity: 0 },
        visible: (i) => ({
            x: 0,
            opacity: 1,
            transition: { delay: i * 0.03, duration: 0.3 }
        })
    };

    return (
        <div className={styles.layout}>
            {/* SIDEBAR */}
            <motion.aside
                className={`${styles.sidebar} glass-surface`}
                initial="hidden"
                animate="visible"
                variants={sidebarVariants}
            >
                {/* EMPLOYEE CARD */}
                <div className={styles.employeeCard}>
                    <motion.div
                        className={styles.avatar}
                        whileHover={{ scale: 1.05, rotate: -5 }}
                    >
                        {user.name.charAt(0).toUpperCase()}
                    </motion.div>
                    <div className={styles.empInfo}>
                        <div className={styles.empName}>{user.name}</div>
                        <div className={styles.empRole}>{user.role} · {user.branch}</div>
                    </div>
                </div>

                <div className={styles.searchBox}>
                    <Search size={14} className={styles.searchIcon} />
                    <input type="text" placeholder="Quick Search..." className={styles.searchInput} />
                </div>

                {/* MAIN NAV */}
                <nav className={styles.navMenu}>
                    <ul className={styles.navList}>
                        {mainNav.map((item, i) => (
                            <motion.li key={item.path} custom={i} variants={navItemVariants} initial="hidden" animate="visible">
                                <Link
                                    href={item.path}
                                    className={`${styles.navLink} ${pathname === item.path ? styles.activeLink : ''}`}
                                >
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    <span className={styles.navLabel}>{item.label}</span>
                                    {pathname === item.path && (
                                        <motion.div
                                            className={styles.activeIndicator}
                                            layoutId="tellerNavActive"
                                        />
                                    )}
                                </Link>
                            </motion.li>
                        ))}
                    </ul>

                    {/* RESTRICTED */}
                    <div className={styles.navDivider}></div>
                    <ul className={styles.navList}>
                        {restrictedNav.map((item, i) => (
                            <motion.li key={i} custom={i + mainNav.length} variants={navItemVariants} initial="hidden" animate="visible">
                                <span className={styles.navLinkRestricted}>
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    <span className={styles.navLabel}>{item.label}</span>
                                </span>
                            </motion.li>
                        ))}
                    </ul>
                </nav>

                <motion.button
                    className={styles.logoutBtn}
                    onClick={handleLogout}
                    whileHover={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', color: '#F87171' }}
                    whileTap={{ scale: 0.98 }}
                >
                    <LogOut size={16} /> <span>End Session</span>
                </motion.button>
            </motion.aside>

            {/* CONTENT */}
            <div className={styles.contentColumn}>
                {/* MASTHEAD */}
                <header className={styles.masthead}>
                    <div className={styles.bankBrand}>
                        <div className={styles.bankLogo}>S</div>
                        <div>
                            <div className={styles.bankName}>Safe <span>Vault</span></div>
                            <div className={styles.bankTagline}>Branch Operations · Mumbai Central (BRN-MUM-003)</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <DBNotifications bellClassName="tellerNotificationBell" />
                        <div className={styles.sessionInfo}>
                            <div className={styles.sessionLabel}>ACTIVE EMPLOYEE SESSION</div>
                            <div className={styles.sessionTimer}>09:41:22</div>
                        </div>
                    </div>
                </header>

                {/* PAGE CONTENT */}
                <main className={styles.contentArea}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>

                <footer className={styles.footer}>
                    <div>Safe Vault · Distributed Systems Project · 2026</div>
                    <div className={styles.buildInfo}>
                        <span className={styles.statusDot}></span>
                        NODE-MUM-01 · v4.2.0-STABLE
                    </div>
                </footer>
            </div>
        </div>
    );
}
