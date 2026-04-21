// Task CRUD (list / create / get / update / delete) is served by DataApi via IPC.
// Only the imperative run-trigger and log-fetch endpoints remain here until they
// are migrated to IPC handlers.

import { loggerService } from '@logger'
import { schedulerService } from '@main/services/agents/services/SchedulerService'
import { taskService } from '@main/services/agents/services/TaskService'
import type { ListTaskLogsResponse } from '@types'
import express, { type Request, type Response, type Router } from 'express'

const logger = loggerService.withContext('ApiServerTasksRoute')

const tasksRouter: Router = express.Router()

// POST /v1/tasks/:taskId/run — trigger a task run immediately
tasksRouter.post('/:taskId/run', async (req: Request, res: Response) => {
  const { taskId } = req.params
  try {
    const task = await taskService.getTaskById(taskId)
    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found', code: 'task_not_found' }
      })
    }

    logger.debug('Manually running task', { taskId, agentId: task.agent_id })
    await schedulerService.runTaskNow(task.agent_id, taskId)
    logger.info('Task triggered manually', { taskId })
    return res.json({ status: 'triggered' })
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : error.message?.includes('already running') ? 409 : 500
    logger.error('Error running task', { error, taskId })
    return res.status(status).json({
      error: {
        message: `Failed to run task: ${error.message}`,
        type: status === 409 ? 'conflict' : status === 404 ? 'not_found' : 'internal_error',
        code: 'task_run_failed'
      }
    })
  }
})

// GET /v1/tasks/:taskId/logs — fetch run logs for a task
// TODO: migrate to DataApi (GET /agents/:id/tasks/:tid/logs) — logs are SQLite-backed.
tasksRouter.get('/:taskId/logs', async (req: Request, res: Response) => {
  const { taskId } = req.params
  try {
    const task = await taskService.getTaskById(taskId)
    if (!task) {
      return res.status(404).json({
        error: { message: 'Task not found', type: 'not_found', code: 'task_not_found' }
      })
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0

    logger.debug('Getting task logs', { taskId, limit, offset })
    const result = await taskService.getTaskLogs(taskId, { limit, offset })

    return res.json({
      data: result.logs,
      total: result.total,
      limit,
      offset
    } satisfies ListTaskLogsResponse)
  } catch (error: any) {
    logger.error('Error getting task logs', { error, taskId })
    return res.status(500).json({
      error: { message: 'Failed to get task logs', type: 'internal_error', code: 'task_logs_failed' }
    })
  }
})

export { tasksRouter }
