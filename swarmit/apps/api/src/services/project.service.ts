import type { PrismaClient, ProjectStatus } from '@swarmit/db';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('project-service');

export class ProjectService {
  constructor(private prisma: PrismaClient) {}

  async start(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) throw new Error('Project not found');
    if (project.status !== 'PLANNING' && project.status !== 'DRAFT') {
      throw new Error(`Cannot start project in ${project.status} status`);
    }

    // DRAFT projects transition to PLANNING first (then to ACTIVE)
    if (project.status === 'DRAFT') {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { status: 'PLANNING' },
      });
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE' },
    });
  }

  async pause(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) throw new Error('Project not found');
    if (project.status !== 'ACTIVE') {
      throw new Error(`Cannot pause project in ${project.status} status`);
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'PAUSED' },
    });
  }

  async resume(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) throw new Error('Project not found');
    if (project.status !== 'PAUSED') {
      throw new Error(`Cannot resume project in ${project.status} status`);
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE' },
    });
  }

  async cancel(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) throw new Error('Project not found');
    if (['COMPLETED', 'CANCELLED'].includes(project.status)) {
      throw new Error(`Cannot cancel project in ${project.status} status`);
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'CANCELLED' },
    });
  }

  async complete(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
      include: { tasks: { select: { status: true } } },
    });

    if (!project) throw new Error('Project not found');

    const allDone = project.tasks.every(t => t.status === 'DONE');
    if (!allDone) {
      logger.warn({ projectId, tasks: project.tasks.length }, 'Completing project with unfinished tasks');
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'COMPLETED' },
    });
  }

  async checkCompletion(projectId: string): Promise<boolean> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: { select: { status: true } } },
    });

    if (!project) return false;
    return project.tasks.length > 0 && project.tasks.every(t => t.status === 'DONE');
  }
}
