import { cacheService } from '@data/CacheService'
import { dataApiService } from '@data/DataApiService'
import type { AgentEntity, UpdateAgentForm } from '@renderer/types'
import type { UpdateAgentBaseOptions, UpdateAgentFunction } from '@renderer/types/agent'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { mutate } from 'swr'

export const useUpdateAgent = () => {
  const { t } = useTranslation()

  const updateAgent: UpdateAgentFunction = useCallback(
    async (form: UpdateAgentForm, options?: UpdateAgentBaseOptions): Promise<AgentEntity | undefined> => {
      try {
        const { id, ...body } = form
        const result = await dataApiService.patch(`/agents/${id}`, { body })
        // Invalidate list and item caches
        void mutate((key) => Array.isArray(key) && (key[0] === '/agents' || key[0] === `/agents/${id}`))
        if (options?.showSuccessToast ?? true) {
          window.toast.success({ key: 'update-agent', title: t('common.update_success') })
        }

        // Backend syncs agent settings to all sessions (skipping user-customized fields).
        // Revalidate the active session's SWR cache so the UI picks up changes immediately.
        // Other sessions refresh via SWR stale-while-revalidate when navigated to.
        // Using cacheService.get() instead of useCache to avoid adding reactive deps to useCallback.
        const activeSessionIdMap = cacheService.get('agent.session.active_id_map') ?? {}
        const activeSessionId = activeSessionIdMap?.[id]
        if (activeSessionId) {
          void mutate((key) => Array.isArray(key) && key[0] === `/agents/${id}/sessions/${activeSessionId}`)
        }

        return result as unknown as AgentEntity
      } catch (error) {
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.update.error.failed')))
        return undefined
      }
    },
    [t]
  )

  const updateModel = useCallback(
    async (agentId: string, modelId: string, options?: UpdateAgentBaseOptions) => {
      void updateAgent({ id: agentId, model: modelId }, options)
    },
    [updateAgent]
  )

  return { updateAgent, updateModel }
}
