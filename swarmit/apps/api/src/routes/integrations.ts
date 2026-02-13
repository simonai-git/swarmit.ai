import type { FastifyInstance } from 'fastify';
import { createIntegrationTokenSchema, encrypt } from '@swarmit/shared';

export async function integrationRoutes(app: FastifyInstance) {
  // Upsert integration token
  app.post('/tokens', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { provider, accessToken, refreshToken, expiresAt } = createIntegrationTokenSchema.parse(request.body);

    // Encrypt tokens before storing
    let encryptedToken = accessToken;
    let encryptedRefresh = refreshToken || null;
    if (process.env.ENCRYPTION_KEY) {
      encryptedToken = encrypt(accessToken);
      if (refreshToken) {
        encryptedRefresh = encrypt(refreshToken);
      }
    }

    const token = await app.prisma.integrationToken.upsert({
      where: {
        userId_provider: { userId: request.userId, provider },
      },
      create: {
        userId: request.userId,
        provider,
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        accessToken: encryptedToken,
        refreshToken: encryptedRefresh,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      select: {
        id: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.code(201).send(token);
  });

  // List integration tokens (no secrets)
  app.get('/tokens', { preHandler: [app.authenticate] }, async (request) => {
    const tokens = await app.prisma.integrationToken.findMany({
      where: { userId: request.userId },
      select: {
        id: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return { tokens };
  });

  // Delete integration token
  app.delete<{ Params: { provider: string } }>('/tokens/:provider', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.integrationToken.deleteMany({
      where: { userId: request.userId, provider: request.params.provider },
    });

    if (result.count === 0) {
      return reply.code(404).send({ error: 'Token not found' });
    }

    return { success: true };
  });
}
