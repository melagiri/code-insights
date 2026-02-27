import { Outlet } from 'react-router';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { Header } from './Header';

export function Layout() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <Header />
        {/* pt-14 accounts for the fixed header height; pb-14 accounts for mobile bottom nav */}
        <main className="pt-14 pb-14 md:pb-0">
          <Outlet />
        </main>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
