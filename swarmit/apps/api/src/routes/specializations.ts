import type { FastifyInstance } from 'fastify';
import { createSpecializationSchema, updateSpecializationSchema } from '@swarmit/shared';

export async function specializationRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const specs = await app.prisma.specialization.findMany({
      where: { userId: request.userId },
      include: { _count: { select: { agents: true } } },
      orderBy: { name: 'asc' },
    });
    return specs;
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = createSpecializationSchema.parse(request.body);
    const spec = await app.prisma.specialization.create({
      data: { ...data, userId: request.userId },
    });
    return reply.code(201).send(spec);
  });

  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateSpecializationSchema.parse(request.body);
    const result = await app.prisma.specialization.updateMany({
      where: { id: request.params.id, userId: request.userId },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Specialization not found' });
    return { success: true };
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.specialization.deleteMany({
      where: { id: request.params.id, userId: request.userId },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Specialization not found' });
    return { success: true };
  });
}
