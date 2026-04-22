import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--font-display' });
const body = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body' });

export const metadata: Metadata = {
  metadataBase: new URL('https://lumio.app'),
  title: { default: 'Lumio', template: '%s, Lumio' },
  description: 'Smart reading companion for busy minds.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
