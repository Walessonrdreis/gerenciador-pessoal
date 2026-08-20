import { auth } from '@/lib/auth';

// O middleware importa auth -> prisma (driver `pg`), que exige o runtime
// Node.js do Next.js (Next 15.5+ suporta `runtime: 'nodejs'` em middleware).
export const runtime = 'nodejs';

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isAuthPage = nextUrl.pathname === '/entrar';

  if (!isAuthed && !isAuthPage) {
    return Response.redirect(new URL('/entrar', nextUrl));
  }
  if (isAuthed && isAuthPage) {
    return Response.redirect(new URL('/', nextUrl));
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)'],
};
