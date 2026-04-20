import { dataApiService } from '@data/DataApiService'
import { useInvalidateCache } from '@data/hooks/useDataApi'
import { usePaginatedQuery } from '@data/hooks/useDataApi'
import type { CreateTaskRequest, ListTaskLogsResponse, ScheduledTaskEntity, UpdateTaskRequest } from '@renderer/types'
import { formatErrorMessageWithPrefix } from '@renderer/utils/error'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import useSWR from 'swr'

import { useApiServer } from '../useApiServer'
import { requireAgentClient, useAgentClient } from './useAgentClient'

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
  const client = useAgentClient()

  const runTask = useCallback(
    async (taskId: string): Promise<boolean> => {
      try {
        await requireAgentClient(client).runTask(taskId)
        window.toast.success({ key: 'run-task', title: t('agent.cherryClaw.tasks.runTriggered') })
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
  const client = useAgentClient()
  const { apiServerRunning } = useApiServer()

  const key = apiServerRunning && taskId && client ? client.taskPaths.logs(taskId) : null

  const fetcher = useCallback(async () => {
    if (!taskId) throw new Error('Task ID required')
    return requireAgentClient(client).getTaskLogs(taskId, { limit: 50 })
  }, [client, taskId])

  const { data, error, isLoading } = useSWR<ListTaskLogsResponse>(key, fetcher)

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    error,
    isLoading
  }
}
