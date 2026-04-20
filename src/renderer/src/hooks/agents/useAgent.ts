import { useQuery } from '@data/hooks/useDataApi'
import type { GetAgentResponse } from '@renderer/types'

export const useAgent = (id?: string | null) => {
  const { data, isLoading, error, refetch: revalidate } = useQuery(`/agents/${id!}`, { enabled: !!id })

  return {
    agent: data as GetAgentResponse | undefined,
    isLoading,
    error: error ?? null,
    revalidate
  }
}
