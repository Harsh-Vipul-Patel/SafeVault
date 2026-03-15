'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, User, ChevronRight, Info, Eye, EyeOff } from 'lucide-react';
import styles from './login.module.css';

const TEST_CREDENTIALS = [
    { label: 'Customer 1', username: 'ravi.verma', password: 'password123', role: 'CUSTOMER', tag: '₹10.2L' },
    { label: 'Customer 2', username: 'amit.kumar', password: 'password123', role: 'CUSTOMER', tag: '₹1.24L' },
    { label: 'Customer 3', username: 'sunita.rao', password: 'password123', role: 'CUSTOMER', tag: '₹75K' },
    { label: 'Customer 4', username: 'vikram.mehta', password: 'password123', role: 'CUSTOMER', tag: '₹5.4L' },
    { label: 'Teller', username: 'priya.desai', password: 'password123', role: 'TELLER', tag: 'Staff' },
    { label: 'Branch Mgr', username: 'rk.sharma', password: 'password123', role: 'BRANCH_MANAGER', tag: 'Staff' },
    { label: 'Loan Mgr', username: 'a.krishnan', password: 'password123', role: 'LOAN_MANAGER', tag: 'Staff' },
    { label: 'Admin', username: 'sys.root', password: 'password123', role: 'SYSTEM_ADMIN', tag: 'Admin' },
];

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(true);
    const router = useRouter();

    const fillAndLogin = (cred) => {
        setUsername(cred.username);
        setPassword(cred.password);
        setShowGuide(false);
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim(), password }),
            });

            const data = await res.json();
            setLoading(false);

            if (res.ok) {
                localStorage.setItem('suraksha_token', data.token);
                localStorage.setItem('user_role', data.user.role);

                const role = data.user.role.toUpperCase();
                if (role === 'CUSTOMER') router.push('/customer/dashboard');
                else if (role === 'TELLER') router.push('/teller/dashboard');
                else if (role === 'BRANCH_MANAGER') router.push('/manager/dashboard');
                else if (role === 'LOAN_MANAGER') router.push('/loan/dashboard');
                else if (role === 'SYSTEM_ADMIN') router.push('/admin/dashboard');
                else router.push('/');
            } else {
                setError(data.message || 'Login failed. Please check your credentials.');
            }
        } catch {
            setLoading(false);
            setError('Cannot connect to server. Please ensure the backend is running on port 5000.');
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div className={styles.container}>
            <div className={styles.glowTop}></div>
            <div className={styles.glowBottom}></div>

            <motion.div
                className={`${styles.loginCard} pearl-card`}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <motion.div className={styles.logoStack} variants={containerVariants} initial="hidden" animate="visible">
                    <motion.div className={styles.logoIcon} variants={itemVariants}>
                        <Shield size={40} className={styles.shieldIcon} />
                    </motion.div>
                    <motion.div className={`${styles.bankName} text-gradient-gold`} variants={itemVariants}>
                        Safe <span>Vault</span>
                    </motion.div>
                    <motion.div className={styles.tagline} variants={itemVariants}>
                        Safe Vault System · Secure Individual Login
                    </motion.div>
                </motion.div>

                <motion.form
                    onSubmit={handleLogin}
                    className={styles.formContainer}
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    <AnimatePresence>
                        {error && (
                            <motion.div
                                className={styles.errorMsg}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                            >
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <motion.div className={styles.inputGroup} variants={itemVariants}>
                        <label><User size={14} /> Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. ravi.verma"
                            autoComplete="username"
                            required
                        />
                    </motion.div>

                    <motion.div className={styles.inputGroup} variants={itemVariants}>
                        <label><Lock size={14} /> Password</label>
                        <div className={styles.passwordWrapper}>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className={styles.eyeBtn}
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </motion.div>

                    <motion.button
                        type="submit"
                        className={styles.loginBtn}
                        disabled={loading}
                        variants={itemVariants}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {loading ? 'AUTHENTICATING…' : (
                            <>SECURE LOGIN <ChevronRight size={18} /></>
                        )}
                    </motion.button>
                </motion.form>

                {/* Test credentials guide */}
                <motion.div className={styles.credGuideWrap} variants={itemVariants} initial="hidden" animate="visible">
                    <button
                        className={styles.credToggle}
                        onClick={() => setShowGuide(g => !g)}
                        type="button"
                    >
                        <Info size={14} /> {showGuide ? 'Hide' : 'Show'} Word Bank (Test Credentials)
                    </button>

                    <AnimatePresence>
                        {showGuide && (
                            <motion.div
                                className={styles.credGrid}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                            >
                                {TEST_CREDENTIALS.map((c) => (
                                    <motion.button
                                        key={c.username}
                                        className={`${styles.credCard} ${c.role === 'CUSTOMER' ? styles.credCustomer : styles.credStaff}`}
                                        onClick={() => fillAndLogin(c)}
                                        whileHover={{ x: 5, backgroundColor: 'rgba(255,255,255,0.05)' }}
                                        type="button"
                                    >
                                        <div className={styles.credLabel}>{c.label}</div>
                                        <div className={styles.credUser}>{c.username}</div>
                                        <div className={styles.credTag}>{c.tag}</div>
                                    </motion.button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                <motion.div className={styles.footerLinks} variants={itemVariants}>
                    <a href="#">Forgot Password?</a>
                    <a href="#">Contact IT Support</a>
                </motion.div>
            </motion.div>
        </div>
    );
}
