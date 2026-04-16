'use client';
import { useState, useEffect } from 'react';
import styles from '../views.module.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function StaffManagement() {
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('suraksha_token');
            const res = await fetch(`${API}/api/manager/staff`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch staff data');
            const data = await res.json();
            setStaff(data.staff || []);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className={styles.pageWrap} style={{ maxWidth: '1000px' }}>
            <header className={styles.header}>
                <div>
                    <div className={styles.headerTitle}>Staff Management</div>
                    <div className={styles.headerSubtitle}>Manage teller schedules, permissions, and terminal assignments — from Oracle EMPLOYEES</div>
                </div>
            </header>

            {error && <div style={{ color: '#FF4A4A', fontSize: '13px', padding: '12px 16px', background: 'rgba(255,74,74,0.1)', borderRadius: '8px' }}>{error}</div>}

            <div className={styles.panel}>
                <div className={styles.tableWrap}>
                    <div className={styles.thRow} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr' }}>
                        <div>EMPLOYEE ID</div>
                        <div>NAME</div>
                        <div>ROLE</div>
                        <div>HIRE DATE</div>
                        <div>BRANCH</div>
                        <div style={{ textAlign: 'right' }}>STATUS</div>
                    </div>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>Loading staff from Oracle...</div>
                    ) : staff.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No staff found for this branch.</div>
                    ) : staff.map((emp) => (
                        <div className={styles.tdRow} key={emp.EMPLOYEE_ID} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr' }}>
                            <div className={styles.idMono}>{emp.EMPLOYEE_ID}</div>
                            <div style={{ color: emp.IS_ACTIVE === '0' ? 'var(--muted)' : 'var(--cream)' }}>{emp.FULL_NAME}{emp.IS_ACTIVE === '0' ? ' (Inactive)' : ''}</div>
                            <div className={styles.idMono}>{emp.ROLE}</div>
                            <div style={{ fontSize: '12px' }}>{formatDate(emp.HIRE_DATE)}</div>
                            <div style={{ fontSize: '12px' }}>{emp.BRANCH_NAME || '--'}</div>
                            <div style={{ textAlign: 'right' }}>
                                {emp.IS_ACTIVE === '1' ? (
                                    <span style={{ fontSize: '12px', color: '#3DD68C', fontWeight: 600 }}>ACTIVE</span>
                                ) : (
                                    <span style={{ fontSize: '12px', color: '#FF4A4A', fontWeight: 600 }}>INACTIVE</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
