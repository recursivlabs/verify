import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { Login } from '@/components/Login';
import { Logo } from '@/components/Brand';

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="bg-grid-faint pointer-events-none absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5">
        <div className="flex h-14 items-center">
          <Logo href="/" />
        </div>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-2">
          {/* left: the pitch */}
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 font-mono text-xs text-muted">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
              AIUC-1 · the standard for AI agents
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] text-ink sm:text-5xl">
              Prove your AI agents meet the <span className="text-accent">AIUC-1</span> standard.
            </h1>
            <p className="mt-5 text-pretty text-base leading-relaxed text-muted">
              The fastest way to get audit-ready, and stay that way. Recursiv checks your agents against
              AIUC-1 every day and gives you the evidence your auditor needs. The runtime checks a
              compliance tool can’t run on its own.
            </p>
            <ul className="mt-7 space-y-2.5 text-sm text-muted">
              {[
                'Checks every agent against the AIUC-1 standard',
                'Tests daily that it does its job correctly and safely',
                'Confirms it only takes actions it’s allowed to',
                'A shareable report your auditor can use',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <svg className="mt-0.5 h-4 w-4 flex-none text-accent" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10.5l3 3 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* right: sign in */}
          <div className="flex justify-center lg:justify-end">
            <Login />
          </div>
        </div>
      </div>
    </main>
  );
}
