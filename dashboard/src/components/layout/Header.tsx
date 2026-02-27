import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Lightbulb,
  BarChart3,
  Download,
  Settings,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Github,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/sessions', label: 'Sessions', icon: MessageSquare, exact: false },
  { href: '/insights', label: 'Insights', icon: Lightbulb, exact: false },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, exact: false },
  { href: '/export', label: 'Export', icon: Download, exact: false },
  { href: '/settings', label: 'Settings', icon: Settings, exact: false },
];

// Bottom tab bar shows the first 4 primary nav items
const BOTTOM_TABS = NAV_ITEMS.slice(0, 4);

export function Header() {
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navLinkClass = (href: string, exact: boolean) =>
    cn(
      'text-sm font-medium transition-colors',
      isActive(href, exact)
        ? 'text-foreground font-semibold'
        : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <>
      {/* Main header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          {/* Mobile hamburger — visible below lg */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
                  Code Insights
                </SheetTitle>
              </SheetHeader>
              <nav className="px-2 py-2">
                {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
                  <Button
                    key={href}
                    variant="ghost"
                    size="sm"
                    asChild
                    className={cn(
                      'w-full justify-start h-9 px-3 mb-0.5',
                      isActive(href, exact)
                        ? 'text-foreground font-semibold bg-accent'
                        : 'text-muted-foreground'
                    )}
                  >
                    <Link to={href}>
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                    </Link>
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <span className="font-semibold">Code Insights</span>
          </Link>

          {/* Desktop nav links — hidden below lg */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => (
              <Button
                key={href}
                variant="ghost"
                size="sm"
                asChild
                className={cn('h-9 px-3', navLinkClass(href, exact))}
              >
                <Link to={href}>
                  <Icon className="h-4 w-4 mr-1.5" />
                  {label}
                </Link>
              </Button>
            ))}
          </nav>

          {/* Right section */}
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hidden sm:flex"
              asChild
            >
              <a
                href="https://github.com/melagiri/code-insights"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
              >
                <Github className="h-4 w-4" />
                <span className="sr-only">GitHub</span>
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile bottom tab bar — visible below md only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background flex items-stretch h-14">
        {BOTTOM_TABS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              to={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-xs transition-colors',
                active ? 'text-foreground font-semibold' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
        {/* "More" tab — bottom sheet for overflow items */}
        <Sheet>
          <SheetTrigger asChild>
            <button className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground transition-colors">
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto">
            <SheetHeader className="px-4 py-3">
              <SheetTitle className="text-sm font-semibold sr-only">More options</SheetTitle>
            </SheetHeader>
            <nav className="px-4 pb-6 grid grid-cols-2 gap-2">
              {NAV_ITEMS.slice(4).map(({ href, label, icon: Icon }) => (
                <Button key={href} variant="outline" asChild className="justify-start gap-2">
                  <Link to={href}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </Button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
