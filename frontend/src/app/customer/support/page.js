'use client';
import Link from 'next/link';
import styles from './support.module.css';

const branchInfo = {
    name: 'Safe Vault — Mumbai Central Branch',
    code: 'BRN-MUM-003',
    ifsc: 'SRKB0000003',
    address: '4th Floor, Nariman Point Financial Complex, Nariman Point, Mumbai – 400 021',
    phone: '+91 (022) 6600-3000',
    toll: '1800-103-3000 (Toll-Free)',
    email: 'branch.mum003@safevault.io',
    hours: [
        { day: 'Monday – Friday', time: '9:30 AM – 3:30 PM (Counter), 9:00 AM – 6:00 PM (Admin)' },
        { day: 'Saturday', time: '9:30 AM – 1:30 PM (Counter)' },
        { day: 'Sunday / Bank Holidays', time: 'Closed' },
    ],
    manager: 'Suresh Nair, Branch Manager',
    manager_email: 'suresh.nair@safevault.io'
};

export default function ContactBranch() {
    return (
        <div className={styles.pageWrap}>
            <h1 className={styles.pageTitle}>Contact Branch</h1>
            <p className={styles.subtitle}>Reach us for account queries, loan enquiries, or in-person support.</p>

            <div className={styles.grid}>
                {/* Branch Info Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>🏦 Branch Details</div>
                    <div className={styles.infoList}>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Branch Name</span>
                            <span className={styles.value}>{branchInfo.name}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Branch Code</span>
                            <span className={styles.valueMono}>{branchInfo.code}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>IFSC Code</span>
                            <span className={styles.valueMono}>{branchInfo.ifsc}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Address</span>
                            <span className={styles.value} style={{ textAlign: 'right', maxWidth: '60%' }}>{branchInfo.address}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Phone</span>
                            <span className={styles.value}>{branchInfo.phone}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Toll-Free</span>
                            <span className={styles.value}>{branchInfo.toll}</span>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Email</span>
                            <a href={`mailto:${branchInfo.email}`} className={styles.link}>{branchInfo.email}</a>
                        </div>
                        <div className={styles.infoRow}>
                            <span className={styles.label}>Branch Manager</span>
                            <div style={{ textAlign: 'right' }}>
                                <div className={styles.value}>{branchInfo.manager}</div>
                                <a href={`mailto:${branchInfo.manager_email}`} className={styles.link} style={{ fontSize: '11px' }}>{branchInfo.manager_email}</a>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Branch Hours */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>🕐 Branch Hours</div>
                        <div className={styles.infoList}>
                            {branchInfo.hours.map(h => (
                                <div key={h.day} className={styles.infoRow}>
                                    <span className={styles.label}>{h.day}</span>
                                    <span className={styles.value}>{h.time}</span>
                                </div>
                            ))}
                        </div>
                        <div className={styles.notice}>
                            💡 For urgent account blocks or fraud alerts, call our 24/7 toll-free line.
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>⚡ Quick Actions</div>
                        <div className={styles.quickLinks}>
                            <Link href="/customer/profile" className={styles.quickLink}>
                                <span>🔑</span>
                                <div>
                                    <div className={styles.quickLinkTitle}>Change Password</div>
                                    <div className={styles.quickLinkSub}>Update your login credentials</div>
                                </div>
                            </Link>
                            <Link href="/customer/statements" className={styles.quickLink}>
                                <span>📄</span>
                                <div>
                                    <div className={styles.quickLinkTitle}>Download Statement</div>
                                    <div className={styles.quickLinkSub}>View transaction history</div>
                                </div>
                            </Link>
                            <Link href="/customer/internal" className={styles.quickLink}>
                                <span>🔄</span>
                                <div>
                                    <div className={styles.quickLinkTitle}>Fund Transfer</div>
                                    <div className={styles.quickLinkSub}>Internal or external transfer</div>
                                </div>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
