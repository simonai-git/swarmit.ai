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

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'ACTIVE' },
    });

    // Auto-create PM planning task
    await this.createPMPlanTask(project, userId);

    return updated;
  }

  private async createPMPlanTask(
    project: { id: string; title: string; description: string | null; prd: string | null; goal: string | null; targetUsers: string | null; mustHaves: string[]; niceToHaves: string[]; constraints: string | null; deadline: Date | null; budgetRange: string | null; dataSensitivity: string | null; referenceLinks: string[]; projectType: string | null },
    userId: string
  ) {
    const PM_KEYWORDS = ['plan', 'manage', 'product', 'project'];

    try {
      // Find a PM agent for this user
      const pmAgent = await this.prisma.agent.findFirst({
        where: {
          userId,
          specialization: {
            keywords: { hasSome: PM_KEYWORDS },
          },
        },
        include: { specialization: true },
      });

      if (!pmAgent) {
        logger.info({ projectId: project.id }, 'No PM agent found, skipping auto-plan task');
        return;
      }

      const description = buildPMTaskDescription(project);

      await this.prisma.task.create({
        data: {
          title: `[PM] Plan: ${project.title}`,
          description,
          priority: 3,
          status: 'TODO',
          projectId: project.id,
          assigneeId: pmAgent.id,
          userId,
        },
      });

      logger.info({ projectId: project.id, agentId: pmAgent.id }, 'Created PM planning task');
    } catch (err) {
      // Don't fail the start action if PM task creation fails
      logger.error({ err, projectId: project.id }, 'Failed to create PM planning task');
    }
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

function buildPMTaskDescription(project: {
  title: string; description: string | null; prd: string | null;
  goal: string | null; targetUsers: string | null; mustHaves: string[];
  niceToHaves: string[]; constraints: string | null; deadline: Date | null;
  budgetRange: string | null; dataSensitivity: string | null;
  referenceLinks: string[]; projectType: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`Create a detailed project plan for "${project.title}".`);
  lines.push('');
  lines.push('Break the project into actionable tasks with clear dependencies, priorities, and agent assignments.');
  lines.push('');

  lines.push('## Project Details');
  if (project.projectType) lines.push(`- **Type:** ${project.projectType}`);
  if (project.goal) lines.push(`- **Goal:** ${project.goal}`);
  if (project.description) lines.push(`- **Description:** ${project.description}`);
  if (project.targetUsers) lines.push(`- **Target Users:** ${project.targetUsers}`);
  if (project.mustHaves.length > 0) lines.push(`- **Must-Haves:** ${project.mustHaves.join(', ')}`);
  if (project.niceToHaves.length > 0) lines.push(`- **Nice-to-Haves:** ${project.niceToHaves.join(', ')}`);
  if (project.deadline) lines.push(`- **Deadline:** ${new Date(project.deadline).toLocaleDateString()}`);
  if (project.budgetRange) lines.push(`- **Budget:** ${project.budgetRange}`);
  if (project.constraints) lines.push(`- **Constraints:** ${project.constraints}`);
  if (project.dataSensitivity) lines.push(`- **Data Sensitivity:** ${project.dataSensitivity}`);
  if (project.referenceLinks.length > 0) lines.push(`- **References:** ${project.referenceLinks.join(', ')}`);

  if (project.prd) {
    lines.push('');
    lines.push('## Product Requirements Document');
    lines.push(project.prd);
  }

  lines.push('');
  lines.push('## Instructions');
  lines.push('1. Analyze the requirements above');
  lines.push('2. Create tasks using the create_task tool');
  lines.push('3. Set up dependencies between tasks using add_dependency');
  lines.push('4. Assign appropriate priority levels (1=low, 2=medium, 3=critical)');

  return lines.join('\n');
}
