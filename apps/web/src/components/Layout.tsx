// apps/web/src/components/Layout.tsx
// Shell da aplicação: Navbar (topo) + Banner GC offline + Sidebar + área de conteúdo.
// O polling de health roda uma vez aqui e alimenta navbar e banner.

import { Outlet } from 'react-router-dom';
import { useGcHealth } from '../hooks/useGcHealth';
import { NavGuardProvider } from '../hooks/useNavGuard';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { GcOfflineBanner } from './GcOfflineBanner';

export function Layout() {
  const { status } = useGcHealth();

  return (
    <NavGuardProvider>
      <div className="h-full flex flex-col">
        <Navbar gcStatus={status} />
        {status === 'offline' && <GcOfflineBanner />}
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-surface-app p-4">
            <div className="max-w-content mx-auto w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </NavGuardProvider>
  );
}
