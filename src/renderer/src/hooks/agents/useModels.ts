// TODO: migrate to a regular IPC handler and remove HTTP dependency.
// GET /v1/models queries live AI providers (OpenAI, Anthropic, etc.) — not SQLite-backed,
// so DataApi does not apply. Use ipcMain.handle('agent:list-models', ...) instead.
import type { ApiModel, ApiModelsFilter } from '@renderer/types'
import { merge } from 'lodash'
import { useCallback } from 'react'
import useSWR from 'swr'

import { useAgentHttpClient } from './useAgentHttpClient'

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
