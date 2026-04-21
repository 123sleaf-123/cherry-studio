import { useQuery } from '@data/hooks/useDataApi'

import { useUpdateSession } from './useUpdateSession'

export const useSession = (agentId: string | null, sessionId: string | null) => {
  const { updateSession } = useUpdateSession(agentId)

  const {
    data: session,
    isLoading,
    error,
    mutate
    // Two-variable path causes TypeScript to union-match /agents/:id and /agents/:id/sessions/:sid — as any is intentional.
  } = useQuery(`/agents/${agentId!}/sessions/${sessionId!}` as any, { enabled: !!agentId && !!sessionId })

  return {
    session,
    error,
    isLoading,
    updateSession,
    mutate
  }
}
