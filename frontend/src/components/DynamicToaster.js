'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import styles from './toaster.module.css';

export default function DynamicToaster({ toasts, removeToast }) {
  const getIcon = (type) => {
    switch (type) {
      case 'SUCCESS': return <CheckCircle2 size={18} />;
      case 'ERROR': return <AlertCircle size={18} />;
      case 'WARNING': return <AlertTriangle size={18} />;
      default: return <Info size={18} />;
    }
  };

  return (
    <div className={styles.islandContainer}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -50, scale: 0.8, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.8, filter: 'blur(10px)', transition: { duration: 0.2 } }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 25,
              mass: 1
            }}
            className={`${styles.island} ${styles[toast.type] || styles.INFO}`}
          >
            <div className={styles.iconWrapper}>
              <div className={styles.iconBg}>
                {getIcon(toast.type)}
              </div>
            </div>
            
            <div className={styles.messageContainer}>
              <span className={styles.toastType}>{toast.type === 'INFO' ? 'NOTIFICATION' : toast.type}</span>
              <p className={styles.message}>{toast.message}</p>
            </div>

            <button onClick={() => removeToast(toast.id)} className={styles.closeButton}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
