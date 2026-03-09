'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function decodeJWT(token) {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload;
    } catch { return null; }
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerDashboard() {
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [userName, setUserName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const token = getToken();
        if (token) {
            const payload = decodeJWT(token);
            if (payload?.name) setUserName(payload.name);
            else if (payload?.username) setUserName(payload.username);
        }

        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch(`${API}/api/customer/accounts`, { headers }).then(r => r.json()),
            fetch(`${API}/api/customer/transactions`, { headers }).then(r => r.json())
        ])
            .then(([accData, txnData]) => {
                setAccounts(accData.accounts || []);
                setTransactions(txnData.transactions || []);
                setLoading(false);
            })
            .catch(() => {
                setError('Could not connect to the server. Please check your connection.');
                setLoading(false);
            });
    }, []);

    const savings = accounts.find(a => (a.TYPE_NAME || a.type_name || '').toLowerCase().includes('saving'));
    const current = accounts.find(a => (a.TYPE_NAME || a.type_name || '').toLowerCase().includes('current'));
    const latestTxn = transactions[0];

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div className={styles.loadingState}>
                    <div className={styles.spinner} />
                    <div>Loading your account data from Oracle…</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            <h1 className={styles.greeting}>
                Welcome back, {userName || 'Customer'}
            </h1>

            {error && <div className={styles.errorBanner}>{error}</div>}

            {/* TOP CARDS ROW */}
            <div className={styles.cardsRow}>
                {savings ? (
                    <div className={styles.summaryCard}>
                        <div className={styles.cardLabel}>
                            {savings.TYPE_NAME || savings.type_name || 'SAVINGS ACCOUNT'}
                        </div>
                        <div className={styles.cardAmount}>
                            {formatINR(savings.BALANCE || savings.balance)}
                        </div>
                        <div className={styles.cardDetail}>
                            {savings.ACCOUNT_ID || savings.account_id}
                            <span className={styles.statusBadge}>
                                {savings.STATUS || savings.status}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className={styles.summaryCard}>
                        <div className={styles.cardLabel}>SAVINGS BALANCE</div>
                        <div className={styles.cardAmount}>—</div>
                        <div className={styles.cardDetail}>No savings account</div>
                    </div>
                )}

                {current ? (
                    <div className={styles.summaryCard}>
                        <div className={styles.cardLabel}>
                            {current.TYPE_NAME || current.type_name || 'CURRENT ACCOUNT'}
                        </div>
                        <div className={styles.cardAmount}>
                            {formatINR(current.BALANCE || current.balance)}
                        </div>
                        <div className={styles.cardDetail}>
                            {current.ACCOUNT_ID || current.account_id}
                        </div>
                    </div>
                ) : accounts[1] ? (
                    <div className={styles.summaryCard}>
                        <div className={styles.cardLabel}>
                            {accounts[1].TYPE_NAME || accounts[1].type_name}
                        </div>
                        <div className={styles.cardAmount}>
                            {formatINR(accounts[1].BALANCE || accounts[1].balance)}
                        </div>
                        <div className={styles.cardDetail}>
                            {accounts[1].ACCOUNT_ID || accounts[1].account_id}
                        </div>
                    </div>
                ) : (
                    <div className={styles.summaryCard}>
                        <div className={styles.cardLabel}>CURRENT ACCOUNT</div>
                        <div className={styles.cardAmount}>—</div>
                        <div className={styles.cardDetail}>No current account</div>
                    </div>
                )}

                <div className={styles.summaryCard}>
                    <div className={styles.cardLabel}>LAST TRANSACTION</div>
                    {latestTxn ? (
                        <>
                            <div className={
                                (latestTxn.TRANSACTION_TYPE || latestTxn.transaction_type || '').includes('CREDIT')
                                    ? styles.cardAmountGreen : styles.cardAmountRed
                            }>
                                {(latestTxn.TRANSACTION_TYPE || latestTxn.transaction_type || '').includes('CREDIT') ? '+' : '-'}
                                {formatINR(latestTxn.AMOUNT || latestTxn.amount)}
                            </div>
                            <div className={styles.cardDetail}>
                                {formatDate(latestTxn.TRANSACTION_DATE || latestTxn.transaction_date)}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.cardAmount}>—</div>
                            <div className={styles.cardDetail}>No transactions yet</div>
                        </>
                    )}
                </div>
            </div>

            {/* TRANSACTIONS TABLE */}
            <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                    <h2 className={styles.tableTitle}>Recent Transactions</h2>
                    <Link href="/customer/statements" className={styles.viewAllLink}>View All →</Link>
                </div>
                <table className={styles.txnTable}>
                    <thead>
                        <tr>
                            <th>DATE</th>
                            <th>DESCRIPTION</th>
                            <th>ACCOUNT</th>
                            <th>AMOUNT</th>
                            <th>BALANCE AFTER</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                                    No transactions found.
                                </td>
                            </tr>
                        ) : transactions.map((t, i) => {
                            const type = t.TRANSACTION_TYPE || t.transaction_type || '';
                            const isCredit = type.includes('CREDIT') || type.includes('DEPOSIT');
                            const amt = t.AMOUNT || t.amount;
                            const bal = t.BALANCE_AFTER || t.balance_after;
                            return (
                                <tr key={t.TRANSACTION_ID || t.transaction_id || i}>
                                    <td>{formatDate(t.TRANSACTION_DATE || t.transaction_date)}</td>
                                    <td>{t.DESCRIPTION || t.description || type}</td>
                                    <td style={{ fontFamily: 'DM Mono', fontSize: '12px' }}>
                                        {t.ACCOUNT_ID || t.account_id}
                                    </td>
                                    <td className={isCredit ? styles.amtPositive : styles.amtNegative}>
                                        {isCredit ? '+' : '-'}{formatINR(amt)}
                                    </td>
                                    <td style={{ fontFamily: 'DM Mono', fontSize: '13px' }}>
                                        {formatINR(bal)}
                                    </td>
                                    <td>
                                        <span className={styles.statusDone}>Done</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ACTIONS ROW */}
            <div className={styles.actionsRow}>
                <Link href="/customer/internal" className={styles.btnPrimary}>
                    <span className={styles.btnIcon}>🔄</span> New Transfer
                </Link>
                <Link href="/customer/statements" className={styles.btnSecondary}>
                    <span className={styles.btnIcon}>📄</span> View Statements
                </Link>
                <Link href="/customer/accounts" className={styles.btnSecondary}>
                    <span className={styles.btnIcon}>💳</span> My Accounts
                </Link>
            </div>
        </div>
    );
}
