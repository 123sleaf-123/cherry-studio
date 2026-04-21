import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache, useQuery } from '@data/hooks/useDataApi'
import { useCallback } from 'react'

export const useChannels = (type?: string) => {
  const invalidate = useInvalidateCache()

  const { data, isLoading, error, mutate } = useQuery('/channels', {
    query: type ? { type } : undefined
  })

  const channels = data?.items ?? []

  const createChannel = useCallback(
    async (channelData: Record<string, unknown>) => {
      const result = await dataApiService.post('/channels', {
        body: {
          type: channelData.type as string,
          name: channelData.name as string,
          config: (channelData.config ?? {}) as Record<string, unknown>,
          isActive: ((channelData.is_active ?? channelData.isActive) as boolean | undefined) ?? true,
          agentId: (channelData.agent_id ?? channelData.agentId) as string | undefined,
          permissionMode: (channelData.permission_mode ?? channelData.permissionMode) as string | undefined
        }
      })
      await invalidate('/channels')
      return result
    },
    [invalidate]
  )

  const updateChannel = useCallback(
    async (id: string, updates: Record<string, unknown>) => {
      // Single-variable path: interpolate ID directly, cast to satisfy ConcreteApiPaths constraint
      const result = await dataApiService.patch(`/channels/${id}` as '/channels/:id', {
        body: {
          name: updates.name as string | undefined,
          config: updates.config as Record<string, unknown> | undefined,
          isActive: (updates.is_active ?? updates.isActive) as boolean | undefined,
          agentId: (updates.agent_id ?? updates.agentId) as string | null | undefined,
          permissionMode: (updates.permission_mode ?? updates.permissionMode) as string | null | undefined
        }
      })
      await invalidate('/channels')
      return result
    },
    [invalidate]
  )

  const deleteChannel = useCallback(
    async (id: string) => {
      // Single-variable path: interpolate ID directly, cast to satisfy ConcreteApiPaths constraint
      await dataApiService.delete(`/channels/${id}` as '/channels/:id')
      await invalidate('/channels')
    },
    [invalidate]
  )

  return {
    channels,
    error,
    isLoading,
    mutate,
    createChannel,
    updateChannel,
    deleteChannel
  }
}
