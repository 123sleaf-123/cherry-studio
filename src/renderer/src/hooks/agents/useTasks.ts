import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache, usePaginatedQuery } from '@data/hooks/useDataApi'
import type { CreateTaskRequest, ListTaskLogsResponse, ScheduledTaskEntity, UpdateTaskRequest } from '@renderer/types'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR, { mutate } from 'swr'

import { useAgentHttpClient } from './useAgentHttpClient'

export const taskLogsKey = (taskId: string) => `/v1/tasks/${taskId}/logs`

export const useTasks = () => {
  const { items: tasks, total, page, isLoading, error } = usePaginatedQuery('/tasks', { limit: 200 })

  return {
    tasks: tasks as ScheduledTaskEntity[],
    total,
    page,
    error,
    isLoading
  }
}

export const useCreateTask = () => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const createTask = useCallback(
    async (agentId: string, req: CreateTaskRequest): Promise<ScheduledTaskEntity | undefined> => {
      try {
        const result = await dataApiService.post(`/agents/${agentId}/tasks`, { body: req })
        await invalidate('/tasks')
        window.toast.success({ key: 'create-task', title: t('common.create_success') })
        return result as ScheduledTaskEntity
      } catch (error) {
        window.toast.error(
          formatErrorMessageWithPrefix(error, t('agent.cherryClaw.tasks.error.createFailed', 'Failed to create task'))
        )
        return undefined
      }
    },
    [invalidate, t]
  )

  return { createTask }
}

export const useUpdateTask = () => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const updateTask = useCallback(
    async (agentId: string, taskId: string, updates: UpdateTaskRequest): Promise<ScheduledTaskEntity | undefined> => {
      try {
        const result = await dataApiService.patch(`/agents/${agentId}/tasks/${taskId}`, { body: updates })
        await invalidate('/tasks')
        window.toast.success({ key: 'update-task', title: t('common.update_success') })
        return result as ScheduledTaskEntity
      } catch (error) {
        window.toast.error(
          formatErrorMessageWithPrefix(error, t('agent.cherryClaw.tasks.error.updateFailed', 'Failed to update task'))
        )
        return undefined
      }
    },
    [invalidate, t]
  )

  return { updateTask }
}

export const useRunTask = () => {
  const { t } = useTranslation()
  const client = useAgentHttpClient()

  const runTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      if (!client) {
        window.toast.error(t('agent.cherryClaw.tasks.error.runFailed', 'Failed to run task'))
        return false
      }
      try {
        await client.runTask(taskId)
        window.toast.success({ key: 'run-task', title: t('agent.cherryClaw.tasks.runTriggered') })
        // Refresh task logs cache so the logs list updates
        void mutate(taskLogsKey(taskId))
        // Task runs asynchronously — refresh again after a delay to capture completion
        setTimeout(() => {
          void mutate(taskLogsKey(taskId))
        }, 1000)
        return true
      } catch (error) {
        window.toast.error(
          formatErrorMessageWithPrefix(error, t('agent.cherryClaw.tasks.error.runFailed', 'Failed to run task'))
        )
        return false
      }
    },
    [client, t]
  )

  return { runTask }
}

export const useDeleteTask = () => {
  const { t } = useTranslation()
  const invalidate = useInvalidateCache()

  const deleteTask = useCallback(
    async (agentId: string, taskId: string): Promise<boolean> => {
      try {
        await dataApiService.delete(`/agents/${agentId}/tasks/${taskId}`)
        await invalidate('/tasks')
        window.toast.success({ key: 'delete-task', title: t('common.delete_success') })
        return true
      } catch (error) {
        window.toast.error(
          formatErrorMessageWithPrefix(error, t('agent.cherryClaw.tasks.error.deleteFailed', 'Failed to delete task'))
        )
        return false
      }
    },
    [invalidate, t]
  )

  return { deleteTask }
}

export const useTaskLogs = (taskId: string | null) => {
  const client = useAgentHttpClient()

  const key = taskId && client ? taskLogsKey(taskId) : null

  const fetcher = useCallback(async () => {
    if (!taskId || !client) throw new Error('Task ID or client unavailable')
    return client.getTaskLogs(taskId, { limit: 50 })
  }, [client, taskId])

  const { data, error, isLoading } = useSWR<ListTaskLogsResponse>(key, fetcher)

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    error,
    isLoading
  }
}
