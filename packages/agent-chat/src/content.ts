import {
  createContentItem,
  deleteContentItem,
  getContentStats,
  listContentItems,
  markContentItemPublishing,
  queueContentItem,
  reorderContentQueue,
  unqueueContentItem,
  updateContentItem,
  type ContentItem,
  type ContentStats,
  type CreateContentItemInput,
  type UpdateContentItemInput,
} from "@me3-core/plugin-social-publishing";

type D1StatementLike = {
  bind(...values: unknown[]): {
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results?: T[] }>;
    run(): Promise<unknown>;
  };
};

type D1Env = {
  DB: {
    prepare(sql: string): D1StatementLike;
  };
};

export type AgentContentItem = ContentItem;
export type AgentContentStats = ContentStats;
export type AgentContentCreateInput = CreateContentItemInput;
export type AgentContentUpdateInput = UpdateContentItemInput;

export async function listAgentContentItems(
  env: D1Env,
  userId: string,
  siteId: unknown,
  status?: unknown,
): Promise<AgentContentItem[]> {
  return listContentItems(env, userId, siteId, status);
}

export async function getAgentContentStats(
  env: D1Env,
  userId: string,
  siteId: unknown,
): Promise<AgentContentStats | null> {
  return getContentStats(env, userId, siteId);
}

export async function createAgentContentItem(
  env: D1Env,
  userId: string,
  input: AgentContentCreateInput,
): Promise<AgentContentItem> {
  return createContentItem(env, userId, input);
}

export async function updateAgentContentItem(
  env: D1Env,
  userId: string,
  id: unknown,
  input: AgentContentUpdateInput,
): Promise<AgentContentItem | null> {
  return updateContentItem(env, userId, id, input);
}

export async function deleteAgentContentItem(
  env: D1Env,
  userId: string,
  id: unknown,
): Promise<boolean> {
  return deleteContentItem(env, userId, id);
}

export async function queueAgentContentItem(
  env: D1Env,
  userId: string,
  id: unknown,
): Promise<AgentContentItem | null> {
  return queueContentItem(env, userId, id);
}

export async function unqueueAgentContentItem(
  env: D1Env,
  userId: string,
  id: unknown,
): Promise<AgentContentItem | null> {
  return unqueueContentItem(env, userId, id);
}

export async function reorderAgentContentQueue(
  env: D1Env,
  userId: string,
  siteId: unknown,
  itemIds: unknown,
): Promise<AgentContentItem[]> {
  return reorderContentQueue(env, userId, siteId, itemIds);
}

export async function markAgentContentItemPublishing(
  env: D1Env,
  userId: string,
  id: unknown,
): Promise<AgentContentItem | null> {
  return markContentItemPublishing(env, userId, id);
}
