'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = 'http://localhost:5000';

function formatINR(amount) {
    if (amount === null || amount === undefined) return '—';
    return '₹ ' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CustomerAccounts() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('suraksha_token');
        fetch(`${API}/api/customer/accounts`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => {
                if (!r.ok) throw new Error('Failed to fetch accounts');
                return r.json();
            })
            .then(data => {
                setAccounts(data.accounts || []);
                setLoading(false);
            })
            .catch((err) => {
                console.error('Accounts fetch error:', err);
                setError('Could not load accounts. Is the backend running?');
                setAccounts([]);
                setLoading(false);
            });
    }, []);

    // Poll for balance updates every 15s
    useEffect(() => {
        const interval = setInterval(() => {
            const token = localStorage.getItem('suraksha_token');
            fetch(`${API}/api/customer/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
                .then(r => r.json())
                .then(data => {
                    if (data.accounts && data.accounts.length > 0) setAccounts(data.accounts);
                })
                .catch(() => { });
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className={styles.loading}>Loading accounts from Oracle DB…</div>;

    return (
        <div className={styles.pageWrap}>
            <h1 className={styles.pageTitle}>My Accounts</h1>
            {error && <div className={styles.errorBanner}>{error}</div>}
            <div className={styles.accountGrid}>
                {accounts.map(acc => (
                    <AccountCard key={acc.ACCOUNT_ID || acc.account_id} acc={acc} />
                ))}
                {accounts.length === 0 && <div className={styles.emptyMsg}>No accounts found.</div>}
            </div>
        </div>
    );
}

function AccountCard({ acc }) {
    // Handle both uppercase (Oracle) and lowercase column names
    const id = acc.ACCOUNT_ID || acc.account_id;
    const number = acc.ACCOUNT_NUMBER || acc.account_number || id;
    const typeName = acc.TYPE_NAME || acc.type_name || 'Savings Account';
    const balance = acc.BALANCE || acc.balance || 0;
    const status = acc.STATUS || acc.status || 'ACTIVE';
    const minBal = acc.MINIMUM_BALANCE || acc.minimum_balance || 0;
    const nominee = acc.NOMINEE_NAME || acc.nominee_name || 'N/A';
    const branch = acc.BRANCH_NAME || acc.branch_name || 'Mumbai Central (003)';
    const interestRate = acc.INTEREST_RATE || acc.interest_rate;

    return (
        <div className={styles.accountCard}>
            <div className={styles.accHeader}>
                <div>
                    <div className={styles.accType}>{typeName}</div>
                    <div className={styles.accNumber}>{id}</div>
                </div>
                <div className={status === 'ACTIVE' ? styles.accStatusActive : styles.accStatusFrozen}>
                    {status}
                </div>
            </div>

            <div className={styles.accBalanceWrap}>
                <div className={styles.accBalLabel}>AVAILABLE BALANCE</div>
                <div className={styles.accBalance}>{formatINR(balance)}</div>
            </div>

            <div className={styles.accDetails}>
                {interestRate !== undefined && interestRate !== null && (
                    <div className={styles.detailRow}>
                        <span>Interest Rate:</span>
                        <span>{(Number(interestRate) * 100).toFixed(2)}% p.a.</span>
                    </div>
                )}
                <div className={styles.detailRow}>
                    <span>Min. Balance:</span>
                    <span>{formatINR(minBal)}</span>
                </div>
                <div className={styles.detailRow}>
                    <span>Nominee:</span>
                    <span>{nominee || 'N/A'}</span>
                </div>
                <div className={styles.detailRow}>
                    <span>Home Branch:</span>
                    <span>{branch}</span>
                </div>
            </div>

            <div className={styles.accActions}>
                <Link href="/customer/statements" className={styles.btnAction}>View Statement</Link>
                <Link href="/customer/internal" className={styles.btnAction}>Transfer Funds</Link>
            </div>
        </div>
    );
}

