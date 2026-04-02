import './globals.css';
import { ToastProvider } from '../context/ToastContext';
import PageTransition from '../components/PageTransition';
import SessionGuard from '../components/SessionGuard';

export const metadata = {
  title: 'Safe Vault - Premium Banking System',
  description: 'The ultimate secure banking experience with Safe Vault.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ToastProvider>
          <SessionGuard />
          <PageTransition>{children}</PageTransition>
        </ToastProvider>
      </body>
    </html>
  );
}
