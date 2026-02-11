import type { FastifyInstance } from 'fastify';
import { createWorkflowSchema, updateWorkflowSchema, paginationSchema, validateWorkflow } from '@swarmit/shared';
import type { WorkflowNode, WorkflowEdge } from '@swarmit/shared';

export async function workflowRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const skip = (page - 1) * limit;

    const [workflows, total] = await Promise.all([
      app.prisma.workflow.findMany({
        where: { userId: request.userId },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
          _count: { select: { agents: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      app.prisma.workflow.count({ where: { userId: request.userId } }),
    ]);

    return { workflows, total, page, limit };
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const workflow = await app.prisma.workflow.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: {
        versions: { orderBy: { version: 'desc' } },
        agents: { include: { agent: { select: { id: true, name: true } } } },
      },
    });
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = createWorkflowSchema.parse(request.body);
    const workflow = await app.prisma.workflow.create({
      data: { ...data, userId: request.userId },
    });
    return reply.code(201).send(workflow);
  });

  app.patch<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const data = updateWorkflowSchema.parse(request.body);
    const result = await app.prisma.workflow.updateMany({
      where: { id: request.params.id, userId: request.userId },
      data,
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Workflow not found' });
    return { success: true };
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await app.prisma.workflow.deleteMany({
      where: { id: request.params.id, userId: request.userId },
    });
    if (result.count === 0) return reply.code(404).send({ error: 'Workflow not found' });
    return { success: true };
  });

  // Save workflow version (nodes + edges)
  app.post<{ Params: { id: string } }>('/:id/versions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { nodes, edges } = request.body as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

    const workflow = await app.prisma.workflow.findFirst({
      where: { id: request.params.id, userId: request.userId },
    });
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });

    const latestVersion = await app.prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { version: 'desc' },
    });

    const version = await app.prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        version: (latestVersion?.version || 0) + 1,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
    });

    return reply.code(201).send(version);
  });

  // Validate workflow
  app.post<{ Params: { id: string } }>('/:id/validate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { nodes, edges } = request.body as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };

    const result = validateWorkflow(nodes, edges);
    return result;
  });

  // Publish workflow
  app.post<{ Params: { id: string } }>('/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const workflow = await app.prisma.workflow.findFirst({
      where: { id: request.params.id, userId: request.userId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });
    if (workflow.versions.length === 0) return reply.code(400).send({ error: 'Workflow has no versions' });

    const latestVersion = workflow.versions[0];
    const nodes = latestVersion.nodes as unknown as WorkflowNode[];
    const edges = latestVersion.edges as unknown as WorkflowEdge[];

    const validation = validateWorkflow(nodes, edges);
    if (!validation.valid) {
      return reply.code(400).send({ error: 'Workflow validation failed', details: validation.errors });
    }

    await app.prisma.workflow.update({
      where: { id: workflow.id },
      data: { isPublished: true },
    });

    return { success: true, versionId: latestVersion.id };
  });
}
