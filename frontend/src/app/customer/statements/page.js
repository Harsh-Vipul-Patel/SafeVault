'use client';
import { useState, useEffect } from 'react';
import styles from './page.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

function formatINR(n) {
    if (n === null || n === undefined) return '—';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CustomerStatements() {
    const [accounts, setAccounts] = useState([]);
    const [selectedAcc, setSelectedAcc] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [transactions, setTransactions] = useState([]);
    const [loadingAccts, setLoadingAccts] = useState(true);
    const [loadingTxns, setLoadingTxns] = useState(false);
    const [fetched, setFetched] = useState(false);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        fetch(`${API}/api/customer/accounts`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        })
            .then(r => r.json())
            .then(data => {
                const accts = data.accounts || [];
                setAccounts(accts);
                if (accts.length > 0) setSelectedAcc(accts[0].ACCOUNT_ID || accts[0].account_id);
                setLoadingAccts(false);
            })
            .catch(() => setLoadingAccts(false));
    }, []);

    const handleFetch = async () => {
        if (!selectedAcc) return;
        setLoadingTxns(true); setMsg(null); setTransactions([]); setFetched(false);
        let url = `${API}/api/customer/statements?accountId=${encodeURIComponent(selectedAcc)}`;
        if (fromDate) url += `&fromDate=${fromDate}`;
        if (toDate) url += `&toDate=${toDate}`;
        try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
            const data = await res.json();
            if (res.ok) {
                setTransactions(data.transactions || []);
                setFetched(true);
                if (!data.transactions?.length) setMsg({ type: 'info', text: 'No transactions found for this date range.' });
            } else {
                setMsg({ type: 'error', text: data.message || 'Could not load statement.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error. Is the backend running?' });
        }
        setLoadingTxns(false);
    };

    const handleDownload = async () => {
        if (!selectedAcc) return;
        setMsg({ type: 'info', text: 'Generating PDF...' });
        let url = `${API}/api/customer/statements/download?accountId=${encodeURIComponent(selectedAcc)}`;
        if (fromDate) url += `&fromDate=${fromDate}`;
        if (toDate) url += `&toDate=${toDate}`;
        try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });
            if (res.ok) {
                const blob = await res.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = downloadUrl;
                a.download = `statement_${selectedAcc}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(downloadUrl);
                setMsg({ type: 'success', text: 'Download completed.' });
            } else {
                const data = await res.json();
                setMsg({ type: 'error', text: data.message || 'Could not download statement.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error preventing download.' });
        }
    };

    const handleEmail = async () => {
        if (!selectedAcc) return;
        setMsg({ type: 'info', text: 'Sending email...' });
        const bodyPayload = { accountId: selectedAcc };
        if (fromDate) bodyPayload.fromDate = fromDate;
        if (toDate) bodyPayload.toDate = toDate;
        try {
            const res = await fetch(`${API}/api/customer/statements/email`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bodyPayload)
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: data.message || 'Email sent successfully!' });
            } else {
                setMsg({ type: 'error', text: data.message || 'Failed to email statement.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error preventing email generation.' });
        }
    };

    const accInfo = accounts.find(a => (a.ACCOUNT_ID || a.account_id) === selectedAcc);
    let totalCredit = 0, totalDebit = 0;
    for (const t of transactions) {
        const type = (t.TRANSACTION_TYPE || t.transaction_type || '').toUpperCase();
        const amt = Number(t.AMOUNT || t.amount || 0);
        if (type.includes('CREDIT') || type.includes('DEPOSIT')) totalCredit += amt;
        else totalDebit += amt;
    }

    return (
        <div className={styles.pageWrap}>
            <h1 className={styles.pageTitle}>Account Statements</h1>

            <div className={styles.contentGrid}>
                <div className={styles.filterPanel}>
                    <h2 className={styles.sectionTitle}>Generate Statement</h2>

                    <div className={styles.formGroup}>
                        <label>Select Account</label>
                        {loadingAccts ? (
                            <div style={{ color: '#64748B', fontSize: '13px' }}>Loading accounts…</div>
                        ) : (
                            <select className={styles.input} value={selectedAcc} onChange={e => setSelectedAcc(e.target.value)}>
                                {accounts.map(acc => {
                                    const id = acc.ACCOUNT_ID || acc.account_id;
                                    const type = acc.TYPE_NAME || acc.type_name;
                                    return <option key={id} value={id}>{type} — {id}</option>;
                                })}
                            </select>
                        )}
                        {accInfo && (
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                                Balance: <strong style={{ color: '#10B981' }}>{formatINR(accInfo.BALANCE || accInfo.balance)}</strong>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label>Date Range</label>
                        <div className={styles.dateGroup}>
                            <input type="date" className={styles.input} value={fromDate} onChange={e => setFromDate(e.target.value)} />
                            <span style={{ color: 'var(--muted)', alignSelf: 'center' }}>to</span>
                            <input type="date" className={styles.input} value={toDate} onChange={e => setToDate(e.target.value)} />
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>Leave blank for all transactions (up to 100)</div>
                    </div>

                    {msg && (
                        <div className={msg.type === 'error' ? styles.msgError : styles.msgSuccess}>
                            {msg.text}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className={styles.btnPrimary} onClick={handleFetch} disabled={loadingTxns || !selectedAcc}>
                            {loadingTxns ? 'QUERYING ORACLE…' : 'LOAD STATEMENT ➔'}
                        </button>
                        {fetched && transactions.length > 0 && (
                            <>
                                <button className={styles.btnSecondary} onClick={handleDownload} disabled={!selectedAcc}>
                                    📄 DOWNLOAD PDF
                                </button>
                                <button className={styles.btnSecondary} onClick={handleEmail} disabled={!selectedAcc}>
                                    ✉️ EMAIL STATEMENT
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className={styles.historyPanel}>
                    {fetched && transactions.length > 0 && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryLabel}>TOTAL CREDITS</div>
                                    <div className={styles.summaryValue} style={{ color: '#10B981' }}>{formatINR(totalCredit)}</div>
                                </div>
                                <div className={styles.summaryCard}>
                                    <div className={styles.summaryLabel}>TOTAL DEBITS</div>
                                    <div className={styles.summaryValue} style={{ color: '#EF4444' }}>{formatINR(totalDebit)}</div>
                                </div>
                            </div>

                            <div className={styles.txnTableWrap}>
                                <table className={styles.txnTable}>
                                    <thead>
                                        <tr>
                                            <th>DATE</th>
                                            <th>DESCRIPTION</th>
                                            <th>TYPE</th>
                                            <th>AMOUNT</th>
                                            <th>BALANCE</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.map((t, i) => {
                                            const type = t.TRANSACTION_TYPE || t.transaction_type || '';
                                            const isCredit = type.toUpperCase().includes('CREDIT') || type.toUpperCase().includes('DEPOSIT');
                                            return (
                                                <tr key={t.TRANSACTION_ID || t.transaction_id || i}>
                                                    <td style={{ fontSize: '12px', color: '#64748B' }}>{formatDate(t.TRANSACTION_DATE || t.transaction_date)}</td>
                                                    <td>{t.DESCRIPTION || t.description || '—'}</td>
                                                    <td style={{ fontSize: '11px', color: '#94A3B8' }}>{type}</td>
                                                    <td className={isCredit ? styles.amtCredit : styles.amtDebit}>
                                                        {isCredit ? '+' : '-'}{formatINR(t.AMOUNT || t.amount)}
                                                    </td>
                                                    <td style={{ fontFamily: 'DM Mono', fontSize: '13px' }}>
                                                        {formatINR(t.BALANCE_AFTER || t.balance_after)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {!fetched && (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>📋</div>
                            <div>Select an account and click Load Statement to view transactions from Oracle.</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
