import { useMultiplePreferences } from '@data/hooks/usePreference'
import { preferenceService } from '@data/PreferenceService'
import { AgentApiClient } from '@renderer/api/agent'
import type { ApiModel, ApiModelsFilter } from '@renderer/types'
import { merge } from 'lodash'
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

export const useApiModels = (filter?: ApiModelsFilter) => {
  const client = useAgentHttpClient()
  // const defaultFilter = { limit: -1 } satisfies ApiModelsFilter
  const defaultFilter = {} satisfies ApiModelsFilter
  const finalFilter = merge(filter, defaultFilter)
  const path = client ? client.getModelsPath(finalFilter) : null
  const fetcher = useCallback(async () => {
    if (!client) throw new Error('Agent API client unavailable')
    const limit = finalFilter.limit || 100
    let offset = finalFilter.offset || 0
    const allModels: ApiModel[] = []
    let total = Infinity

    while (offset < total) {
      const pageFilter = { ...finalFilter, limit, offset }
      const res = await client.getModels(pageFilter)
      allModels.push(...(res.data || []))
      total = res.total ?? 0
      offset += limit
    }
    return { data: allModels, total }
  }, [client, finalFilter])
  const { data, error, isLoading } = useSWR(path, fetcher)
  return {
    models: data?.data ?? [],
    error,
    isLoading
  }
}
