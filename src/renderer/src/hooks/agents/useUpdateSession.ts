import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache } from '@data/hooks/useDataApi'
import type {
  AgentSessionEntity,
  UpdateAgentBaseOptions,
  UpdateAgentSessionFunction,
  UpdateSessionForm
} from '@renderer/types/agent'
import { getErrorMessage } from '@renderer/utils/error'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

export const useUpdateSession = (agentId: string | null) => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const updateSession: UpdateAgentSessionFunction = useCallback(
    async (form: UpdateSessionForm, options?: UpdateAgentBaseOptions): Promise<AgentSessionEntity | undefined> => {
      if (!agentId) return
      const sessionId = form.id
      const listPath = `/agents/${agentId}/sessions`
      const itemPath = `/agents/${agentId}/sessions/${sessionId}`

      try {
        const result = await dataApiService.patch(itemPath as any, { body: form as any })
        // Refresh the list and the individual session caches
        await Promise.all([invalidate(listPath), invalidate(itemPath)])
        if (options?.showSuccessToast ?? true) {
          window.toast.success(t('common.update_success'))
        }
        return result as AgentSessionEntity
      } catch (error) {
        // Revalidate to restore correct state
        await Promise.all([invalidate(listPath), invalidate(itemPath)])
        window.toast.error({ title: t('agent.session.update.error.failed'), description: getErrorMessage(error) })
        return undefined
      }
    },
    [agentId, invalidate, t]
  )

  const updateModel = useCallback(
    async (sessionId: string, modelId: string, options?: UpdateAgentBaseOptions) => {
      if (!agentId) return
      return updateSession(
        {
          id: sessionId,
          model: modelId
        },
        options
      )
    },
    [agentId, updateSession]
  )

  return { updateSession, updateModel }
}
