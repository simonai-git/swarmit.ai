import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@swarmit/db';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
  }
}

const ALLOWED_EMAILS = [
  'bogdan@alexandrescu.io',
  'bogdan@alexandrescu.ai',
  'bogdan@saga.xyz',
  'simon@alexandrescu.io',
  'simon@alexandrescu.ai',
];

async function getOrCreateUser(email: string, name?: string, image?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { email, name, image } });
}

// In production, set cookie domain so the session cookie is sent to api.swarmit.ai
const isProduction = process.env.NODE_ENV === 'production';
const cookieDomain = isProduction ? '.swarmit.ai' : undefined;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.email && ALLOWED_EMAILS.includes(user.email)) {
        return true;
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const profile = await getOrCreateUser(user.email, user.name || undefined, user.image || undefined);
        token.userId = profile.id;
      }
      if (!token.userId && token.email) {
        const profile = await getOrCreateUser(token.email as string);
        token.userId = profile.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  cookies: {
    sessionToken: {
      name: isProduction ? '__Secure-next-auth.session-token' : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProduction,
        domain: cookieDomain,
      },
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
