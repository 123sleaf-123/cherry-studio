import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache, useMutation, usePaginatedQuery } from '@data/hooks/useDataApi'
import type { AgentSessionEntity, CreateSessionForm } from '@renderer/types'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import type { AgentSessionDetail } from '@shared/data/types/agent'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { useSessionChanged } from './useSessionChanged'

const PAGE_LIMIT = 20

export const useSessions = (agentId: string | null) => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const listPath = `/agents/${agentId}/sessions` as any

  const {
    items: _sessions,
    total,
    hasNext,
    isLoading,
    isRefreshing,
    error,
    nextPage
  } = usePaginatedQuery(listPath, {
    limit: PAGE_LIMIT,
    enabled: !!agentId
  })
  const sessions = _sessions as AgentSessionEntity[]

  const { trigger: triggerCreate } = useMutation('POST', listPath, {
    refresh: agentId ? [listPath] : []
  })

  const { trigger: triggerReorder } = useMutation('PUT', `/agents/${agentId}/sessions/order` as any, {
    refresh: agentId ? [listPath] : []
  })

  const reload = useCallback(async () => {
    await invalidate(agentId ? listPath : undefined)
  }, [agentId, invalidate, listPath])

  // Auto-refresh when IM channel creates/updates sessions
  useSessionChanged(agentId ?? undefined, () => void reload())

  const createSession = useCallback(
    async (form: CreateSessionForm): Promise<AgentSessionDetail | null> => {
      if (!agentId) return null
      try {
        const result = await triggerCreate({ body: form as any })
        return result as AgentSessionDetail
      } catch (error) {
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.session.create.error.failed')))
        return null
      }
    },
    [agentId, triggerCreate, t]
  )

  const deleteSession = useCallback(
    async (id: string): Promise<boolean> => {
      if (!agentId) return false
      try {
        await dataApiService.delete(`/agents/${agentId}/sessions/${id}` as any)
        await invalidate(listPath)
        return true
      } catch (error) {
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.session.delete.error.failed')))
        return false
      }
    },
    [agentId, invalidate, listPath, t]
  )

  const reorderSessions = useCallback(
    async (reorderedList: AgentSessionEntity[]) => {
      if (!agentId) return
      const orderedIds = reorderedList.map((s) => s.id)
      try {
        await triggerReorder({ body: { orderedIds } })
      } catch (error) {
        await invalidate(listPath)
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.session.reorder.error.failed')))
      }
    },
    [agentId, triggerReorder, invalidate, listPath, t]
  )

  return {
    sessions,
    total,
    // Infinite-scroll compat aliases consumed by Sessions.tsx
    hasMore: hasNext,
    loadMore: nextPage,
    isLoadingMore: isLoading,
    isValidating: isRefreshing,
    reload,
    error,
    isLoading,
    createSession,
    deleteSession,
    reorderSessions
  }
}
