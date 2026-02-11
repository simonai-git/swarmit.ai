import fp from 'fastify-plugin';
import { jwtVerify } from 'jose';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'dev-secret');

  app.decorateRequest('userId', '');

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Try Bearer header first
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const { payload } = await jwtVerify(token, secret);
        request.userId = payload.sub as string;
        return;
      }

      // Try next-auth session cookie
      const sessionToken =
        request.cookies['next-auth.session-token'] ||
        request.cookies['__Secure-next-auth.session-token'];

      if (sessionToken) {
        const { payload } = await jwtVerify(sessionToken, secret);
        request.userId = payload.sub as string;
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
