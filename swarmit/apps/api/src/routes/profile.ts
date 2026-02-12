import type { FastifyInstance } from 'fastify';
import { updateProfileSchema, updateAutomationSettingSchema, encrypt } from '@swarmit/shared';

export async function profileRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        plan: true,
        claudeApiKey: true,
        createdAt: true,
      },
    });
    if (!user) return { error: 'User not found' };

    // Mask API key
    return {
      ...user,
      claudeApiKey: user.claudeApiKey
        ? `${user.claudeApiKey.slice(0, 12)}...${user.claudeApiKey.slice(-4)}`
        : null,
    };
  });

  app.patch('/', { preHandler: [app.authenticate] }, async (request) => {
    const data = updateProfileSchema.parse(request.body);

    // Encrypt API key before storing
    const updateData = { ...data };
    if (updateData.claudeApiKey && process.env.ENCRYPTION_KEY) {
      updateData.claudeApiKey = encrypt(updateData.claudeApiKey);
    }

    await app.prisma.user.update({
      where: { id: request.userId },
      data: updateData,
    });

    return { success: true };
  });

  // Automation settings
  app.get('/automation', { preHandler: [app.authenticate] }, async (request) => {
    let settings = await app.prisma.automationSetting.findUnique({
      where: { userId: request.userId },
    });

    if (!settings) {
      settings = await app.prisma.automationSetting.create({
        data: { userId: request.userId },
      });
    }

    return settings;
  });

  app.patch('/automation', { preHandler: [app.authenticate] }, async (request) => {
    const data = updateAutomationSettingSchema.parse(request.body);

    await app.prisma.automationSetting.upsert({
      where: { userId: request.userId },
      create: { ...data, userId: request.userId },
      update: data,
    });

    return { success: true };
  });
}
