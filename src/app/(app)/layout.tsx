'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from '@/components/SyncStatus';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'hoje' },
    { href: '/lista', label: 'lista' },
    { href: '/concluidas', label: 'concluídas' },
    { href: '/calendario', label: 'calendário' },
  ];

  return (
    <div className="app">
      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <SyncStatus />
        </span>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
