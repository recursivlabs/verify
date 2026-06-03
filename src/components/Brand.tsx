import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5">
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
        <path
          d="M16 4l10 4.5v6.2c0 6.3-4.1 10.9-10 12.8C10.1 25.6 6 21 6 14.7V8.5L16 4z"
          stroke="#39e0c8"
          strokeWidth="1.6"
          fill="rgba(57,224,200,0.06)"
        />
        <path d="M11.5 16.2l3.2 3.3 6-7" stroke="#39e0c8" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-sm tracking-tight text-ink">
        Recursiv<span className="text-accent"> Verify</span>
      </span>
    </Link>
  );
}

export function TopBar({ email }: { email?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Logo href="/dashboard" />
        {email && (
          <div className="flex items-center gap-4">
            <span className="hidden font-mono text-xs text-faint sm:inline">{email}</span>
            <form action="/api/auth/logout" method="post">
              <button
                formAction="/api/auth/logout"
                className="font-mono text-xs text-muted transition-colors hover:text-ink"
                type="submit"
              >
                sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
