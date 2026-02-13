import fp from 'fastify-plugin';
import { jwtDecrypt } from 'jose';
import { hkdfSync } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

/**
 * Derive the encryption key the same way next-auth v4 does:
 * HKDF(SHA-256, secret, "", "NextAuth.js Generated Encryption Key", 32)
 */
function getDerivedEncryptionKey(secret: string): Uint8Array {
  return new Uint8Array(
    hkdfSync('sha256', secret, '', 'NextAuth.js Generated Encryption Key', 32)
  );
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const rawSecret = process.env.NEXTAUTH_SECRET || 'dev-secret';
  const encryptionKey = getDerivedEncryptionKey(rawSecret);

  app.decorateRequest('userId', '');

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Try Bearer header first (next-auth encoded JWE)
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { payload } = await jwtDecrypt(token, encryptionKey);
        request.userId = (payload.userId as string) || (payload.sub as string);
        return;
      }

      // Try next-auth session cookie (encrypted JWE)
      const sessionToken =
        request.cookies['next-auth.session-token'] ||
        request.cookies['__Secure-next-auth.session-token'];

      if (sessionToken) {
        const { payload } = await jwtDecrypt(sessionToken, encryptionKey);
        request.userId = (payload.userId as string) || (payload.sub as string);
        return;
      }

      reply.code(401).send({ error: 'Unauthorized' });
    } catch {
      reply.code(401).send({ error: 'Invalid token' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
