import { cacheService } from '@data/CacheService'
import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache, useMutation, useQuery } from '@data/hooks/useDataApi'
import { useCache } from '@renderer/data/hooks/useCache'
import type { AddAgentForm, CreateAgentResponse, GetAgentResponse } from '@renderer/types'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

type Result<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: Error
    }

export const useAgents = () => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const { data, isLoading, error, mutate } = useQuery('/agents')
  // Cast to renderer's GetAgentResponse which has the typed configuration schema
  const agents = (data?.items ?? []) as GetAgentResponse[]

  const [activeAgentId] = useCache('agent.active_id')

  const { trigger: createTrigger } = useMutation('POST', '/agents', { refresh: ['/agents'] })

  const { trigger: reorderTrigger } = useMutation('PUT', '/agents/order', { refresh: ['/agents'] })

  const addAgent = useCallback(
    async (form: AddAgentForm): Promise<Result<CreateAgentResponse>> => {
      try {
        const result = await createTrigger({ body: form as any })
        window.toast.success(t('common.add_success'))
        return { success: true, data: result as unknown as CreateAgentResponse }
      } catch (error) {
        const errorMessage = formatErrorMessageWithPrefix(error, t('agent.add.error.failed'))
        window.toast.error(errorMessage)
        if (error instanceof Error) {
          return { success: false, error }
        } else {
          return {
            success: false,
            error: new Error(formatErrorMessageWithPrefix(error, t('agent.add.error.failed')))
          }
        }
      }
    },
    [createTrigger, t]
  )

  const deleteAgent = useCallback(
    async (id: string) => {
      try {
        await dataApiService.delete(`/agents/${id}`)
        const currentMap = cacheService.get('agent.session.active_id_map') ?? {}
        cacheService.set('agent.session.active_id_map', { ...currentMap, [id]: null })
        if (activeAgentId === id) {
          const newId = agents.filter((a) => a.id !== id).find(() => true)?.id
          cacheService.set('agent.active_id', newId ?? null)
        }
        await invalidate('/agents')
        window.toast.success(t('common.delete_success'))
      } catch (error) {
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.delete.error.failed')))
      }
    },
    [activeAgentId, agents, invalidate, t]
  )

  const getAgent = useCallback(
    (id: string): GetAgentResponse | undefined => {
      return agents.find((a) => a.id === id)
    },
    [agents]
  )

  const reorderAgents = useCallback(
    async (reorderedList: GetAgentResponse[]) => {
      const orderedIds = reorderedList.map((a) => a.id)
      // Optimistic update — cast reorderedList since GetAgentResponse is compatible with AgentDetail at runtime
      void mutate(data ? { ...data, items: reorderedList as any } : undefined, { revalidate: false })
      try {
        await reorderTrigger({ body: { orderedIds } })
      } catch (error) {
        void mutate()
        window.toast.error(formatErrorMessageWithPrefix(error, t('agent.reorder.error.failed')))
      }
    },
    [data, mutate, reorderTrigger, t]
  )

  return {
    agents,
    error,
    isLoading,
    addAgent,
    deleteAgent,
    getAgent,
    reorderAgents
  }
}
