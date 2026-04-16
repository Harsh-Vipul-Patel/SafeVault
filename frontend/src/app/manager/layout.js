'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    TrendingUp,
    BarChart3,
    CheckSquare,
    ShieldAlert,
    Handshake,
    Users,
    CalendarClock,
    History,
    Ticket,
    UserPlus,
    Settings,
    LogOut,
    Bell,
    ChevronRight,
    Search
} from 'lucide-react';
import styles from './manager.module.css';
import UserNotifications from '../../components/UserNotifications';
import RouteGuard from '../../components/RouteGuard';
import SidebarNav from '../../components/SidebarNav';

export default function ManagerLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = async () => {
        try {
            const token = localStorage.getItem('suraksha_token');
            if (token) {
                await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
        } catch (err) {
            console.error('Logout API error:', err);
        }
        localStorage.clear();
        router.replace('/login');
    };

    const [user, setUser] = useState({ name: 'Loading...', role: 'BRANCH_MANAGER', branch: '---' });

    useEffect(() => {
        const storedUser = localStorage.getItem('suraksha_user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                if (!['BRANCH_MANAGER'].includes(parsedUser.role)) {
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



    const navItems = [
        { icon: <TrendingUp size={18} />, label: 'Branch Overview', path: '/manager/dashboard' },
        { icon: <BarChart3 size={18} />, label: 'MIS Dashboard', path: '/manager/mis-dashboard' },
        { icon: <CheckSquare size={18} />, label: 'Dual Approval Queue', path: '/manager/approvals' },
        { icon: <ShieldAlert size={18} />, label: 'Compliance & Flags', path: '/manager/compliance' },
        { icon: <Handshake size={18} />, label: 'Settle Transfers', path: '/manager/settlement' },
        { icon: <Users size={18} />, label: 'Account Lifecycle', path: '/manager/accounts' },
        { icon: <CalendarClock size={18} />, label: 'Mature Deposits', path: '/manager/fd-rd-maturity' },
        { icon: <History size={18} />, label: 'Branch Audit Log', path: '/manager/audit' },
        { icon: <Ticket size={18} />, label: 'Assign Service Requests', path: '/manager/service-requests' },
        { icon: <UserPlus size={18} />, label: 'Staff Management', path: '/manager/staff' },
        { icon: <Settings size={18} />, label: 'Batch Job Status', path: '/manager/batch-jobs' },
    ];

    const sidebarVariants = {
        hidden: { x: -30, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.6, ease: "easeOut" } }
    };

    const activeItem = navItems.find(item => item.path === pathname);

    return (
        <RouteGuard allowedRoles={['BRANCH_MANAGER']}>
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
                    <div className={styles.branchName}>Authorized Branch Manager · Mumbai (003)</div>
                </div>

                <div className={styles.managerProfile}>
                    <motion.div
                        className={styles.avatar}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                        transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                        {user.name.charAt(0).toUpperCase()}
                    </motion.div>
                    <div className={styles.info}>
                        <div className={styles.name}>{user.name}</div>
                        <div className={styles.role}>{user.role}</div>
                    </div>
                </div>

                <div className={styles.searchContainer}>
                    <Search size={14} className={styles.searchIcon} />
                    <input type="text" placeholder="Global System Search..." className={styles.sidebarSearch} />
                </div>

                <div className={styles.navSection}>OPERATIONS & OVERSIGHT</div>
                <nav className={styles.navMenu}>
                    <SidebarNav
                        activePath={pathname}
                        groups={[
                            { title: 'Operations & Oversight', items: navItems }
                        ]}
                    />
                </nav>

                <motion.button
                    className={styles.logoutBtn}
                    onClick={handleLogout}
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
                        Manager Console <ChevronRight size={14} /> <span className={styles.crumbActive}>{activeItem?.label || 'Dashboard'}</span>
                    </div>
                    <div className={styles.topActions}>
                        <div className={styles.dateStamp}>
                            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} •
                            <span className={styles.timeGlow}> LIVE</span>
                        </div>
                        <div className={styles.actionBtn}><Settings size={18} /></div>
                        <UserNotifications bellClassName={styles.notificationBtn} />
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
        </RouteGuard>
    );
}
