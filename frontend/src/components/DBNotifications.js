'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, ShieldAlert, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './notifications.module.css';
import { useToast } from '../context/ToastContext';

export default function DBNotifications({ bellClassName }) {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState([]);
    const [hasNew, setHasNew] = useState(false);
    const dropdownRef = useRef(null);
    const { showToast } = useToast();

    // Fetch logs from backend securely
    const fetchLogs = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/admin/system-logs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                
                setLogs(prev => {
                    if (data.length > 0 && prev.length > 0 && data[0].id !== prev[0].id) {
                        if (!isOpen) {
                            setHasNew(true);
                            // Filter out new logs that weren't in prev
                            const newLogs = data.filter(d => !prev.some(p => p.id === d.id));
                            newLogs.forEach(log => {
                                showToast(`System Activity: ${log.action} - ${log.description}`, 'INFO', 5000);
                            });
                        }
                    } else if (prev.length === 0 && data.length > 0) {
                        if (!isOpen) setHasNew(true);
                    }
                    return data;
                });
            }
        } catch (err) {
            console.error("Failed to fetch DB logs:", err);
        }
    }, [isOpen, showToast]);

    useEffect(() => {
        // Initial fetch
        fetchLogs();
        
        // Poll every 5 seconds
        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, [fetchLogs]);

    // Handle outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const toggleOpen = () => {
        if (!isOpen) {
            setHasNew(false);
            fetchLogs(); // fast refresh on open
        }
        setIsOpen(!isOpen);
    };

    const formatTime = (isoString) => {
        const d = new Date(isoString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className={styles.notificationContainer} ref={dropdownRef}>
            <div className={bellClassName} onClick={toggleOpen} role="button" tabIndex={0} style={{ cursor: 'pointer', position: 'relative' }}>
                <ShieldAlert size={18} />
                {hasNew && <span className={styles.notifBadge}></span>}
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        className={styles.dropdownPanel}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        style={{ minWidth: 350 }}
                    >
                        <div className={styles.panelHeader}>
                            <h3 className={styles.panelTitle}>
                                <ShieldAlert size={16} /> Admin Auditing Live
                            </h3>
                            <div className={styles.liveIndicator}>
                                <span className={styles.pulseDot}></span> Live
                            </div>
                        </div>

                        <div className={styles.logsList}>
                            {logs.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Activity size={24} className={styles.emptyIcon} />
                                    <p>No recent database activity</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div key={log.id} className={styles.logItem}>
                                        <div className={styles.logHeader}>
                                            <span className={styles.logAction}>{log.action}</span>
                                            <span className={styles.logTime}>{formatTime(log.timestamp)}</span>
                                        </div>
                                        <div className={styles.logSql} title={log.description}>
                                            <strong>{log.user}</strong>: {log.description}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
