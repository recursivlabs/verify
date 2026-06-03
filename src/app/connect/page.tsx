import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/session';
import { TopBar } from '@/components/Brand';
import { ConnectAgent } from '@/components/ConnectAgent';

export const dynamic = 'force-dynamic';

export default async function ConnectPage() {
  const user = await getSessionUser();
  if (!user) redirect('/');
  return (
    <div className="min-h-screen">
      <TopBar email={user.email} />
      <main className="px-5 py-12">
        <ConnectAgent />
      </main>
    </div>
  );
}
