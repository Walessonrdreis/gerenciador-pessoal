import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

// A sessão é JWT (session.strategy = 'jwt'), então o middleware só precisa
// decodificar o cookie — sem importar '@/lib/auth' (que arrasta o Prisma/
// PrismaAdapter e, em dev, o driver nativo do SQLite, que quebra o bundle
// do middleware).
export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const isAuthed = !!token;
  const isAuthPage = nextUrl.pathname === '/entrar';

  if (!isAuthed && !isAuthPage) {
    return Response.redirect(new URL('/entrar', nextUrl));
  }
  if (isAuthed && isAuthPage) {
    return Response.redirect(new URL('/', nextUrl));
  }
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)'],
};
