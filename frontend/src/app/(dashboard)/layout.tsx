import { Sidebar } from '@/components/layout/Sidebar';
import { auth0 } from '@/lib/auth0';
import { serverGet, serverPost, serverPatch } from '@/lib/serverFetch';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth0.getSession();
  if (session) {
    const { user } = session;
    const profile = {
      name:           user.name,
      given_name:     user.given_name,
      family_name:    user.family_name,
      email:          user.email,
      email_verified: user.email_verified,
      picture:        user.picture,
    };
    try {
      const existing = await serverGet('users', `/users/${user.sub}`);
      if (existing) {
        await serverPatch('users', `/users/${user.sub}`, profile);
      } else {
        await serverPost('users', '/users', profile);
      }
    } catch {
      // sync failure is non-fatal
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
