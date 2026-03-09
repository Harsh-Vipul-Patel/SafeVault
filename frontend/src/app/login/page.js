'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

const TEST_CREDENTIALS = [
    { label: 'Customer 1', username: 'ravi.verma', password: 'password', role: 'CUSTOMER', tag: '₹10.2L' },
    { label: 'Customer 2', username: 'amit.kumar', password: 'password', role: 'CUSTOMER', tag: '₹1.24L' },
    { label: 'Customer 3', username: 'sunita.rao', password: 'password', role: 'CUSTOMER', tag: '₹75K' },
    { label: 'Customer 4', username: 'vikram.mehta', password: 'password', role: 'CUSTOMER', tag: '₹5.4L' },
    { label: 'Teller', username: 'priya.desai', password: 'password', role: 'TELLER', tag: 'Staff' },
    { label: 'Branch Mgr', username: 'rk.sharma', password: 'password', role: 'BRANCH_MANAGER', tag: 'Staff' },
    { label: 'Loan Mgr', username: 'a.krishnan', password: 'password', role: 'LOAN_MANAGER', tag: 'Staff' },
    { label: 'Admin', username: 'sys.root', password: 'password', role: 'SYSTEM_ADMIN', tag: 'Admin' },
];

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showGuide, setShowGuide] = useState(false);
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

    return (
        <div className={styles.container}>
            <div className={styles.glowTop}></div>
            <div className={styles.glowBottom}></div>

            <div className={styles.loginCard}>
                <div className={styles.logoStack}>
                    <div className={styles.bankName}>Suraksha <span>Bank</span></div>
                    <div className={styles.tagline}>Safe Vault System · Secure Individual Login</div>
                </div>

                <form onSubmit={handleLogin} className={styles.formContainer}>
                    {error && <div className={styles.errorMsg}>{error}</div>}

                    <div className={styles.inputGroup}>
                        <label>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="e.g. ravi.verma"
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    <button type="submit" className={styles.loginBtn} disabled={loading}>
                        {loading ? 'AUTHENTICATING…' : 'SECURE LOGIN ➔'}
                    </button>
                </form>

                {/* Test credentials guide */}
                <div className={styles.credGuideWrap}>
                    <button
                        className={styles.credToggle}
                        onClick={() => setShowGuide(g => !g)}
                        type="button"
                    >
                        {showGuide ? '▲ Hide' : '▼ Show'} Demo Credentials
                    </button>

                    {showGuide && (
                        <div className={styles.credGrid}>
                            {TEST_CREDENTIALS.map((c) => (
                                <button
                                    key={c.username}
                                    className={`${styles.credCard} ${c.role === 'CUSTOMER' ? styles.credCustomer : styles.credStaff}`}
                                    onClick={() => fillAndLogin(c)}
                                    type="button"
                                >
                                    <div className={styles.credLabel}>{c.label}</div>
                                    <div className={styles.credUser}>{c.username}</div>
                                    <div className={styles.credTag}>{c.tag}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.footerLinks}>
                    <a href="#">Forgot Password?</a>
                    <a href="#">Contact IT Support</a>
                </div>
            </div>
        </div>
    );
}
