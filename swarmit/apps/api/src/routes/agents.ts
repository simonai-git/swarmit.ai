import type { FastifyInstance } from 'fastify';
import { createAgentSchema, updateAgentSchema, paginationSchema } from '@swarmit/shared';

export async function agentRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [agents, total] = await Promise.all([
      app.prisma.agent.findMany({
        where: { userId: request.userId },
        include: {
          specialization: true,
          skills: { include: { skill: true } },
          agentWorkflows: { include: { workflow: { select: { id: true, name: true } } } },
          _count: { select: { tasks: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      app.prisma.agent.count({ where: { userId: request.userId } }),
    ]);

    return { agents, total, page, limit };
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const agent = await app.prisma.agent.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        specialization: true,
        skills: { include: { skill: true } },
        agentWorkflows: { include: { workflow: true } },
        tasks: { take: 10, orderBy: { updatedAt: 'desc' } },
      },
    });
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    return agent;
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = createAgentSchema.parse(request.body);
    const agent = await app.prisma.agent.create({
      data: { ...data, userId: request.userId },
    });
    return reply.code(201).send(agent);
  });

  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateAgentSchema.parse(request.body);
    const result = await app.prisma.agent.updateMany({
      where: { id: request.params.id, userId: request.userId },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Agent not found' });
    return { success: true };
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.agent.deleteMany({
      where: { id: request.params.id, userId: request.userId },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Agent not found' });
    return { success: true };
  });

  // Agent skills
  app.post<{ Params: { id: string } }>('/:id/skills', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { skillId } = request.body as { skillId: string };
    const agent = await app.prisma.agent.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    await app.prisma.agentSkill.create({
      data: { agentId: agent.id, skillId },
    });
    return reply.code(201).send({ success: true });
  });

  app.delete<{ Params: { id: string; skillId: string } }>('/:id/skills/:skillId', { preHandler: [app.authenticate] }, async (request) => {
    await app.prisma.agentSkill.deleteMany({
      where: { agentId: request.params.id, skillId: request.params.skillId },
    });
    return { success: true };
  });

  // Agent workflows
  app.post<{ Params: { id: string } }>('/:id/workflows', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { workflowId } = request.body as { workflowId: string };
    const agent = await app.prisma.agent.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    await app.prisma.agentWorkflow.create({
      data: { agentId: agent.id, workflowId },
    });
    return reply.code(201).send({ success: true });
  });

  app.delete<{ Params: { id: string; workflowId: string } }>('/:id/workflows/:workflowId', { preHandler: [app.authenticate] }, async (request) => {
    await app.prisma.agentWorkflow.deleteMany({
      where: { agentId: request.params.id, workflowId: request.params.workflowId },
    });
    return { success: true };
  });
}
