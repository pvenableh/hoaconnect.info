# Projects Timeline Implementation Guide

This guide provides a complete specification for implementing a "Subway Map" project timeline system with universal comments and reactions in a Nuxt 3 + Directus application.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites & Dependencies](#prerequisites--dependencies)
3. [Directus Schema Setup](#directus-schema-setup)
4. [TypeScript Types](#typescript-types)
5. [Composables](#composables)
6. [Vue Components](#vue-components)
7. [Pages & Routing](#pages--routing)
8. [Styling & Animations](#styling--animations)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

### System Architecture

The Projects Timeline system consists of:

- **Projects**: Timeline "lines" that represent ongoing initiatives
- **Project Events**: Nodes/milestones along a project's timeline
- **Project Tasks**: Actionable items attached to events with assignees and due dates
- **Comments**: Polymorphic comment system that works on any collection
- **Reactions**: Polymorphic reaction system (emoji/icon-based) that works on any collection

### Visual Concept

Think "subway map meets Gantt chart":
- Each project is a colored horizontal line
- Events are nodes along the line (circles)
- Milestones are larger nodes
- Active projects show a pulsing "today" marker
- Completed/paused projects show end markers
- Sub-projects branch from parent events
- Clicking a node opens a detail panel with tasks, files, comments, and reactions

---

## Prerequisites & Dependencies

### Required npm packages (install separately)

```bash
# Core Nuxt/Vue
pnpm add nuxt@^3.15 vue@^3.5

# Directus SDK
pnpm add @directus/sdk@^20.3

# UI Components (shadcn-vue recommended)
pnpm add shadcn-nuxt reka-ui class-variance-authority clsx tailwind-merge

# Tailwind CSS v4
pnpm add -D tailwindcss@^4.1 @tailwindcss/postcss @tailwindcss/vite

# Tiptap (Rich Text Editor for comments)
pnpm add @tiptap/vue-3 @tiptap/starter-kit @tiptap/pm @tiptap/extension-link @tiptap/extension-image @tiptap/extension-mention @tiptap/extension-character-count @tiptap/extension-placeholder @tiptap/suggestion

# Animation
pnpm add gsap

# Form Validation
pnpm add @vee-validate/nuxt @vee-validate/zod zod vee-validate

# Utilities
pnpm add @vueuse/nuxt @vueuse/core lucide-vue-next isomorphic-dompurify canvas-confetti
```

### Nuxt Modules (nuxt.config.ts)

```typescript
export default defineNuxtConfig({
  modules: [
    '@nuxt/icon',
    '@nuxtjs/color-mode',
    '@vueuse/nuxt',
    '@vee-validate/nuxt',
    'shadcn-nuxt',
  ],
  shadcn: {
    prefix: '',
    componentDir: './components/ui'
  },
  veeValidate: {
    autoImports: true,
  },
})
```

---

## Directus Schema Setup

### 1. Project Categories

```yaml
Collection: project_categories
Fields:
  - id: uuid (primary key, auto-generated)
  - status: string (dropdown: published, draft) [default: published]
  - sort: integer (nullable)
  - name: string (required)
  - color: string (required, hex color, default: #C4A052)
  - icon: string (nullable, e.g., "i-heroicons-building-office")
```

### 2. Projects

```yaml
Collection: projects
Fields:
  - id: uuid (primary key, auto-generated)
  - status: string (dropdown: draft, active, paused, completed, archived) [default: draft]
  - sort: integer (nullable)
  - user_created: uuid (M2O -> directus_users, auto-filled)
  - user_updated: uuid (M2O -> directus_users, auto-filled)
  - date_created: datetime (auto-filled)
  - date_updated: datetime (auto-filled)
  - name: string (required, max 100)
  - description: text (nullable, rich text)
  - color: string (required, hex color, default: #C4A052)
  - icon: string (nullable)
  - category_id: uuid (M2O -> project_categories, nullable)
  - parent_id: uuid (M2O -> projects, nullable) # For sub-projects
  - parent_event_id: uuid (M2O -> project_events, nullable) # Event that spawned sub-project
  - member_visible: boolean (default: true)
  - start_date: date (required)
  - target_end_date: date (nullable)
  - actual_end_date: date (nullable)

Relations:
  - events: O2M -> project_events (via project_id)
  - children: O2M -> projects (via parent_id)
```

### 3. Project Event Categories

```yaml
Collection: project_event_categories
Fields:
  - id: uuid (primary key)
  - status: string (dropdown: published, draft) [default: published]
  - sort: integer (nullable)
  - name: string (required)
  - color: string (required, hex color for badge background)
  - text_color: string (required, hex color for badge text, default: #FFFFFF)
  - icon: string (nullable)
```

### 4. Project Events

```yaml
Collection: project_events
Fields:
  - id: uuid (primary key)
  - status: string (dropdown: published, draft) [default: published]
  - sort: integer (nullable)
  - user_created: uuid (M2O -> directus_users)
  - user_updated: uuid (M2O -> directus_users)
  - date_created: datetime
  - date_updated: datetime
  - project_id: uuid (M2O -> projects, required)
  - title: string (required, max 200)
  - description: text (nullable, rich text/HTML from Tiptap)
  - event_date: date (required)
  - category_id: uuid (M2O -> project_event_categories, nullable)
  - is_milestone: boolean (default: false)

Relations:
  - tasks: O2M -> project_tasks (via event_id)
  - files: M2M -> directus_files (via project_event_files junction)
  - spawned_projects: O2M -> projects (via parent_event_id)
```

### 5. Project Event Files (Junction Table)

```yaml
Collection: project_event_files
Fields:
  - id: integer (primary key, auto-increment)
  - project_event_id: uuid (M2O -> project_events)
  - directus_files_id: uuid (M2O -> directus_files)
  - sort: integer (nullable)
```

### 6. Project Tasks

```yaml
Collection: project_tasks
Fields:
  - id: uuid (primary key)
  - status: string (dropdown: published, draft) [default: published]
  - sort: integer (nullable)
  - user_created: uuid (M2O -> directus_users)
  - date_created: datetime
  - event_id: uuid (M2O -> project_events, required)
  - title: string (required, max 200)
  - description: text (nullable)
  - assignee_id: uuid (M2O -> directus_users, nullable)
  - completed: boolean (default: false)
  - completed_at: datetime (nullable)
  - completed_by: uuid (M2O -> directus_users, nullable)
  - due_date: date (nullable)
  - priority: string (dropdown: low, medium, high, nullable)

Relations:
  - watchers: O2M -> project_task_watchers (via task_id)
```

### 7. Project Task Watchers (Junction Table)

```yaml
Collection: project_task_watchers
Fields:
  - id: integer (primary key, auto-increment)
  - task_id: uuid (M2O -> project_tasks)
  - user_id: uuid (M2O -> directus_users)
  - date_created: datetime
```

---

## Universal Comments System

### 8. Comments

```yaml
Collection: comments
Fields:
  - id: uuid (primary key)
  - status: string (dropdown: published, draft, archived) [default: published]
  - sort: integer (nullable)
  - user_created: uuid (M2O -> directus_users)
  - date_created: datetime
  - user_updated: uuid (M2O -> directus_users)
  - date_updated: datetime
  - content: text (required, HTML from Tiptap)
  - target_collection: string (required) # e.g., "project_events", "announcements"
  - target_id: string (required) # UUID of the target item
  - parent_id: uuid (M2O -> comments, nullable) # For threaded replies
  - is_edited: boolean (default: false)
  - is_resolved: boolean (default: false)

Relations:
  - mentions: O2M -> comment_mentions (via comment_id)
  - files: O2M -> comment_files (via comment_id)
  - replies: O2M -> comments (via parent_id)
```

### 9. Comment Mentions (Junction Table)

```yaml
Collection: comment_mentions
Fields:
  - id: integer (primary key, auto-increment)
  - date_created: datetime
  - comment_id: uuid (M2O -> comments)
  - user_id: uuid (M2O -> directus_users)
  - notified: boolean (default: false)
```

### 10. Comment Files (Junction Table)

```yaml
Collection: comment_files
Fields:
  - id: integer (primary key, auto-increment)
  - sort: integer (nullable)
  - date_created: datetime
  - comment_id: uuid (M2O -> comments)
  - directus_files_id: uuid (M2O -> directus_files)
```

---

## Universal Reactions System

### 11. Reaction Types

```yaml
Collection: reaction_types
Fields:
  - id: integer (primary key, auto-increment)
  - status: string (dropdown: published, draft) [default: published]
  - sort: integer (nullable)
  - user_created: uuid (M2O -> directus_users)
  - user_updated: uuid (M2O -> directus_users)
  - date_created: datetime
  - date_updated: datetime
  - name: string (required, e.g., "Like", "Love", "Celebrate")
  - emoji: string (nullable, e.g., "ðŸ‘", "â¤ï¸", "ðŸŽ‰")
  - icon: string (nullable, e.g., "thumb-up", "heart", "party-popper")
  - icon_family: string (dropdown: heroicons, lucide, fluent-emoji-flat, emoji, nullable)

# Seed with default reaction types:
# 1. Like (ðŸ‘)
# 2. Love (â¤ï¸)
# 3. Celebrate (ðŸŽ‰)
# 4. Thinking (ðŸ¤”)
# 5. Sad (ðŸ˜¢)
```

### 12. Reactions

```yaml
Collection: reactions
Fields:
  - id: integer (primary key, auto-increment)
  - user_created: uuid (M2O -> directus_users)
  - date_created: datetime
  - collection: string (required) # e.g., "project_events", "comments", "channel_messages"
  - item_id: string (required) # UUID of the target item
  - reaction_type: integer (M2O -> reaction_types, required)

# Unique constraint: (collection, item_id, user_created) - one reaction per user per item
```

---

## TypeScript Types

### types/projects/index.ts

```typescript
/**
 * Project Timeline System Types
 */

import type { DirectusUser, DirectusFile } from '../directus';

type User = DirectusUser;
type File = DirectusFile;

export interface Project {
  id: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  sort: number | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  category_id: string | ProjectCategory | null;
  parent_id: string | Project | null;
  parent_event_id: string | ProjectEvent | null;
  member_visible: boolean;
  start_date: string;
  target_end_date: string | null;
  actual_end_date: string | null;
  events?: ProjectEvent[];
  children?: Project[];
}

export interface ProjectCategory {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  color: string;
  icon: string | null;
}

export interface ProjectEventCategory {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  color: string;
  text_color: string;
  icon: string | null;
}

export interface ProjectEvent {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  project_id: string | Project;
  title: string;
  description: string | null;
  event_date: string;
  category_id: string | ProjectEventCategory | null;
  is_milestone: boolean;
  tasks?: ProjectTask[];
  files?: ProjectEventFile[];
  spawned_projects?: Project[];
}

export interface ProjectTask {
  id: string;
  status: 'published' | 'draft';
  sort: number | null;
  user_created: string | User | null;
  date_created: string | null;
  event_id: string | ProjectEvent;
  title: string;
  description: string | null;
  assignee_id: string | User | null;
  watchers?: ProjectTaskWatcher[];
  completed: boolean;
  completed_at: string | null;
  completed_by: string | User | null;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high' | null;
}

export interface ProjectTaskWatcher {
  id: number;
  task_id: string | ProjectTask;
  user_id: string | User;
  date_created: string | null;
}

export interface ProjectEventFile {
  id: number;
  project_event_id: string | ProjectEvent;
  directus_files_id: string | File;
  sort: number | null;
}

export interface ProjectStats {
  events: number;
  tasksTotal: number;
  tasksCompleted: number;
  subProjects: number;
  files: number;
  comments: number;
  reactions: number;
  durationDays: number;
  progressPercent: number;
  isOngoing: boolean;
}

export interface CreateProjectPayload {
  name: string;
  description?: string | null;
  color?: string;
  icon?: string | null;
  category_id?: string | null;
  parent_id?: string | null;
  parent_event_id?: string | null;
  member_visible?: boolean;
  start_date: string;
  target_end_date?: string | null;
  status?: Project['status'];
}

export interface CreateEventPayload {
  project_id: string;
  title: string;
  description?: string | null;
  event_date: string;
  category_id?: string | null;
  is_milestone?: boolean;
}

export interface CreateTaskPayload {
  event_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  due_date?: string | null;
  priority?: ProjectTask['priority'];
}

export interface ProjectWithRelations extends Omit<Project, 'user_created' | 'user_updated' | 'category_id' | 'parent_id' | 'parent_event_id'> {
  user_created: User | null;
  user_updated: User | null;
  category_id: ProjectCategory | null;
  parent_id: Project | null;
  parent_event_id: ProjectEvent | null;
  events: ProjectEventWithRelations[];
  children: ProjectWithRelations[];
}

export interface ProjectEventWithRelations extends Omit<ProjectEvent, 'user_created' | 'project_id' | 'category_id'> {
  user_created: User | null;
  project_id: Project;
  category_id: ProjectEventCategory | null;
  tasks: ProjectTaskWithRelations[];
  files: (Omit<ProjectEventFile, 'directus_files_id'> & { directus_files_id: File })[];
  comment_count?: number;
  reaction_count?: number;
}

export interface ProjectTaskWithRelations extends Omit<ProjectTask, 'assignee_id' | 'completed_by' | 'event_id' | 'watchers'> {
  assignee_id: User | null;
  completed_by: User | null;
  event_id: ProjectEvent;
  watchers: (Omit<ProjectTaskWatcher, 'user_id'> & { user_id: User })[];
}

export interface TimelineViewState {
  zoomLevel: number;
  focusedProjectId: string | null;
  selectedEventId: string | null;
  dateRange: { start: Date; end: Date };
}

export interface TimelineLane {
  project: ProjectWithRelations;
  laneIndex: number;
  yPosition: number;
}
```

### types/comments/index.ts

```typescript
/**
 * Comments System Types - Polymorphic for any collection
 */

import type { DirectusUser, DirectusFile } from '../directus';

type User = DirectusUser;
type File = DirectusFile;

export interface Comment {
  id: string;
  user_created: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  content: string;
  target_collection: string;
  target_id: string;
  parent_id: string | Comment | null;
  is_edited: boolean;
  is_resolved: boolean;
  mentions?: CommentMention[];
  files?: CommentFile[];
  replies?: Comment[];
}

export interface CommentMention {
  id: number;
  comment_id: string | Comment;
  user_id: string | User;
  notified: boolean;
  date_created: string | null;
}

export interface CommentFile {
  id: number;
  comment_id: string | Comment;
  directus_files_id: string | File;
  sort: number | null;
}

export interface CommentWithRelations extends Omit<Comment, 'user_created' | 'parent_id' | 'mentions' | 'files' | 'replies'> {
  user_created: User | null;
  parent_id: Comment | null;
  mentions: (Omit<CommentMention, 'user_id'> & { user_id: User })[];
  files: (Omit<CommentFile, 'directus_files_id'> & { directus_files_id: File })[];
  replies: CommentWithRelations[];
  reply_count?: number;
}

export interface CreateCommentPayload {
  content: string;
  target_collection: string;
  target_id: string;
  parent_id?: string;
  mentioned_user_ids?: string[];
}

export interface UpdateCommentPayload {
  content: string;
  is_resolved?: boolean;
}

export interface CommentCountInfo {
  target_collection: string;
  target_id: string;
  total_count: number;
  unresolved_count: number;
}

export interface CommentTargetProps {
  targetCollection: string;
  targetId: string;
}
```

### types/reactions/index.ts

```typescript
/**
 * Reactions System Types - Polymorphic for any collection
 */

import type { DirectusUser } from '../directus';

type User = DirectusUser;

export type IconFamily = 'heroicons' | 'lucide' | 'fluent-emoji-flat' | 'emoji';

export interface ReactionTypeRecord {
  id: number;
  status: 'published' | 'draft';
  sort: number | null;
  name: string;
  emoji: string | null;
  icon: string | null;
  icon_family: IconFamily | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
}

// Add your collection names here as you enable reactions on them
export type ReactableCollection = 'channel_messages' | 'comments' | 'project_events';

export interface Reaction {
  id: number;
  user_created: string | User;
  date_created: string | null;
  collection: ReactableCollection;
  item_id: string;
  reaction_type: number | ReactionTypeRecord;
}

export interface ReactionWithRelations extends Omit<Reaction, 'user_created' | 'reaction_type'> {
  user_created: User;
  reaction_type: ReactionTypeRecord;
}

export interface ReactionCount {
  reaction_type: ReactionTypeRecord;
  count: number;
  users: User[];
  hasReacted: boolean;
}

export interface ReactionSummary {
  item_id: string;
  collection: ReactableCollection;
  reactions: ReactionCount[];
  totalCount: number;
}

export interface CreateReactionPayload {
  collection: ReactableCollection;
  item_id: string;
  reaction_type: number;
}

export function getReactionIcon(reactionType: ReactionTypeRecord): string {
  if (!reactionType.icon_family || !reactionType.icon) return '';

  switch (reactionType.icon_family) {
    case 'heroicons':
      return `i-heroicons-${reactionType.icon}`;
    case 'lucide':
      return `i-lucide-${reactionType.icon}`;
    case 'fluent-emoji-flat':
      return `i-fluent-emoji-flat-${reactionType.icon}`;
    default:
      return reactionType.icon;
  }
}

export function getReactionIconFilled(reactionType: ReactionTypeRecord): string {
  if (!reactionType.icon_family || !reactionType.icon) return '';

  switch (reactionType.icon_family) {
    case 'heroicons':
      return `i-heroicons-${reactionType.icon}-solid`;
    case 'lucide':
      return `i-lucide-${reactionType.icon}`;
    default:
      return reactionType.icon;
  }
}
```

---

## Composables

### composables/useProjectTimeline.ts

```typescript
/**
 * useProjectTimeline - Main composable for project timeline data
 */

import type {
  Project,
  ProjectWithRelations,
  ProjectEvent,
  ProjectEventWithRelations,
  ProjectTask,
  CreateProjectPayload,
  CreateEventPayload,
  CreateTaskPayload,
} from '~/types/projects';

export function useProjectTimeline() {
  const { user } = useDirectusAuth();
  const projects = useDirectusItems<Project>('projects');
  const events = useDirectusItems<ProjectEvent>('project_events');
  const tasks = useDirectusItems<ProjectTask>('project_tasks');
  const { getReactionSummary } = useReactions();
  const { getCommentCount } = useComments();

  const projectList = useState<ProjectWithRelations[]>('project-timeline', () => []);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const projectFields = [
    '*',
    'category_id.*',
    'parent_id.id',
    'parent_id.name',
    'parent_id.color',
    'parent_event_id.id',
    'parent_event_id.title',
    'user_created.id',
    'user_created.first_name',
    'user_created.last_name',
    'user_created.avatar',
    'events.id',
    'events.status',
    'events.title',
    'events.description',
    'events.event_date',
    'events.is_milestone',
    'events.category_id.*',
    'events.tasks.id',
    'events.tasks.title',
    'events.tasks.completed',
    'events.tasks.due_date',
    'events.tasks.priority',
    'events.tasks.assignee_id.id',
    'events.tasks.assignee_id.first_name',
    'events.tasks.assignee_id.last_name',
    'events.tasks.assignee_id.avatar',
    'events.files.id',
    'events.files.directus_files_id.id',
    'events.files.directus_files_id.filename_download',
    'events.files.directus_files_id.type',
    'events.files.directus_files_id.filesize',
    'children.id',
    'children.name',
    'children.color',
    'children.status',
  ];

  const fetchProjects = async () => {
    if (!user.value?.id) {
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const result = await projects.list({
        fields: projectFields,
        filter: { status: { _in: ['active', 'completed', 'paused'] } },
        sort: ['sort', 'start_date'],
        limit: -1,
      });

      for (const project of result as ProjectWithRelations[]) {
        if (project.events) {
          project.events = (project.events as ProjectEventWithRelations[])
            .filter((e) => e.status === 'published')
            .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

          for (const event of project.events as ProjectEventWithRelations[]) {
            try {
              const [commentCount, reactionSummary] = await Promise.all([
                getCommentCount('project_events', event.id),
                getReactionSummary('project_events', event.id),
              ]);
              event.comment_count = commentCount.total_count;
              event.reaction_count = reactionSummary.totalCount;
            } catch {
              event.comment_count = 0;
              event.reaction_count = 0;
            }
          }
        }

        if (project.children) {
          project.children = (project.children as Project[]).filter((c) =>
            ['active', 'completed'].includes(c.status)
          );
        }
      }

      projectList.value = result as ProjectWithRelations[];
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch projects';
    } finally {
      loading.value = false;
    }
  };

  const fetchProject = async (projectId: string): Promise<ProjectWithRelations | null> => {
    if (!user.value?.id) return null;
    try {
      const result = await projects.get(projectId, { fields: projectFields });
      return result as ProjectWithRelations;
    } catch {
      return null;
    }
  };

  const createProject = async (data: CreateProjectPayload): Promise<ProjectWithRelations> => {
    const created = await projects.create(data, { fields: projectFields });
    await fetchProjects();
    return created as ProjectWithRelations;
  };

  const updateProject = async (projectId: string, data: Partial<Project>): Promise<ProjectWithRelations> => {
    const updated = await projects.update(projectId, data, { fields: projectFields });
    await fetchProjects();
    return updated as ProjectWithRelations;
  };

  const createEvent = async (data: CreateEventPayload): Promise<ProjectEventWithRelations> => {
    const created = await events.create({ ...data, status: 'published' });
    await fetchProjects();
    return created as ProjectEventWithRelations;
  };

  const updateEvent = async (eventId: string, data: Partial<ProjectEvent>): Promise<ProjectEventWithRelations> => {
    const updated = await events.update(eventId, data);
    await fetchProjects();
    return updated as ProjectEventWithRelations;
  };

  const deleteEvent = async (eventId: string): Promise<void> => {
    await events.remove(eventId);
    await fetchProjects();
  };

  const toggleTask = async (taskId: string, completed: boolean): Promise<void> => {
    await tasks.update(taskId, {
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user.value?.id : null,
    });
    await fetchProjects();
  };

  const createTask = async (data: CreateTaskPayload): Promise<ProjectTask> => {
    const created = await tasks.create(data);
    await fetchProjects();
    return created;
  };

  const updateTask = async (taskId: string, data: Partial<ProjectTask>): Promise<ProjectTask> => {
    const updated = await tasks.update(taskId, data);
    await fetchProjects();
    return updated;
  };

  const deleteTask = async (taskId: string): Promise<void> => {
    await tasks.remove(taskId);
    await fetchProjects();
  };

  const createSubProject = async (
    parentProjectId: string,
    parentEventId: string,
    data: Omit<CreateProjectPayload, 'parent_id' | 'parent_event_id'>
  ): Promise<ProjectWithRelations> => {
    return await createProject({
      ...data,
      parent_id: parentProjectId,
      parent_event_id: parentEventId,
    });
  };

  const getProjectById = (projectId: string): ProjectWithRelations | null => {
    return projectList.value.find((p) => p.id === projectId) || null;
  };

  const getEventById = (eventId: string): ProjectEventWithRelations | null => {
    for (const project of projectList.value) {
      const event = project.events?.find((e) => e.id === eventId);
      if (event) return event as ProjectEventWithRelations;
    }
    return null;
  };

  const getProjectForEvent = (eventId: string): ProjectWithRelations | null => {
    for (const project of projectList.value) {
      if (project.events?.find((e) => e.id === eventId)) return project;
    }
    return null;
  };

  return {
    projects: projectList,
    loading,
    error,
    refresh: fetchProjects,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    createEvent,
    updateEvent,
    deleteEvent,
    createTask,
    updateTask,
    deleteTask,
    toggleTask,
    createSubProject,
    getProjectById,
    getEventById,
    getProjectForEvent,
  };
}
```

### composables/useTimelineLayout.ts

```typescript
/**
 * useTimelineLayout - Timeline positioning and layout calculations
 */

import type { ProjectWithRelations, TimelineLane } from '~/types/projects';

export function useTimelineLayout(
  projects: Ref<ProjectWithRelations[]>,
  zoom: Ref<number>
) {
  const laneHeight = 220;
  const headerHeight = 60;
  const padding = 100;

  const dateRange = computed(() => {
    let min = Infinity;
    let max = -Infinity;

    for (const project of projects.value) {
      const startTime = new Date(project.start_date).getTime();
      if (startTime < min) min = startTime;

      if (project.actual_end_date) {
        const endTime = new Date(project.actual_end_date).getTime();
        if (endTime > max) max = endTime;
      }

      for (const event of project.events || []) {
        const eventTime = new Date(event.event_date).getTime();
        if (eventTime < min) min = eventTime;
        if (eventTime > max) max = eventTime;
      }
    }

    if (min === Infinity || max === -Infinity) {
      const now = Date.now();
      const oneMonth = 30 * 24 * 60 * 60 * 1000;
      min = now - oneMonth;
      max = now + oneMonth;
    }

    const today = Date.now();
    if (today > max) max = today;

    const range = max - min;
    const rangePadding = range * 0.1;

    return {
      start: new Date(min - rangePadding),
      end: new Date(max + rangePadding),
    };
  });

  const canvasWidth = computed(() => 1200 * zoom.value);

  const getXPosition = (dateString: string): number => {
    const time = new Date(dateString).getTime();
    const range = dateRange.value.end.getTime() - dateRange.value.start.getTime();
    const ratio = (time - dateRange.value.start.getTime()) / range;
    return padding + ratio * (canvasWidth.value - 2 * padding);
  };

  const getDateFromX = (x: number): Date => {
    const ratio = (x - padding) / (canvasWidth.value - 2 * padding);
    const range = dateRange.value.end.getTime() - dateRange.value.start.getTime();
    return new Date(dateRange.value.start.getTime() + ratio * range);
  };

  const todayX = computed(() => getXPosition(new Date().toISOString()));

  const getLaneIndex = (project: ProjectWithRelations, allProjects: ProjectWithRelations[]): number => {
    const rootProjects = allProjects.filter((p) => !p.parent_id);
    const rootIndex = rootProjects.findIndex((p) => p.id === project.id);
    if (rootIndex !== -1) return rootIndex;

    const parentId = typeof project.parent_id === 'object' ? project.parent_id?.id : project.parent_id;
    const parent = allProjects.find((p) => p.id === parentId);

    if (parent) {
      const parentLane = getLaneIndex(parent, allProjects);
      const siblings = allProjects.filter((p) => {
        const pParentId = typeof p.parent_id === 'object' ? p.parent_id?.id : p.parent_id;
        return pParentId === parent.id;
      });
      const siblingIndex = siblings.findIndex((p) => p.id === project.id);
      return parentLane + siblingIndex + 1;
    }

    return 0;
  };

  const lanes = computed<TimelineLane[]>(() => {
    return projects.value.map((project) => ({
      project,
      laneIndex: getLaneIndex(project, projects.value),
      yPosition: getLaneIndex(project, projects.value) * laneHeight + headerHeight,
    }));
  });

  const totalLanes = computed(() => {
    if (lanes.value.length === 0) return 1;
    return Math.max(...lanes.value.map((l) => l.laneIndex)) + 1;
  });

  const canvasHeight = computed(() => totalLanes.value * laneHeight + headerHeight + 60);

  const timeLabels = computed(() => {
    const labels: { x: number; text: string }[] = [];
    const current = new Date(dateRange.value.start);
    current.setDate(1);

    while (current <= dateRange.value.end) {
      labels.push({
        x: getXPosition(current.toISOString()),
        text: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
      });
      current.setMonth(current.getMonth() + 1);
    }

    return labels;
  });

  const gridSpacing = computed(() => 100 * zoom.value);

  return {
    lanes,
    dateRange,
    totalLanes,
    laneHeight,
    headerHeight,
    padding,
    canvasWidth,
    canvasHeight,
    gridSpacing,
    todayX,
    timeLabels,
    getXPosition,
    getDateFromX,
    getLaneIndex,
  };
}
```

### composables/useComments.ts

```typescript
/**
 * useComments - Polymorphic comment management
 */

import type {
  Comment,
  CommentMention,
  CommentFile,
  CommentWithRelations,
  CreateCommentPayload,
  UpdateCommentPayload,
  CommentCountInfo,
} from '~/types/comments';

export function useComments() {
  const comments = useDirectusItems<Comment>('comments');
  const commentMentions = useDirectusItems<CommentMention>('comment_mentions');
  const { user } = useDirectusAuth();

  const COMMENT_UPLOADS_FOLDER = 'comment-uploads';

  const getComments = async (
    targetCollection: string,
    targetId: string,
    options?: {
      includeReplies?: boolean;
      parentId?: string | null;
      limit?: number;
      offset?: number;
    }
  ): Promise<CommentWithRelations[]> => {
    const filter: Record<string, any> = {
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
    };

    if (options?.parentId !== undefined) {
      filter.parent_id = options.parentId ? { _eq: options.parentId } : { _null: true };
    }

    const result = await comments.list({
      fields: [
        '*',
        'user_created.id',
        'user_created.first_name',
        'user_created.last_name',
        'user_created.avatar',
        'mentions.id',
        'mentions.user_id.id',
        'mentions.user_id.first_name',
        'mentions.user_id.last_name',
        'files.id',
        'files.directus_files_id.id',
        'files.directus_files_id.filename_download',
        'files.directus_files_id.type',
        'files.directus_files_id.filesize',
        ...(options?.includeReplies ? [
          'replies.id',
          'replies.content',
          'replies.date_created',
          'replies.user_created.id',
          'replies.user_created.first_name',
          'replies.user_created.last_name',
          'replies.user_created.avatar',
        ] : []),
      ],
      filter,
      sort: ['date_created'],
      limit: options?.limit || 100,
    });

    return result as CommentWithRelations[];
  };

  const createComment = async (data: CreateCommentPayload): Promise<Comment> => {
    const comment = await comments.create({
      content: data.content,
      target_collection: data.target_collection,
      target_id: data.target_id,
      parent_id: data.parent_id || null,
      is_edited: false,
      is_resolved: false,
    } as Partial<Comment>);

    if (data.mentioned_user_ids?.length) {
      for (const userId of data.mentioned_user_ids) {
        if (userId !== user.value?.id) {
          await commentMentions.create({
            comment_id: comment.id,
            user_id: userId,
            notified: false,
          } as Partial<CommentMention>);
        }
      }
    }

    return comment;
  };

  const updateComment = async (commentId: string, data: UpdateCommentPayload): Promise<Comment> => {
    return await comments.update(commentId, {
      content: data.content,
      is_edited: true,
      ...(data.is_resolved !== undefined && { is_resolved: data.is_resolved }),
    });
  };

  const deleteComment = async (commentId: string): Promise<boolean> => {
    return await comments.remove(commentId);
  };

  const toggleResolved = async (commentId: string, resolved: boolean): Promise<Comment> => {
    return await comments.update(commentId, { is_resolved: resolved });
  };

  const getCommentCount = async (
    targetCollection: string,
    targetId: string
  ): Promise<CommentCountInfo> => {
    const totalCount = await comments.count({
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
    });

    const unresolvedCount = await comments.count({
      target_collection: { _eq: targetCollection },
      target_id: { _eq: targetId },
      is_resolved: { _eq: false },
    });

    return {
      target_collection: targetCollection,
      target_id: targetId,
      total_count: totalCount,
      unresolved_count: unresolvedCount,
    };
  };

  const canEditComment = (comment: Comment | CommentWithRelations): boolean => {
    if (!user.value?.id) return false;
    const authorId = typeof comment.user_created === 'string'
      ? comment.user_created
      : comment.user_created?.id;
    return authorId === user.value.id;
  };

  return {
    getComments,
    createComment,
    updateComment,
    deleteComment,
    toggleResolved,
    getCommentCount,
    canEditComment,
    COMMENT_UPLOADS_FOLDER,
  };
}
```

### composables/useReactions.ts

```typescript
/**
 * useReactions - Polymorphic reaction management
 */

import type {
  Reaction,
  ReactionWithRelations,
  ReactionCount,
  ReactionSummary,
  ReactionTypeRecord,
  ReactableCollection,
  CreateReactionPayload,
} from '~/types/reactions';

export function useReactions() {
  const reactions = useDirectusItems<Reaction>('reactions');
  const reactionTypes = useDirectusItems<ReactionTypeRecord>('reaction_types');
  const { user } = useDirectusAuth();

  const cachedReactionTypes = useState<ReactionTypeRecord[]>('reaction-types', () => []);

  const getReactionTypes = async (): Promise<ReactionTypeRecord[]> => {
    if (cachedReactionTypes.value.length > 0) return cachedReactionTypes.value;

    const types = await reactionTypes.list({
      filter: { status: { _eq: 'published' } },
      sort: ['sort', 'name'],
      limit: -1,
    });

    cachedReactionTypes.value = types;
    return types;
  };

  const getReactions = async (
    collection: ReactableCollection,
    itemId: string
  ): Promise<ReactionWithRelations[]> => {
    return await reactions.list({
      filter: {
        collection: { _eq: collection },
        item_id: { _eq: itemId },
      },
      fields: [
        '*',
        'user_created.id',
        'user_created.first_name',
        'user_created.last_name',
        'user_created.avatar',
        'reaction_type.*',
      ],
      limit: -1,
    }) as ReactionWithRelations[];
  };

  const getReactionSummary = async (
    collection: ReactableCollection,
    itemId: string
  ): Promise<ReactionSummary> => {
    const allReactions = await getReactions(collection, itemId);
    const currentUserId = user.value?.id;

    const reactionCounts: ReactionCount[] = [];

    for (const reaction of allReactions) {
      let existingCount = reactionCounts.find(
        (r) => r.reaction_type.id === reaction.reaction_type.id
      );

      if (!existingCount) {
        existingCount = {
          reaction_type: reaction.reaction_type,
          count: 0,
          users: [],
          hasReacted: false,
        };
        reactionCounts.push(existingCount);
      }

      existingCount.count++;
      existingCount.users.push(reaction.user_created);
      if (reaction.user_created.id === currentUserId) {
        existingCount.hasReacted = true;
      }
    }

    reactionCounts.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (a.reaction_type.sort ?? 999) - (b.reaction_type.sort ?? 999);
    });

    return {
      item_id: itemId,
      collection,
      reactions: reactionCounts,
      totalCount: allReactions.length,
    };
  };

  const toggleReaction = async (
    payload: CreateReactionPayload
  ): Promise<{ action: 'added' | 'removed' | 'switched'; reaction: ReactionWithRelations | null }> => {
    if (!user.value?.id) throw new Error('Must be logged in to react');

    const existingReactions = await reactions.list({
      filter: {
        collection: { _eq: payload.collection },
        item_id: { _eq: payload.item_id },
        user_created: { _eq: user.value.id },
      },
      fields: ['*', 'reaction_type.*'],
      limit: -1,
    });

    const existingSameType = existingReactions.find(
      (r) => r.reaction_type === payload.reaction_type ||
             (typeof r.reaction_type === 'object' && r.reaction_type.id === payload.reaction_type)
    );

    if (existingSameType) {
      await reactions.remove(existingSameType.id);
      return { action: 'removed', reaction: null };
    }

    const isSwitching = existingReactions.length > 0;
    if (isSwitching) {
      await reactions.remove(existingReactions.map((r) => r.id));
    }

    const created = await reactions.create(
      {
        collection: payload.collection,
        item_id: payload.item_id,
        reaction_type: payload.reaction_type,
      } as Partial<Reaction>,
      {
        fields: [
          '*',
          'user_created.id',
          'user_created.first_name',
          'user_created.last_name',
          'user_created.avatar',
          'reaction_type.*',
        ],
      }
    ) as ReactionWithRelations;

    return { action: isSwitching ? 'switched' : 'added', reaction: created };
  };

  const removeReaction = async (reactionId: number): Promise<boolean> => {
    return await reactions.remove(reactionId);
  };

  function useReactionSummary(collection: ReactableCollection, itemId: Ref<string> | string) {
    const summary = ref<ReactionSummary>({
      item_id: typeof itemId === 'string' ? itemId : itemId.value,
      collection,
      reactions: [],
      totalCount: 0,
    });
    const loading = ref(true);

    const fetch = async () => {
      const id = typeof itemId === 'string' ? itemId : itemId.value;
      summary.value = await getReactionSummary(collection, id);
      loading.value = false;
    };

    onMounted(() => fetch());
    if (typeof itemId !== 'string') watch(itemId, () => fetch());

    return { summary, loading, refresh: fetch };
  }

  function useReactionTypes() {
    const types = ref<ReactionTypeRecord[]>([]);
    const loading = ref(true);

    onMounted(async () => {
      types.value = await getReactionTypes();
      loading.value = false;
    });

    return { types, loading };
  }

  return {
    getReactionTypes,
    getReactions,
    getReactionSummary,
    toggleReaction,
    removeReaction,
    useReactionSummary,
    useReactionTypes,
  };
}
```

### composables/useConfetti.ts

```typescript
/**
 * useConfetti - Task completion celebration
 */

export function useConfetti() {
  const celebrate = async () => {
    if (import.meta.client) {
      const confetti = await import('canvas-confetti');
      confetti.default({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#C4A052', '#2D2A24', '#FFFFFF'],
      });
    }
  };

  return { celebrate };
}
```

---

## Vue Components Structure

```
components/
â”œâ”€â”€ ProjectTimeline/
â”‚   â”œâ”€â”€ Timeline.vue           # Main container
â”‚   â”œâ”€â”€ TimelineCanvas.vue     # SVG canvas
â”‚   â”œâ”€â”€ TimelineLane.vue       # Project line + events
â”‚   â”œâ”€â”€ TimelineEventNode.vue  # Individual event node
â”‚   â”œâ”€â”€ TimelineEventDetail.vue # Slide-out panel
â”‚   â”œâ”€â”€ TimelineControls.vue   # Zoom, focus controls
â”‚   â”œâ”€â”€ TimelineLegend.vue     # Project color legend
â”‚   â”œâ”€â”€ TimelineTaskList.vue   # Task list in detail
â”‚   â””â”€â”€ TimelineFileList.vue   # File list in detail
â”œâ”€â”€ Comment/
â”‚   â”œâ”€â”€ Thread.vue             # Comment thread container
â”‚   â”œâ”€â”€ Item.vue               # Individual comment
â”‚   â””â”€â”€ Editor.vue             # Tiptap comment editor
â”œâ”€â”€ Reaction/
â”‚   â”œâ”€â”€ Display.vue            # Reaction badges display
â”‚   â””â”€â”€ Picker.vue             # Reaction type selector
â””â”€â”€ ui/                        # shadcn-vue components
```

---

## Implementation Checklist

### Phase 1: Directus Setup
- [ ] Create `project_categories` collection
- [ ] Create `projects` collection with relations
- [ ] Create `project_event_categories` collection
- [ ] Create `project_events` collection with relations
- [ ] Create `project_event_files` junction table
- [ ] Create `project_tasks` collection with relations
- [ ] Create `project_task_watchers` junction table
- [ ] Create `comments` collection (polymorphic)
- [ ] Create `comment_mentions` junction table
- [ ] Create `comment_files` junction table
- [ ] Create `reaction_types` collection
- [ ] Seed default reaction types
- [ ] Create `reactions` collection (polymorphic)
- [ ] Set up permissions for each collection

### Phase 2: TypeScript Types
- [ ] Create `types/projects/index.ts`
- [ ] Create `types/comments/index.ts`
- [ ] Create `types/reactions/index.ts`

### Phase 3: Composables
- [ ] `composables/useProjectTimeline.ts`
- [ ] `composables/useTimelineLayout.ts`
- [ ] `composables/useComments.ts`
- [ ] `composables/useReactions.ts`
- [ ] `composables/useConfetti.ts`

### Phase 4: Components
- [ ] Timeline components (Timeline, Canvas, Lane, EventNode, EventDetail, Controls, Legend)
- [ ] Comment components (Thread, Item, Editor)
- [ ] Reaction components (Display, Picker)

### Phase 5: Pages
- [ ] `pages/projects/index.vue`

---

## Key Patterns

1. **Polymorphic Design**: Comments and reactions use `target_collection` + `target_id` (or `collection` + `item_id`) to attach to any item.

2. **Single Reaction Per User**: One reaction per user per item. Switching removes the old reaction.

3. **Nested Projects**: Projects can have parent projects via `parent_id`, and can spawn from events via `parent_event_id`.

4. **Event-Centric Tasks**: Tasks belong to events, not projects directly.

5. **SVG Canvas**: Timeline uses SVG for crisp rendering at any zoom level.

6. **GSAP Animations**: Use GSAP for entrance animations.

---

## Quick Start

```bash
# Install dependencies
pnpm add @directus/sdk gsap canvas-confetti isomorphic-dompurify lucide-vue-next
pnpm add @tiptap/vue-3 @tiptap/starter-kit @tiptap/pm @tiptap/extension-link @tiptap/extension-image @tiptap/extension-mention @tiptap/extension-character-count @tiptap/extension-placeholder @tiptap/suggestion
pnpm add @vee-validate/nuxt @vee-validate/zod zod vee-validate
pnpm add shadcn-nuxt reka-ui class-variance-authority clsx tailwind-merge
```

---

*Adapt collection names, colors, and styling to match your project's requirements.*