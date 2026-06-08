import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Recursiv Verify — AIUC-1 compliance for AI agents',
  description:
    'Continuously check your AI agents against the AIUC-1 standard and produce the evidence your auditor needs — the runtime checks a GRC tool can’t run.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <main className="flex-1">{children}</main>
        {/* Unified Recursiv footer — identical across research / sparklab / verify. */}
        <footer className="border-t border-[#e5e7eb]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12px]">
            <span className="font-mono text-[#586273]">
              Powered by{' '}
              <a href="https://recursiv.io" className="font-medium text-[#0e1726] hover:underline">
                Recursiv
              </a>
              <span className="text-[#8a95a4]"> · the trust layer for agentic systems</span>
            </span>
            <div className="flex items-center gap-1 font-mono text-[#8a95a4]">
              <a href="https://research.on.recursiv.io" className="transition-colors hover:text-[#0e1726]">
                Research
              </a>
              <span className="px-1.5">·</span>
              <a href="https://sparklab.on.recursiv.io" className="transition-colors hover:text-[#0e1726]">
                Lab
              </a>
              <span className="px-1.5">·</span>
              <span className="text-[#0e1726]">Verify</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
