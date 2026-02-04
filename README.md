# Swarmit.ai 🐝

AI Agent Swarm Task Management System - Coordinate multiple AI agents working in parallel on complex projects.

## Features

- **Multi-Agent Orchestration**: Spawn and coordinate multiple AI sub-agents working in parallel
- **Project & Task Management**: Full kanban board with projects, tasks, comments, and activity tracking
- **Agent Specialization**: Frontend, Backend, DevOps, QA, and AI specialist agents
- **Real-time Updates**: SSE-powered live updates across all connected clients
- **Feedback System**: Collect and convert user feedback into actionable tasks
- **Watcher System**: Automated task monitoring and agent spawning

## Tech Stack

- **Frontend**: Next.js 14, React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **Auth**: NextAuth.js with Google OAuth
- **Deployment**: Railway

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and auth credentials

# Run development server
npm run dev
```

## Environment Variables

```
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## API Endpoints

### Tasks
- `GET /api/tasks` - List all tasks (supports `?status=` filter)
- `POST /api/tasks` - Create a task
- `GET /api/tasks/:id` - Get task details
- `PATCH /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task
- `GET /api/tasks/:id/comments` - Get task comments
- `POST /api/tasks/:id/comments` - Add a comment

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create a project
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update a project
- `DELETE /api/projects/:id` - Delete a project
- `GET /api/projects/:id/tasks` - Get project tasks
- `GET /api/projects/:id/feedback` - Get project feedback
- `POST /api/projects/:id/feedback` - Add feedback
- `POST /api/projects/:id/feedback/:feedbackId/convert` - Convert feedback to task

### Agents
- `GET /api/agents` - List all agents
- `POST /api/agents` - Create an agent
- `GET /api/agents/:id` - Get agent details
- `PATCH /api/agents/:id` - Update an agent

### Watcher
- `GET /api/watcher` - Get watcher state
- `POST /api/watcher` - Control watcher (start_task, end_task, toggle)

## Agent System

Agents are specialized AI workers with different capabilities:

| Agent | Specialization | Emoji |
|-------|---------------|-------|
| Simon | Tech Lead / Full Stack | 🦊 |
| Alex | Frontend Developer | 🎨 |
| Morgan | Backend Developer | ⚙️ |
| Jordan | DevOps Engineer | 🔧 |
| Riley | QA Engineer | 🧪 |
| Casey | AI Engineer | 🤖 |
| Sam | Product Manager | 📋 |

## License

MIT
