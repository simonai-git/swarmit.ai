import type { FastifyInstance } from 'fastify';
import { paginationSchema } from '@swarmit/shared';

export async function skillRoutes(app: FastifyInstance) {
  // List skills
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [skills, total] = await Promise.all([
      app.prisma.skill.findMany({
        include: { _count: { select: { agents: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      app.prisma.skill.count(),
    ]);

    return { skills, total, page, limit };
  });

  // Get skill by ID
  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const skill = await app.prisma.skill.findUnique({
      where: { id: request.params.id },
      include: {
        agents: {
          include: { agent: { select: { id: true, name: true, specialization: true } } },
        },
      },
    });
    if (!skill) return reply.code(404).send({ error: 'Skill not found' });
    return skill;
  });

  // Create skill
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { name, description, sourceUrl } = request.body as {
      name: string;
      description?: string;
      sourceUrl?: string;
    };

    const skill = await app.prisma.skill.create({
      data: { name, description, sourceUrl },
    });

    return reply.code(201).send(skill);
  });

  // Delete skill
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    try {
      await app.prisma.skill.delete({ where: { id: request.params.id } });
      return { success: true };
    } catch {
      return reply.code(404).send({ error: 'Skill not found' });
    }
  });

  // Search skills (local DB)
  app.get('/search', { preHandler: [app.authenticate] }, async (request) => {
    const { q } = request.query as { q?: string };
    if (!q) return { skills: [] };

    const skills = await app.prisma.skill.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: { name: 'asc' },
    });

    return { skills };
  });
}
