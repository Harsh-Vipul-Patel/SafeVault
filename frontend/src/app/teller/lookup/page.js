'use client';
import { useState } from 'react';
import styles from '../forms.module.css';

const API = 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function CustomerLookup() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [searched, setSearched] = useState(false);
    const [msg, setMsg] = useState(null);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) return;
        setLoading(true); setResults([]); setMsg(null); setSearched(false);
        try {
            const res = await fetch(`${API}/api/teller/lookup?query=${encodeURIComponent(query.trim())}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setResults(data.results || []);
            setSearched(true);
            if (!data.results?.length) setMsg({ type: 'info', text: 'No customers matched your query.' });
        } catch {
            setMsg({ type: 'error', text: 'Network error. Is the backend running?' });
        }
        setLoading(false);
    };

    // Group results by customer
    const grouped = results.reduce((acc, row) => {
        const id = row.CUSTOMER_ID || row.customer_id;
        if (!acc[id]) acc[id] = { info: row, accounts: [] };
        acc[id].accounts.push(row);
        return acc;
    }, {});

    return (
        <div className={styles.pageWrap}>
            <header className={styles.header}>
                <div className={styles.headerTitle}>Customer Lookup</div>
                <div className={styles.headerSubtitle}>Search by Name, Account ID, or Phone</div>
            </header>

            <form className={styles.formPanel} onSubmit={handleSearch} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: '12px' }}>
                <div className={styles.formGroup} style={{ flex: 1 }}>
                    <label>Search Query</label>
                    <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g. 'Amit Kumar' or 'ACC-MUM-003-8821'"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className={styles.btnSecondary} style={{ padding: '14px 28px', height: '48px' }} disabled={loading}>
                    {loading ? 'SEARCHING…' : '🔍 SEARCH'}
                </button>
            </form>

            {msg && <div className={`${styles.message} ${msg.type === 'error' ? styles.msgError : styles.msgSuccess}`}>{msg.text}</div>}

            {searched && Object.keys(grouped).length > 0 && (
                <div className={styles.formPanel} style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--cream)', fontWeight: 600 }}>
                            {Object.keys(grouped).length} customer(s) found · {results.length} accounts
                        </span>
                    </div>

                    {Object.values(grouped).map(({ info, accounts }) => {
                        const name = info.FULL_NAME || info.full_name;
                        const phone = info.PHONE || info.phone;
                        const pan = info.PAN_NUMBER || info.pan_number;
                        const kyc = info.KYC_STATUS || info.kyc_status;
                        const custId = info.CUSTOMER_ID || info.customer_id;
                        return (
                            <div key={custId} style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                        <div className={styles.fdAvatar}>{(name || 'C')[0]}</div>
                                        <div>
                                            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--cream)' }}>{name}</div>
                                            <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                                                {phone} · PAN: {pan} · KYC: <span style={{ color: kyc === 'VERIFIED' ? '#10B981' : '#EAB308' }}>{kyc}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'right' }}>
                                        CID: {custId}
                                    </div>
                                </div>

                                {/* Accounts sub-table */}
                                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {accounts.map(acc => {
                                        const accId = acc.ACCOUNT_ID || acc.account_id;
                                        const accSts = acc.STATUS || acc.status;
                                        const accBal = acc.BALANCE || acc.balance;
                                        return (
                                            <div key={accId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <span style={{ fontFamily: 'DM Mono', fontSize: '13px', color: 'var(--cream)' }}>{accId}</span>
                                                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                                                    {acc.TYPE_NAME || acc.type_name || 'Account'}
                                                </span>
                                                <span style={{ fontFamily: 'DM Mono', fontSize: '14px', fontWeight: 700, color: 'var(--gold2)' }}>
                                                    ₹{Number(accBal).toLocaleString('en-IN')}
                                                </span>
                                                <span style={{ fontSize: '11px', background: accSts === 'ACTIVE' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: accSts === 'ACTIVE' ? '#10B981' : '#EF4444', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>
                                                    {accSts}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
