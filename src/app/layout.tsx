import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestor Pessoal",
  description: "Sua secretária pessoal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>{children}</SessionProvider>
        <script dangerouslySetInnerHTML={{ __html: `window.__VAPID_PUBLIC__ = "${process.env.VAPID_PUBLIC_KEY ?? ''}";` }} />
      </body>
    </html>
  );
}
