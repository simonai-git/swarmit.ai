import type { PrismaClient, Task } from '@swarmit/db';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('task-lifecycle');

// Status-to-keyword mapping for finding the right agent per pipeline state
const STATUS_KEYWORDS: Record<string, string[]> = {
  TESTING: ['qa', 'test', 'quality', 'verification'],
  IN_REVIEW: ['review', 'reviewer', 'code review', 'audit'],
  IN_PROGRESS: ['developer', 'dev', 'engineer', 'frontend', 'backend'],
};

export class TaskLifecycleService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Detect the best specialization for a task based on title/description keywords.
   * Returns specialization ID (not agentType string).
   */
  async detectSpecialization(
    title: string,
    description: string | null | undefined,
    userId: string
  ): Promise<string | null> {
    const text = `${title} ${description || ''}`.toLowerCase();

    const userSpecs = await this.prisma.specialization.findMany({
      where: { userId },
    });

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const spec of userSpecs) {
      const score = spec.keywords.filter(kw => text.includes(kw.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = spec.id;
      }
    }

    return bestMatch;
  }

  /**
   * Select the best agent to assign to a task.
   */
  async selectAgent(
    title: string,
    description: string | null | undefined,
    userId: string
  ): Promise<string | null> {
    const specializationId = await this.detectSpecialization(title, description, userId);

    if (specializationId) {
      const agent = await this.prisma.agent.findFirst({
        where: { userId, specializationId },
      });
      if (agent) return agent.id;
    }

    // Fallback: any agent
    const any = await this.prisma.agent.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return any?.id || null;
  }

  /**
   * Called when a task is created. Handles auto-assignment.
   */
  async onTaskCreated(task: Task): Promise<{ assigneeId?: string }> {
    const settings = await this.getSettings(task.userId);
    if (!settings.autoAssign) return {};

    if (task.assigneeId) return {}; // already assigned

    const assigneeId = await this.selectAgent(task.title, task.description, task.userId);
    if (assigneeId) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { assigneeId },
      });
      logger.info({ taskId: task.id, assigneeId }, 'Auto-assigned agent');
      return { assigneeId };
    }

    return {};
  }

  /**
   * Called when a task status changes.
   * Finds an agent whose specialization keywords match the target status.
   */
  async onStatusChanged(
    task: Task,
    oldStatus: string,
    newStatus: string
  ): Promise<{ shouldSpawnAgent: boolean; agentId?: string }> {
    const settings = await this.getSettings(task.userId);
    if (!settings.autoSpawn) return { shouldSpawnAgent: false };

    const targetKeywords = STATUS_KEYWORDS[newStatus];
    if (!targetKeywords) return { shouldSpawnAgent: false };

    // Find agents whose specialization name or keywords match
    const agents = await this.prisma.agent.findMany({
      where: { userId: task.userId },
      include: { specialization: true },
    });

    for (const agent of agents) {
      if (!agent.specialization) continue;
      const specName = agent.specialization.name.toLowerCase();
      const specKeywords = agent.specialization.keywords.map(k => k.toLowerCase());

      const nameMatch = targetKeywords.some(kw => specName.includes(kw));
      const keywordMatch = targetKeywords.some(kw => specKeywords.includes(kw));

      if (nameMatch || keywordMatch) {
        logger.info({ taskId: task.id, agentId: agent.id, newStatus }, 'Auto-spawning agent for status change');
        return { shouldSpawnAgent: true, agentId: agent.id };
      }
    }

    // No matching agent
    return { shouldSpawnAgent: false };
  }

  private async getSettings(userId: string) {
    const settings = await this.prisma.automationSetting.findUnique({
      where: { userId },
    });

    return {
      autoAssign: settings?.autoAssign ?? true,
      autoSpawn: settings?.autoSpawn ?? true,
    };
  }
}
