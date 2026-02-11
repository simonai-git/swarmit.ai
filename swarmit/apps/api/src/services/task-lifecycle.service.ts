import type { PrismaClient, Task } from '@swarmit/db';
import { createLogger } from '@swarmit/logger';

const logger = createLogger('task-lifecycle');

// Built-in specialization keywords for auto-assignment
const SPECIALIZATION_KEYWORDS: Record<string, string[]> = {
  frontend: ['ui', 'css', 'react', 'component', 'button', 'modal', 'layout', 'style', 'responsive', 'tailwind', 'design', 'animation'],
  backend: ['api', 'database', 'endpoint', 'server', 'query', 'sql', 'postgres', 'auth', 'middleware', 'route'],
  devops: ['deploy', 'docker', 'railway', 'ci', 'cd', 'pipeline', 'kubernetes', 'infrastructure', 'env', 'ssl', 'domain'],
  qa: ['test', 'bug', 'fix', 'verify', 'validate', 'check', 'broken', 'issue', 'error'],
  'ai-ml': ['llm', 'claude', 'openai', 'prompt', 'agent', 'ml', 'model', 'embedding', 'vector'],
  'project-manager': ['plan', 'prd', 'requirements', 'roadmap', 'milestone', 'sprint', 'epic'],
  'product-manager': ['user story', 'feature', 'product', 'market', 'customer', 'persona', 'ux'],
  reviewer: ['review', 'code review', 'pull request', 'pr', 'audit', 'lint', 'refactor'],
};

export class TaskLifecycleService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Detect the best specialization for a task based on title/description keywords.
   * Also checks user-defined specializations in the DB.
   */
  async detectSpecialization(
    title: string,
    description: string | null | undefined,
    userId: string
  ): Promise<string | null> {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Check user-defined specializations first
    const userSpecs = await this.prisma.specialization.findMany({
      where: { userId },
    });

    for (const spec of userSpecs) {
      const score = spec.keywords.filter(kw => text.includes(kw.toLowerCase())).length;
      if (score > 0) return spec.agentType;
    }

    // Fall back to built-in keywords
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const [spec, keywords] of Object.entries(SPECIALIZATION_KEYWORDS)) {
      const score = keywords.filter(kw => text.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = spec;
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
    const specialization = await this.detectSpecialization(title, description, userId);

    if (specialization) {
      // Find agent matching this specialization
      const agent = await this.prisma.agent.findFirst({
        where: {
          userId,
          specialization: { contains: specialization, mode: 'insensitive' },
        },
      });
      if (agent) return agent.id;
    }

    // Fallback: first agent with 'fullstack' or 'general' specialization
    const fallback = await this.prisma.agent.findFirst({
      where: {
        userId,
        OR: [
          { specialization: { contains: 'fullstack', mode: 'insensitive' } },
          { specialization: { contains: 'full stack', mode: 'insensitive' } },
          { specialization: { contains: 'general', mode: 'insensitive' } },
        ],
      },
    });

    if (fallback) return fallback.id;

    // Last resort: any agent
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
   */
  async onStatusChanged(
    task: Task,
    oldStatus: string,
    newStatus: string
  ): Promise<{ shouldSpawnAgent: boolean; agentType?: string }> {
    const settings = await this.getSettings(task.userId);

    // Spawn QA when moved to testing
    if (settings.autoSpawn && newStatus === 'TESTING') {
      logger.info({ taskId: task.id }, 'Auto-spawning QA agent');
      return { shouldSpawnAgent: true, agentType: 'qa' };
    }

    // Spawn reviewer when moved to in_review
    if (settings.autoSpawn && newStatus === 'IN_REVIEW') {
      logger.info({ taskId: task.id }, 'Auto-spawning reviewer agent');
      return { shouldSpawnAgent: true, agentType: 'reviewer' };
    }

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
