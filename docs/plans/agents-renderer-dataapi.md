# Plan: Migrate Renderer Agent Hooks from HTTP to DataApi

## Context

PR `feat/agents-data-api` wired DataApi handlers for the agents domain. The renderer
currently calls the Express `apiServer` via `AgentApiClient` (HTTP). This plan replaces
all those HTTP calls with `useQuery`/`useMutation` from `@data/hooks/useDataApi`.

**Not in scope for this PR:**
- `AgentMessageDataSource` IPC calls (`AgentMessage_PersistExchange`, `AgentMessage_GetHistory`)
  — these are intentionally deferred to a follow-up that redesigns the message persistence layer.
- `useChannels` / `useModels` — channels have no DataApi schema yet; models are a separate
  non-agent endpoint. Both stay on HTTP.

---

## Phase 1 — Extend DataApi Schemas + Handlers

Three missing endpoints must be added before hooks can be migrated:

### 1a. `/agents/reorder` PATCH
**Schema** (`packages/shared/data/api/schemas/agents.ts`):
```ts
'/agents/reorder': {
  PATCH: {
    body: { orderedIds: string[] }
    response: void
  }
}
```
**Handler** (`src/main/data/api/handlers/agents.ts`): delegate to `agentService.reorderAgents(body.orderedIds)`.

### 1b. `/agents/:id/sessions/reorder` PATCH
**Schema**:
```ts
'/agents/:id/sessions/reorder': {
  PATCH: {
    params: { id: string }
    body: { orderedIds: string[] }
    response: void
  }
}
```
**Handler**: delegate to `sessionService.reorderSessions(params.id, body.orderedIds)`.

### 1c. `/tasks` GET (global task list)
`useTasks` lists ALL tasks across all agents (used in TasksSettings). The existing DataApi
only exposes `/agents/:id/tasks`. Add a top-level endpoint:
```ts
'/tasks': {
  GET: {
    query: { limit?: number; offset?: number }
    response: ListTasksResponse
  }
}
```
**Handler**: delegate to `taskService.listAllTasks(query)`.

After Phase 1: run `pnpm lint && pnpm test` to confirm no regressions.

---

## Phase 2 — Migrate Hooks (one file per commit)

Commit order chosen so each change is independently reviewable and testable.

### 2.1 `useAgent.ts` — single agent fetch
Replace `useSWR` + `useAgentClient` with:
```ts
const { data: agent, isLoading, error, refetch } = useQuery('/agents/:id', {
  params: { id: id! },
  enabled: !!id
})
```
Remove: `useApiServer`, `useAgentClient`, `client` guard, manual fetcher.

### 2.2 `useAgents.ts` — agent list + mutations
```ts
const { data, isLoading, error, mutate } = useQuery('/agents')
const agents = data?.data ?? []

const { trigger: createTrigger } = useMutation('POST', '/agents', { refresh: ['/agents'] })
const { trigger: deleteTrigger } = useMutation('DELETE', '/agents/:id', { refresh: ['/agents'] })
const { trigger: reorderTrigger } = useMutation('PATCH', '/agents/reorder', { refresh: ['/agents'] })
```
`addAgent`, `deleteAgent`, `reorderAgents`, `getAgent` rewritten as `useCallback` wrappers
around the triggers.

Remove: `useApiServer`, `useAgentClient`, SWR key derivation from `client.agentPaths.base`.

### 2.3 `useUpdateAgent.ts` — agent update mutation
```ts
const { trigger } = useMutation('PATCH', `/agents/${id}`, { refresh: ['/agents', `/agents/${id}`] })
```
The active-session revalidation logic stays unchanged, but uses the DataApi cache key
(`/agents/:id/sessions/:sid`) instead of the HTTP URL key.

### 2.4 `useSessions.ts` — session list + mutations
Infinite pagination: use `useInfiniteQuery('/agents/:id/sessions', ...)` from `useDataApi`.
Mutations:
```ts
useMutation('POST', '/agents/:id/sessions', { refresh: ['/agents/:id/sessions'] })
useMutation('DELETE', '/agents/:id/sessions/:sid', { refresh: ['/agents/:id/sessions'] })
useMutation('PATCH', '/agents/:id/sessions/reorder', { refresh: ['/agents/:id/sessions'] })
```
The `getSession` callback for explicit refresh remains a `refetch` call.

### 2.5 `useSession.ts` — single session fetch
```ts
const { data: session, isLoading, error, mutate } = useQuery('/agents/:id/sessions/:sid', {
  params: { id: agentId!, sid: sessionId! },
  enabled: !!agentId && !!sessionId
})
```

### 2.6 `useUpdateSession.ts` — session update mutation
```ts
const { trigger } = useMutation('PATCH', `/agents/${agentId}/sessions/${sessionId}`, {
  refresh: [`/agents/${agentId}/sessions`]
})
```
Optimistic update logic is preserved but uses DataApi cache keys instead of HTTP URL keys.

### 2.7 `useAgentSessionInitializer.ts` — session init on agent activation
Replace `client.listSessions(agentId)` with a direct `dataApiService.request(...)` call
(non-hook context, used inside `useEffect`). Alternatively, use `prefetch` from `useDataApi`.

### 2.8 `useTasks.ts` — task list + CRUD mutations
```ts
// Global list (TasksSettings)
const { data } = useQuery('/tasks', { query: { limit: 200 } })

// Per-agent mutations
useMutation('POST', `/agents/${agentId}/tasks`, { refresh: ['/tasks'] })
useMutation('PATCH', `/agents/${agentId}/tasks/${taskId}`, { refresh: ['/tasks'] })
useMutation('DELETE', `/agents/${agentId}/tasks/${taskId}`, { refresh: ['/tasks'] })
```

### 2.9 `pages/settings/TasksSettings.tsx` — inline task client calls
Replace the `useAgentClient()` call at line 763 with `useTasks` / `useUpdateTask` hooks
already migrated in 2.8.

### 2.10 `pages/agents/components/Sessions.tsx` — inline session delete
Replace `useAgentClient()` + `client.deleteSession()` with the `deleteSession` returned
from the migrated `useSessions` hook.

### 2.11 `store/thunk/messageThunk.ts` — three `createAgentApiClient` calls
| Line | Current call | Replacement |
|------|-------------|-------------|
| ~227 | `client.createSession(agentId, ...)` | `dataApiService.request('POST', '/agents/:id/sessions', ...)` |
| ~773 | `client.createSession(agentId, ...)` | same |
| ~980 | `client.getAgent(activeAgentId)` | `dataApiService.request('GET', '/agents/:id', ...)` |
All three are non-hook imperative calls inside thunk actions; use `dataApiService` directly.

---

## Phase 3 — Cleanup

After all migrations pass `pnpm lint && pnpm test`:

1. **Delete** `src/renderer/src/api/agent.ts` — `AgentApiClient` class, all HTTP methods,
   `DEFAULT_SESSION_PAGE_SIZE` (move to constants if still needed).
2. **Delete** `src/renderer/src/hooks/agents/useAgentClient.ts` — `useAgentClient`,
   `requireAgentClient`, `AGENT_API_CLIENT_UNAVAILABLE_ERROR`.
3. **Keep** `useChannels.ts` — channels are not in the DataApi schema; stays on HTTP.
4. **Keep** `useModels.ts` — models endpoint is unrelated to agents DataApi.
5. **Remove** `useApiServer` guards from any remaining hook that had them (e.g. the
   `apiServerRunning && apiServerConfig.apiKey` checks that were only needed because
   the HTTP server required auth).

---

## Key Decisions

| Question | Decision |
|----------|----------|
| `AgentMessageDataSource` IPC calls | Keep as-is; deferred to message-persistence PR |
| `useChannels` | Keep on HTTP; no DataApi schema for channels |
| `useModels` | Keep on HTTP; out of agents domain |
| Reorder endpoints | Add to DataApi (Phase 1) — not keep on HTTP |
| Global `/tasks` endpoint | Add to DataApi (Phase 1) — required by TasksSettings |
| `apiServerRunning` guards | Remove after migration — DataApi doesn't need auth guard |

---

## Acceptance Criteria

- `pnpm lint && pnpm test` green on each commit.
- `AgentApiClient` and `useAgentClient` are deleted.
- No renderer file imports from `@renderer/api/agent` except `useChannels.ts` and `useModels.ts`.
- `useApiServer` is no longer referenced in any agent hook.
- The `feat/agents-renderer-dataapi` branch has no direct HTTP calls to `apiServer` for
  agents, sessions, tasks, or skills.
