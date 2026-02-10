import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getOrCreateUser } from './db';

// Extend NextAuth types to include user.id
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

// Allowed emails - only these can access the app
const ALLOWED_EMAILS = [
  'bogdan@alexandrescu.io',
  'bogdan@alexandrescu.ai',
  'bogdan@saga.xyz',
  'simon@alexandrescu.io',
  'simon@alexandrescu.ai',
];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow specific emails
      if (user.email && ALLOWED_EMAILS.includes(user.email)) {
        return true;
      }
      return false;
    },
    async jwt({ token, user }) {
      // On first sign-in, resolve stable user_id
      if (user?.email) {
        const profile = await getOrCreateUser(user.email, user.name || undefined, user.image || undefined);
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
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
