'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart,
    FilePlus,
    ClipboardList,
    Banknote,
    RotateCcw,
    Settings,
    LogOut,
    Bell,
    ChevronRight,
    Search,
    Briefcase
} from 'lucide-react';
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

    // Scroll active link into view
    useEffect(() => {
        const activeLink = document.querySelector(`.${styles.activeNav}`);
        if (activeLink) {
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [pathname]);

    const navItems = [
        { icon: <PieChart size={18} />, label: 'Portfolio Dashboard', path: '/loan/dashboard' },
        { icon: <FilePlus size={18} />, label: 'Application Intake', path: '/loan/intake' },
        { icon: <ClipboardList size={18} />, label: 'App Tracking & Status', path: '/loan/applications' },
        { icon: <Banknote size={18} />, label: 'Loan Disbursements', path: '/loan/disburse' },
        { icon: <RotateCcw size={18} />, label: 'EMI Repayments', path: '/loan/repayments' },
    ];

    const sidebarVariants = {
        hidden: { x: -30, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
    };

    const navItemVariants = {
        hidden: { opacity: 0, x: -10 },
        visible: (i) => ({
            opacity: 1,
            x: 0,
            transition: { delay: 0.05 * i, duration: 0.3 }
        })
    };

    const activeItem = navItems.find(item => item.path === pathname);

    if (!hydrated) return null;

    return (
        <div className={styles.layout}>
            {/* SIDEBAR NAVIGATION */}
            <motion.aside
                className={`${styles.sidebar} glass-surface`}
                initial="hidden"
                animate="visible"
                variants={sidebarVariants}
            >
                <div className={styles.brandBox}>
                    <div className={styles.bankName}>Safe <span>Vault</span></div>
                    <div className={styles.branchName}>Loan Division · Mumbai (003)</div>
                </div>

                <div className={styles.managerProfile}>
                    <motion.div
                        className={styles.avatar}
                        whileHover={{ scale: 1.1, rotate: -5 }}
                        transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                        <Briefcase size={20} />
                    </motion.div>
                    <div className={styles.info}>
                        <div className={styles.name}>A. Krishnan</div>
                        <div className={styles.role}>LOAN OFFICER · GRADE II</div>
                    </div>
                </div>

                <div className={styles.searchContainer}>
                    <Search size={14} className={styles.searchIcon} />
                    <input type="text" placeholder="Search Loan Records..." className={styles.sidebarSearch} />
                </div>

                <div className={styles.navSection}>LENDING OPERATIONS</div>
                <nav className={styles.navMenu}>
                    <ul className={styles.navList}>
                        {navItems.map((item, i) => (
                            <motion.li
                                key={item.path}
                                custom={i}
                                variants={navItemVariants}
                                initial="hidden"
                                animate="visible"
                                className={pathname === item.path ? styles.activeNav : ''}
                            >
                                <Link href={item.path}>
                                    <span className={styles.navIcon}>{item.icon}</span>
                                    <span className={styles.navLabel}>{item.label}</span>
                                    {pathname === item.path && (
                                        <motion.div
                                            className={styles.activeIndicator}
                                            layoutId="loanNavActive"
                                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                        />
                                    )}
                                </Link>
                            </motion.li>
                        ))}
                    </ul>
                </nav>

                <motion.button
                    onClick={handleLogout}
                    className={styles.logoutBtn}
                    whileHover={{ scale: 1.02, backgroundColor: 'rgba(255, 60, 60, 0.1)' }}
                    whileTap={{ scale: 0.98 }}
                >
                    <LogOut size={14} /> <span>End Secure Session</span>
                </motion.button>
            </motion.aside>

            {/* MAIN CONTENT AREA */}
            <main className={styles.mainContent}>
                <header className={styles.topbar}>
                    <div className={styles.breadcrumb}>
                        Lending Console <ChevronRight size={14} /> <span className={styles.crumbActive}>{activeItem?.label || 'Dashboard'}</span>
                    </div>
                    <div className={styles.topActions}>
                        <div className={styles.dateStamp}>
                            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            <span className={styles.statusDot}></span>
                        </div>
                        <div className={styles.actionBtn}><Settings size={18} /></div>
                        <div className={styles.notificationBtn}>
                            <Bell size={18} />
                            <span className={styles.notifBadge}></span>
                        </div>
                    </div>
                </header>

                <div className={styles.contentWrap}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
