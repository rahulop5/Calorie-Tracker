import {
  BarChart3,
  FileUp,
  Flame,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Target,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { Button } from '../ui/Button';
import { ThemeToggle } from './ThemeToggle';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/entries', label: 'Meals', icon: UtensilsCrossed },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/assistant', label: 'Assistant', icon: Sparkles },
  { to: '/import', label: 'Import', icon: FileUp },
] as const;

export function AppShell() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
  }

  const initials = user?.name.slice(0, 1).toUpperCase() ?? '?';

  return (
    <div className="min-h-dvh bg-plane">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <Flame className="size-4" aria-hidden="true" />
          </span>
          <span className="hidden text-sm font-semibold text-ink sm:block">Calorie Tracker</span>

          <nav aria-label="Main" className="ml-auto sm:ml-6">
            <ul className="flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    // The label is hidden below md, so the name has to come
                    // from aria for screen readers and narrow screens.
                    aria-label={item.label}
                    title={item.label}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.8125rem] font-medium',
                        'transition-colors duration-150',
                        isActive
                          ? 'bg-wash-strong text-ink'
                          : 'text-ink-secondary hover:bg-wash hover:text-ink',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="hidden md:inline">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <span
              title={user?.email}
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full bg-wash-strong text-[0.75rem] font-semibold text-ink-secondary"
            >
              {initials}
            </span>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              loading={signingOut}
              aria-label="Sign out"
              title="Sign out"
              icon={<LogOut className="size-4" />}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
