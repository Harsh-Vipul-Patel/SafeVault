'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    CreditCard,
    PieChart,
    RefreshCw,
    Globe,
    Users,
    Clock,
    FileText,
    ShieldCheck,
    Ticket,
    BookOpen,
    User,
    PhoneCall,
    LogOut,
    ChevronRight,
    Landmark
} from 'lucide-react';
import styles from './customer.module.css';
import UserNotifications from '../../components/UserNotifications';
import RouteGuard from '../../components/RouteGuard';
import SidebarNav from '../../components/SidebarNav';

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
    }, [router]);



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
            console.error('Logout API failed:', err);
        }
        localStorage.clear();
        router.replace('/login');
    };

    const topNavItems = [
        { icon: <LayoutDashboard size={18} />, label: 'Dashboard', path: '/customer/dashboard' },
        { icon: <CreditCard size={18} />, label: 'My Accounts', path: '/customer/accounts' },
        { icon: <PieChart size={18} />, label: 'Fixed/Recurring Deposits', path: '/customer/deposits' },
        { icon: <RefreshCw size={18} />, label: 'Transfer Funds', path: '/customer/internal' },
        { icon: <Globe size={18} />, label: 'External Transfer', path: '/customer/external' },
        { icon: <Users size={18} />, label: 'Manage Beneficiaries', path: '/customer/beneficiaries' },
        { icon: <Clock size={18} />, label: 'Standing Instructions', path: '/customer/standing-instructions' },
        { icon: <Landmark size={18} />, label: 'My Loans', path: '/customer/loans' },
        { icon: <FileText size={18} />, label: 'Statements', path: '/customer/statements' },
    ];

    const bottomNavItems = [
        { icon: <ShieldCheck size={18} />, label: 'My KYC Status', path: '/customer/kyc' },
        { icon: <Ticket size={18} />, label: 'Service Requests', path: '/customer/service-requests' },
        { icon: <BookOpen size={18} />, label: 'Cheque Management', path: '/customer/cheque-management' },
        { icon: <User size={18} />, label: 'Profile & Security', path: '/customer/profile' },
        { icon: <PhoneCall size={18} />, label: 'Contact Branch', path: '/customer/support' }
    ];

    const sidebarVariants = {
        hidden: { x: -20, opacity: 0 },
        visible: { x: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } }
    };

    return (
        <RouteGuard allowedRoles={['CUSTOMER']}>
        <div className={styles.layout}>
            {/* SIDEBAR */}
            <motion.aside
                className={`${styles.sidebar} glass-surface`}
                initial="hidden"
                animate="visible"
                variants={sidebarVariants}
            >
                <div className={styles.brand}>
                    <div className={styles.brandDot}></div>
                    <span className={styles.brandName}>Safe Vault</span>
                </div>

                <div className={styles.userProfile}>
                    <motion.div
                        className={styles.avatar}
                        whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                        {initials}
                    </motion.div>
                    <div className={styles.userInfo}>
                        <div className={styles.userName}>{userName}</div>
                        <div className={styles.userRole}>Premium Member</div>
                    </div>
                </div>

                <nav className={styles.navMenu}>
                    <SidebarNav
                        activePath={pathname}
                        groups={[
                            { title: 'Accounts & Transfers', items: topNavItems },
                            { title: 'Services & Profile', items: bottomNavItems }
                        ]}
                    />
                </nav>

                <motion.button
                    className={styles.logoutBtn}
                    onClick={handleLogout}
                    whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#F87171' }}
                    whileTap={{ scale: 0.95 }}
                >
                    <LogOut size={18} /> <span>Secure Logout</span>
                </motion.button>
            </motion.aside>

            {/* PAGE CONTENT */}
            <main className={styles.mainContent}>
                <header className={styles.topBar}>
                    <div className={styles.breadcrumb}>
                        Safe Vault Portal <ChevronRight size={14} /> <span>{topNavItems.find(i => i.path === pathname)?.label || bottomNavItems.find(i => i.path === pathname)?.label || 'Dashboard'}</span>
                    </div>
                    <div className={styles.topActions}>
                        <UserNotifications bellClassName={styles.notificationBell} />
                    </div>
                </header>
                <div className={styles.pageBody}>
                    {children}
                </div>
            </main>
        </div>
        </RouteGuard>
    );
}
