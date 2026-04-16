'use client';
import { useState, useEffect } from 'react';
import styles from '../dashboard/page.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function SystemConfig() {
    const [config, setConfig] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [editingKey, setEditingKey] = useState(null);
    const [editValue, setEditValue] = useState('');

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${API}/api/admin/config`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            const data = await res.json();
            setConfig(data.config || []);
            setLoading(false);
        } catch {
            setMsg('Failed to fetch config from Oracle.');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleSave = async (key) => {
        if (!editValue) return;
        try {
            const res = await fetch(`${API}/api/admin/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${getToken()}`
                },
                body: JSON.stringify({ key, value: editValue })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg(`✓ ${data.message}`);
                setEditingKey(null);
                fetchConfig();
            } else {
                setMsg(data.message || 'Operation failed.');
            }
        } catch {
            setMsg('Network error while saving to DB.');
        }
        setTimeout(() => setMsg(null), 3000);
    };

    if (loading) return <div className={styles.loading}>Loading Configurations from Oracle…</div>;

    return (
        <div className={styles.dashboard}>
            <header className={styles.header}>
                <div className={styles.greeting}>System Configuration</div>
                <div className={styles.headerActions}>
                    <button className={styles.btnGhost} onClick={fetchConfig}>↻ REFRESH</button>
                    <button className={styles.btnDanger}>+ NEW PARAMETER</button>
                </div>
            </header>

            {msg && <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10B981', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: 600 }}>{msg}</div>}

            <div className={styles.dataGrid} style={{ gridTemplateColumns: '1fr' }}>
                <div className={styles.panel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>Environment Variables (<code>SYSTEM_CONFIG</code> Table)</h2>
                    </div>
                    <div className={styles.table}>
                        <div className={styles.th} style={{ gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr' }}>
                            <div>PARAMETER KEY</div><div>DESCRIPTION</div><div>CURRENT VALUE</div><div>LAST UPDATED</div><div>ACTION</div>
                        </div>
                        {config.map(c => {
                            const isEditing = editingKey === c.config_key;
                            return (
                                <div className={styles.td} style={{ gridTemplateColumns: '1.5fr 2fr 1fr 1fr 1fr' }} key={c.config_key}>
                                    <div><code style={{ fontSize: '12px', color: '#60A5FA', background: 'rgba(96,165,250,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{c.config_key}</code></div>
                                    <div style={{ color: '#94A3B8', fontSize: '12px' }}>{c.description}</div>
                                    <div>
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                style={{ width: '100%', background: '#0D1321', border: '1px solid rgba(212,168,67,0.5)', color: '#F8FAFC', padding: '6px 10px', borderRadius: '4px', outline: 'none', fontFamily: 'DM Mono' }}
                                            />
                                        ) : (
                                            <span style={{ fontWeight: 700, fontFamily: 'DM Mono', color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '4px 8px', borderRadius: '4px' }}>{c.config_value}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                        {c.updated_at ? new Date(c.updated_at).toLocaleString('en-IN') : '—'}
                                    </div>
                                    <div>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button onClick={() => handleSave(c.config_key)} style={{ background: '#10B981', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>SAVE</button>
                                                <button onClick={() => setEditingKey(null)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#94A3B8', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>CANCEL</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => { setEditingKey(c.config_key); setEditValue(c.config_value); }}
                                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#D4A843', padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                                                EDIT
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
