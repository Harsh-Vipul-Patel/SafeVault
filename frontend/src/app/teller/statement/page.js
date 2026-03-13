'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function PrintStatement() {
    const [acctId, setAcctId] = useState('');
    const [range, setRange] = useState('30d');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);
    const [account, setAccount] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [fetched, setFetched] = useState(false);

    const handleFetch = async (e) => {
        e.preventDefault();
        if (!acctId.trim()) return;
        setLoading(true); setMsg(null); setTransactions([]); setFetched(false); setAccount(null);
        try {
            const res = await fetch(`${API}/api/teller/statement?accountId=${encodeURIComponent(acctId.trim())}&range=${range}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (res.ok) {
                setAccount(data.account || null);
                setTransactions(data.transactions || []);
                setFetched(true);
                if (!data.transactions?.length) setMsg({ type: 'info', text: 'No transactions found for this period.' });
            } else {
                setMsg({ type: 'error', text: data.message || 'Could not fetch statement.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error. Is the backend running?' });
        }
        setLoading(false);
    };

    const handlePrint = () => {
        window.print();
    };

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const formatINR = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '800px' }}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Print Customer Statement</div>
                <div className={styles.headerSubtitle}>Generates physical copy · Fetches from Oracle TRANSACTIONS table</div>
            </header>

            <form className={styles.formPanel} onSubmit={handleFetch}>
                <div className={styles.formGroup}>
                    <label>Customer Account Number</label>
                    <div className={styles.lookupGroup}>
                        <input type="text" className={styles.input} placeholder="e.g. ACC-MUM-003-XXXX" value={acctId} onChange={e => setAcctId(e.target.value)} required />
                        <button type="button" className={styles.btnSecondary} onClick={() => setAcctId('ACC-MUM-003-8821')}>TEST FILL</button>
                    </div>
                </div>

                <div className={styles.formGroup}>
                    <label>Date Range</label>
                    <select className={styles.input} value={range} onChange={e => setRange(e.target.value)}>
                        <option value="30d">Last 30 Days (Standard)</option>
                        <option value="3m">Last 3 Months</option>
                        <option value="fytd">Financial Year to Date (FYTD)</option>
                    </select>
                </div>

                {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button type="submit" className={styles.btnPrimary} style={{ flex: 1 }} disabled={loading}>
                        {loading ? 'QUERYING ORACLE…' : '📋 FETCH STATEMENT'}
                    </button>
                    {fetched && transactions.length > 0 && (
                        <button type="button" className={styles.btnSecondary} onClick={handlePrint}>
                            🖨 PRINT
                        </button>
                    )}
                </div>
            </form>

            {fetched && account && (
                <div style={{ background: '#1E2536', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ padding: '16px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#E2E8F0' }}>{account.CUSTOMER_NAME || account.customer_name}</div>
                            <div style={{ fontSize: '11px', color: '#64748B', fontFamily: 'DM Mono', marginTop: '2px' }}>{account.ACCOUNT_ID || account.account_id} · {account.TYPE_NAME || account.type_name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>CLOSING BALANCE</div>
                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#EAB308' }}>{formatINR(account.BALANCE || account.balance)}</div>
                        </div>
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                                {['DATE', 'DESCRIPTION', 'TYPE', 'AMOUNT', 'BALANCE'].map(h => (
                                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', color: '#64748B', fontFamily: 'DM Mono', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((t, i) => {
                                const type = t.TRANSACTION_TYPE || t.transaction_type || '';
                                const isCredit = type.toUpperCase().includes('CREDIT') || type.toUpperCase().includes('DEPOSIT');
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748B' }}>{formatDate(t.TRANSACTION_DATE || t.transaction_date)}</td>
                                        <td style={{ padding: '10px 16px', fontSize: '13px', color: '#E2E8F0' }}>{t.DESCRIPTION || t.description || '—'}</td>
                                        <td style={{ padding: '10px 16px', fontSize: '11px', color: '#94A3B8' }}>{type}</td>
                                        <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: '13px', fontWeight: 700, color: isCredit ? '#10B981' : '#EF4444' }}>
                                            {isCredit ? '+' : '-'}{formatINR(t.AMOUNT || t.amount)}
                                        </td>
                                        <td style={{ padding: '10px 16px', fontFamily: 'DM Mono', fontSize: '12px', color: '#94A3B8' }}>{formatINR(t.BALANCE_AFTER || t.balance_after)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
                        {transactions.length} transaction(s) · Generated: {new Date().toLocaleString('en-IN')} · Safe Vault — Mumbai Central Branch
                    </div>
                </div>
            )}
        </div>
    );
}
