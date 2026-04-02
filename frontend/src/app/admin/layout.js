'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity,
    BarChart3,
    CreditCard,
    Users,
    MapPin,
    Settings,
    ShieldCheck,
    Lock,
    Clock,
    HardDrive,
    LogOut,
    ChevronRight,
    Search,
    Cpu,
    Database
} from 'lucide-react';
import styles from './admin.module.css';
import DBNotifications from '../../components/DBNotifications';
import RouteGuard from '../../components/RouteGuard';

export default function AdminLayout({ children }) {
    const pathname = usePathname();
    const router = useRouter();
    const [userName, setUserName] = useState('System Root');

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
        router.replace('/login');
    };

    // Scroll active link into view
    useEffect(() => {
        const activeLink = document.querySelector(`.${styles.activeNav}`);
        if (activeLink) {
            activeLink.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [pathname]);

    useEffect(() => {
        const storedUser = localStorage.getItem('suraksha_user');
        if (!storedUser) {
            router.push('/login');
            return;
        }

        try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser.role !== 'SYSTEM_ADMIN') {
                router.push('/login');
                return;
            }
            setUserName(parsedUser.name || parsedUser.username || 'System Root');
        } catch (e) {
            console.error('Failed to parse user profile', e);
            router.push('/login');
        }
    }, [router]);

    const navItems = [
        { icon: <Activity size={18} />, label: 'System Monitor', path: '/admin/dashboard' },
        { icon: <BarChart3 size={18} />, label: 'Global MIS', path: '/admin/mis-dashboard' },
        { icon: <CreditCard size={18} />, label: 'Fee Management', path: '/admin/fees' },
        { icon: <Users size={18} />, label: 'User Provisioning', path: '/admin/users' },
        { icon: <MapPin size={18} />, label: 'Branch Management', path: '/admin/branches' },
        { icon: <Settings size={18} />, label: 'System Configuration', path: '/admin/config' },
        { icon: <ShieldCheck size={18} />, label: 'Global Audit Log', path: '/admin/audit' },
        { icon: <Lock size={18} />, label: 'Roles & Permissions', path: '/admin/roles' },
        { icon: <Clock size={18} />, label: 'Scheduler/Batch Jobs', path: '/admin/scheduler' },
        { icon: <HardDrive size={18} />, label: 'Backup & Recovery', path: '/admin/backup' },
    ];

    const sidebarVariants = {
        hidden: { x: -40, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
    };

    const navItemVariants = {
        hidden: { opacity: 0, x: -15 },
        visible: (i) => ({
            opacity: 1,
            x: 0,
            transition: { delay: 0.04 * i, duration: 0.4 }
        })
    };

    const activeItem = navItems.find(item => item.path === pathname);

    return (
        <RouteGuard allowedRoles={['SYSTEM_ADMIN']}>
        <div className={styles.layout}>
            {/* SIDEBAR NAVIGATION (Darker Theme for Admin) */}
            <motion.aside
                className={`${styles.sidebar} glass-surface`}
                initial="hidden"
                animate="visible"
                variants={sidebarVariants}
            >
                <div className={styles.brandBox}>
                    <div className={styles.bankName}>Safe <span>Vault</span></div>
                    <motion.div
                        className={styles.consoleTag}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 }}
                    >
                        ROOT ACCESS · SYSTEM INFRASTRUCTURE
                    </motion.div>
                </div>

                <div className={styles.adminProfile}>
                    <motion.div
                        className={styles.avatar}
                        whileHover={{ scale: 1.05, filter: "brightness(1.2)" }}
                    >
                        <Cpu size={20} />
                    </motion.div>
                    <div className={styles.info}>
                        <div className={styles.name}>{userName}</div>
                        <div className={styles.role}>E/S Level: 0 (ABSOLUTE)</div>
                    </div>
                </div>

                <div className={styles.searchContainer}>
                    <Search size={14} className={styles.searchIcon} />
                    <input type="text" placeholder="Terminal Command / Search..." className={styles.adminSearch} />
                </div>

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
                                            layoutId="adminNavActive"
                                        />
                                    )}
                                </Link>
                            </motion.li>
                        ))}
                    </ul>
                </nav>

                <motion.button
                    className={styles.dangerBtn}
                    onClick={handleLogout}
                    whileHover={{ backgroundColor: 'rgba(255, 74, 74, 0.1)', scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    <LogOut size={14} /> <span>TERMINATE SESSION</span>
                </motion.button>
            </motion.aside>

            {/* MAIN CONTENT AREA */}
            <main className={styles.mainContent}>
                <header className={styles.topbar}>
                    <div className={styles.systemStatus}>
                        <span className={styles.pulse}></span>
                        <Database size={14} /> NOMINAL · ORACLE-CORE-01 · MUM-NODE-ROOT
                    </div>
                    <div className={styles.topActions}>
                        <div className={styles.breadcrumb}>
                            Admin Console <ChevronRight size={14} /> <span className={styles.crumbActive}>{activeItem?.label || 'Infrastructure'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <DBNotifications bellClassName="adminNotificationBell" />
                            <div className={styles.dateStamp}>
                                {new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST
                            </div>
                        </div>
                    </div>
                </header>

                <div className={styles.contentWrap}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={pathname}
                            initial={{ opacity: 0, scale: 0.99, filter: "blur(4px)" }}
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 1.01, filter: "blur(4px)" }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
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
