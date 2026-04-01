import './globals.css';

import PageTransition from '../components/PageTransition';
import SessionGuard from '../components/SessionGuard';

export const metadata = {
  title: 'Safe Vault - Premium Banking System',
  description: 'The ultimate secure banking experience with Safe Vault.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <SessionGuard />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
