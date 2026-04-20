import { useMultiplePreferences } from '@data/hooks/usePreference'
import { preferenceService } from '@data/PreferenceService'
import { AgentApiClient } from '@renderer/api/agent'
import { useCallback, useMemo } from 'react'
import useSWR from 'swr'

const AGENT_API_PREFERENCE_KEYS = {
  host: 'feature.csaas.host',
  port: 'feature.csaas.port',
  apiKey: 'feature.csaas.api_key'
} as const

const useAgentHttpClient = () => {
  const { host, port, apiKey } = useMultiplePreferences(AGENT_API_PREFERENCE_KEYS)[0]

  return useMemo(() => {
    const isConfigLoaded = Object.values(AGENT_API_PREFERENCE_KEYS).every((key) => preferenceService.isCached(key))

    if (!isConfigLoaded || !apiKey) {
      return null
    }

    return new AgentApiClient({
      baseURL: `http://${host}:${port}`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Api-Key': apiKey
      }
    })
  }, [host, port, apiKey])
}

export const useChannels = (type?: string) => {
  const client = useAgentHttpClient()

  const key = client ? `${client.channelPaths.base}?type=${type ?? ''}` : null

  const fetcher = useCallback(async () => {
    if (!client) throw new Error('Agent API client unavailable')
    const result = await client.listChannels(type ? { type } : undefined)
    return result.data
  }, [client, type])

  const { data, error, isLoading, mutate } = useSWR(key, fetcher)

  const createChannel = useCallback(
    async (channelData: Record<string, unknown>) => {
      if (!client) throw new Error('Agent API client unavailable')
      const result = await client.createChannel(channelData)
      void mutate((prev) => [...(prev ?? []), result], false)
      return result
    },
    [client, mutate]
  )

  const updateChannel = useCallback(
    async (id: string, updates: Record<string, unknown>) => {
      if (!client) throw new Error('Agent API client unavailable')
      const result = await client.updateChannel(id, updates)
      void mutate((prev) => prev?.map((ch) => (ch.id === id ? result : ch)) ?? [], false)
      return result
    },
    [client, mutate]
  )

  const deleteChannel = useCallback(
    async (id: string) => {
      if (!client) throw new Error('Agent API client unavailable')
      await client.deleteChannel(id)
      void mutate((prev) => prev?.filter((ch) => ch.id !== id) ?? [], false)
    },
    [client, mutate]
  )

  return {
    channels: data,
    error,
    isLoading,
    mutate,
    createChannel,
    updateChannel,
    deleteChannel
  }
}
