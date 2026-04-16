'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import DynamicToaster from '../components/DynamicToaster';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // type can be 'SUCCESS', 'ERROR', 'WARNING', 'INFO'
  const showToast = useCallback((message, type = 'INFO', duration = 4000) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(2);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <DynamicToaster toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
