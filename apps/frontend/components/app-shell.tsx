'use client';

import { BarChart3, Boxes, LayoutDashboard, LogOut, Settings, ShoppingCart, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { ROLE_LABELS, useCurrentUser, useLogout } from '@/lib/auth';
import { usePendingCount } from '@/lib/users';
import { cn } from '@/lib/utils';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', icon: Boxes },
  { href: '/planning', label: 'Purchase Planning', icon: ShoppingCart },
  { href: '/analysis', label: 'Analysis', icon: BarChart3 },
];

const SETTINGS = { href: '/settings', label: 'Settings', icon: Settings };

function NavLink({ href, label, icon: Icon, badge }: (typeof NAV)[number] & { badge?: number }) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        active && 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
      {badge ? (
        <span
          className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold text-white"
          aria-label={`${badge} pending Access Requests`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

/** Layout for every logged-in page. Sends Users without a valid session to the Login page. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isPending, isError } = useCurrentUser();
  const logout = useLogout();
  const pendingCount = usePendingCount();

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, pathname, router]);

  if (isError) {
    return <p className="p-6 text-destructive">Hosstock can't reach the server. Check that the backend is running.</p>;
  }
  if (isPending || !user) {
    return <p className="p-6 text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-52 shrink-0 flex-col border-r bg-background px-3 py-4">
        <Link href="/" className="mb-6 px-2.5">
          <Wordmark />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <div className="mt-auto">
            <NavLink {...SETTINGS} badge={pendingCount} />
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-end gap-3 border-b px-5">
          <div className="text-right leading-tight">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
            <LogOut className="size-4" aria-hidden />
            Log out
          </Button>
        </header>
        <main className="flex-1 bg-muted/50 p-5">{children}</main>
      </div>
    </div>
  );
}
