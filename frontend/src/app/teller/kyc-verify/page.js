'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from '../../teller/teller.module.css';
import { Search, ShieldCheck, User, Calendar, FileText, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';

import { motion, AnimatePresence } from 'framer-motion';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('suraksha_token') : '';

export default function TellerKYCVerify() {
    const [customerId, setCustomerId] = useState('');
    const [docType, setDocType] = useState('AADHAAR');
    const [docNumber, setDocNumber] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [customerInfo, setCustomerInfo] = useState(null);

    const handleLookup = async () => {
        if (!customerId) return;
        setLookupLoading(true);
        setMessage(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/lookup?query=${customerId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setCustomerInfo(data.results[0]);
            } else {
                setMessage({ type: 'error', text: 'Customer not found.' });
                setCustomerInfo(null);
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Lookup failed.' });
        } finally {
            setLookupLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!customerInfo) return;
        setLoading(true);
        setMessage(null);
        try {
            const token = getToken();
            const res = await fetch(`${API}/api/teller/kyc/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    customerId: customerInfo.CUSTOMER_ID,
                    docType,
                    docNumber,
                    expiryDate
                })
            });
            const data = await res.json();
            if (res.ok) {
                setMessage({ type: 'success', text: data.message });
                // Refresh customer info to show updated status
                handleLookup();
                // Reset form
                setDocNumber('');
                setExpiryDate('');
            } else {
                setMessage({ type: 'error', text: data.message });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Verification failed.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.dashboardContainer} style={{ background: 'transparent', padding: '0', minHeight: 'auto' }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                style={{ maxWidth: '1100px', margin: '0 auto' }}
            >
                <header style={{ marginBottom: '48px', textAlign: 'left' }}>
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}
                    >
                        <motion.div
                            whileHover={{ rotate: 15, scale: 1.1 }}
                            style={{
                                background: 'var(--grad-gold)',
                                padding: '10px',
                                borderRadius: '12px',
                                boxShadow: '0 0 20px rgba(201, 150, 42, 0.3)'
                            }}
                        >
                            <ShieldCheck size={32} color="#0D1B2A" />
                        </motion.div>
                        <h1 style={{
                            fontFamily: "'Playfair Display', serif",
                            fontSize: '42px',
                            fontWeight: '900',
                            margin: 0,
                            letterSpacing: '-0.02em'
                        }} className="text-gradient-gold">
                            KYC Verification Terminal
                        </h1>
                    </motion.div>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.7 }}
                        transition={{ delay: 0.4 }}
                        style={{
                            fontSize: '18px',
                            color: 'var(--cream)',
                            maxWidth: '600px',
                            lineHeight: '1.6',
                            fontWeight: '500'
                        }}
                    >
                        High-security identity protocol for entity verification and document lifecycle management.
                    </motion.p>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '40px', alignItems: 'start' }}>
                    {/* STEP 1: ENTITY LOOKUP */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className="pearl-card"
                        style={{ padding: '32px', height: '100%' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '8px',
                                borderRadius: '10px',
                                border: '1px solid var(--glass-border)'
                            }}>
                                <Search size={20} style={{ color: 'var(--gold2)' }} />
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--white)' }}>Entity Lookup</h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <label style={{
                                fontSize: '11px',
                                fontWeight: '800',
                                color: 'var(--gold2)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.1em'
                            }}>
                                Customer Identification
                            </label>
                            <div style={{ position: 'relative', display: 'flex', gap: '12px' }}>
                                <input
                                    type="text"
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: '12px',
                                        padding: '14px 16px',
                                        color: 'var(--white)',
                                        fontSize: '14px',
                                        transition: 'all-ease 0.3s'
                                    }}
                                    className="focus:ring-2 focus:ring-amber-500/50 outline-none"
                                    value={customerId}
                                    onChange={(e) => setCustomerId(e.target.value)}
                                    placeholder="e.g. CUST-001 or Name"
                                    onKeyPress={(e) => e.key === 'Enter' && handleLookup()}
                                />
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleLookup}
                                    disabled={lookupLoading}
                                    style={{
                                        background: 'var(--grad-gold)',
                                        border: 'none',
                                        borderRadius: '12px',
                                        padding: '0 24px',
                                        color: 'var(--navy)',
                                        fontWeight: '800',
                                        fontSize: '14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s',
                                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {lookupLoading ? <Loader2 size={18} className="animate-spin" /> : 'Lookup'}
                                </motion.button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {customerInfo && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{
                                        marginTop: '40px',
                                        padding: '24px',
                                        borderRadius: '16px',
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        border: '1px solid var(--glass-border)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        right: 0,
                                        width: '100px',
                                        height: '100px',
                                        background: 'var(--grad-gold)',
                                        opacity: 0.05,
                                        borderRadius: '50%',
                                        transform: 'translate(40%, -40%)'
                                    }}></div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative' }}>
                                        <motion.div
                                            initial={{ scale: 0.8 }}
                                            animate={{ scale: 1 }}
                                            style={{
                                                width: '64px',
                                                height: '64px',
                                                borderRadius: '16px',
                                                background: 'var(--grad-gold)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
                                            }}
                                        >
                                            <User size={32} color="var(--navy)" />
                                        </motion.div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--white)' }}>{customerInfo.FULL_NAME}</h3>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--muted)', fontWeight: '600' }}>{customerInfo.CUSTOMER_ID}</p>
                                        </div>
                                    </div>

                                    <div style={{
                                        marginTop: '24px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: '20px',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                                    }}>
                                        <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)', textTransform: 'uppercase' }}>Current Status</span>
                                        <div style={{
                                            padding: '6px 16px',
                                            borderRadius: '30px',
                                            fontSize: '12px',
                                            fontWeight: '800',
                                            background: customerInfo.KYC_STATUS === 'VERIFIED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: customerInfo.KYC_STATUS === 'VERIFIED' ? '#34D399' : '#F87171',
                                            border: `1px solid ${customerInfo.KYC_STATUS === 'VERIFIED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            {customerInfo.KYC_STATUS === 'VERIFIED' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                            {customerInfo.KYC_STATUS}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {/* STEP 2: VERIFICATION FORM */}
                    <motion.section
                        initial={{ opacity: 0, x: 20 }}
                        animate={{
                            opacity: customerInfo ? 1 : 0.4,
                            x: 0,
                            filter: customerInfo ? 'none' : 'grayscale(0.5)'
                        }}
                        transition={{ delay: 0.5 }}
                        className="pearl-card"
                        style={{
                            padding: '40px',
                            pointerEvents: customerInfo ? 'all' : 'none',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.05)',
                                padding: '10px',
                                borderRadius: '12px',
                                border: '1px solid var(--glass-border)'
                            }}>
                                <FileText size={22} style={{ color: 'var(--gold2)' }} />
                            </div>
                            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: 'var(--white)' }}>Identity Confirmation</h2>
                        </div>

                        <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Type</label>
                                    <select
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '12px',
                                            padding: '14px 40px 14px 16px',
                                            color: 'var(--white)',
                                            fontSize: '14px',
                                            outline: 'none',
                                            appearance: 'none',
                                            cursor: 'pointer',
                                            width: '100%',
                                            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23C9962A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'right 14px center',
                                            backgroundSize: '16px'
                                        }}
                                        className="focus:ring-2 focus:ring-amber-500/30 transition-all"
                                        value={docType}
                                        onChange={(e) => setDocType(e.target.value)}
                                        required
                                    >
                                        <option value="AADHAAR" style={{ background: '#0D1B2A', color: 'white' }}>Aadhaar Card (12 digits)</option>
                                        <option value="PAN" style={{ background: '#0D1B2A', color: 'white' }}>PAN Card (10 digits)</option>
                                        <option value="PASSPORT" style={{ background: '#0D1B2A', color: 'white' }}>Passport (8 digits)</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expiry Date</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="date"
                                            style={{
                                                width: '100%',
                                                background: 'rgba(255, 255, 255, 0.06)',
                                                border: '1px solid var(--glass-border)',
                                                borderRadius: '12px',
                                                padding: '14px',
                                                color: 'var(--white)',
                                                fontSize: '14px',
                                                outline: 'none'
                                            }}
                                            value={expiryDate}
                                            onChange={(e) => setExpiryDate(e.target.value)}
                                            required
                                        />
                                        <Calendar size={18} style={{ color: 'var(--muted)', position: 'absolute', right: '14px', top: '14px', pointerEvents: 'none' }} />
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Identification Number</label>
                                <input
                                    type="text"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                        color: 'var(--white)',
                                        fontSize: '15px',
                                        outline: 'none'
                                    }}
                                    value={docNumber}
                                    onChange={(e) => setDocNumber(e.target.value)}
                                    placeholder="Enter secure ID number"
                                    required
                                />
                            </div>

                            <div style={{ marginTop: '16px' }}>
                                <motion.button
                                    type="submit"
                                    whileHover={customerInfo ? { scale: 1.02, y: -2 } : {}}
                                    whileTap={customerInfo ? { scale: 0.98 } : {}}
                                    disabled={loading || !customerInfo}
                                    style={{
                                        width: '100%',
                                        height: '60px',
                                        background: 'var(--grad-gold)',
                                        border: 'none',
                                        borderRadius: '14px',
                                        color: 'var(--navy)',
                                        fontSize: '16px',
                                        fontWeight: '900',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '12px',
                                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.02em',
                                        opacity: customerInfo ? 1 : 0.5
                                    }}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={24} className="animate-spin" />
                                            Encrypting & Finalizing...
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck size={24} />
                                            Verify & Update Identity Status
                                        </>
                                    )}
                                </motion.button>
                                <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', marginTop: '16px', fontWeight: '500' }}>
                                    This action will be logged and audited for compliance purposes.
                                </p>
                            </div>
                        </form>
                    </motion.section>
                </div>

                <AnimatePresence>
                    {message && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            style={{
                                marginTop: '40px',
                                padding: '20px 24px',
                                borderRadius: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                background: message.type === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                                border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                                color: message.type === 'success' ? '#34D399' : '#F87171',
                                fontSize: '15px',
                                fontWeight: '600',
                                backdropFilter: 'blur(10px)'
                            }}
                        >
                            {message.type === 'success' ? <CheckCircle size={24} /> : <XCircle size={24} />}
                            {message.text}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    );
}
