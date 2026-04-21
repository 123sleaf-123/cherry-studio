/**
 * Channels domain API Handlers
 *
 * Thin routing layer between the DataApi transport and ChannelService.
 * Service layer: src/main/services/agents/services/ChannelService.ts
 */

import type { ChannelConfig } from '@main/services/agents/services/channels/channelConfig'
import { channelService } from '@main/services/agents/services/ChannelService'
import { DataApiErrorFactory } from '@shared/data/api'
import type { ApiHandler, ApiMethods } from '@shared/data/api/apiTypes'
import type { ChannelSchemas } from '@shared/data/api/schemas/channels'

type ChannelHandler<Path extends keyof ChannelSchemas, Method extends ApiMethods<Path>> = ApiHandler<Path, Method>

export const channelHandlers: {
  [Path in keyof ChannelSchemas]: {
    [Method in keyof ChannelSchemas[Path]]: ChannelHandler<Path, Method & ApiMethods<Path>>
  }
} = {
  '/channels': {
    GET: async ({ query }) => {
      const q = query as { type?: string; agentId?: string } | undefined
      const channels = await channelService.listChannels({
        agentId: q?.agentId,
        type: q?.type
      })
      return { items: channels, total: channels.length, page: 1 }
    },

    POST: async ({ body }) => {
      const dto = body
      return await channelService.createChannel({
        type: dto.type as ChannelConfig['type'],
        name: dto.name,
        config: dto.config as ChannelConfig,
        agentId: dto.agentId,
        isActive: dto.isActive ?? true,
        permissionMode: dto.permissionMode
      })
    }
  },

  '/channels/:id': {
    GET: async ({ params }) => {
      const channel = await channelService.getChannel(params.id)
      if (!channel) throw DataApiErrorFactory.notFound('Channel', params.id)
      return channel
    },

    PATCH: async ({ params, body }) => {
      const dto = body
      const channel = await channelService.updateChannel(params.id, {
        name: dto.name,
        agentId: dto.agentId !== undefined ? dto.agentId : undefined,
        config: dto.config as ChannelConfig | undefined,
        isActive: dto.isActive,
        permissionMode: dto.permissionMode !== undefined ? dto.permissionMode : undefined
      })
      if (!channel) throw DataApiErrorFactory.notFound('Channel', params.id)
      return channel
    },

    DELETE: async ({ params }) => {
      const deleted = await channelService.deleteChannel(params.id)
      if (!deleted) throw DataApiErrorFactory.notFound('Channel', params.id)
      return undefined
    }
  }
}
