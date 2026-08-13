import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aegis — Non-custodial AI risk guardian',
  description:
    'Write your risk limits in plain English. Aegis turns them into on-chain policy and guards your tokenised assets — non-custodially. Your keys, your vault, your withdrawal.',
  openGraph: {
    title: 'Aegis — your tokenised assets, guarded by a rule you wrote',
    description:
      'Non-custodial AI risk guardian for xStocks and RWAs on X Layer. Plain-English policy, enforced on-chain.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f2efe6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
