import './globals.css';

export const metadata = {
  title: 'Suraksha Bank - Safe Vault System',
  description: 'Core Banking System Interface',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
