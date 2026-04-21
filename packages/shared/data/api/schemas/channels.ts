/**
 * Channels domain API Schema definitions
 */

import type { AgentChannelEntity, ListChannelsResponse } from '@shared/data/types/agent'

// ============================================================================
// Channel DTOs
// ============================================================================

export interface CreateChannelDto {
  type: string
  name: string
  config: Record<string, unknown>
  isActive?: boolean
  agentId?: string
  permissionMode?: string
}

export interface UpdateChannelDto {
  name?: string
  agentId?: string | null
  config?: Record<string, unknown>
  isActive?: boolean
  permissionMode?: string | null
}

export interface ListChannelsQuery {
  type?: string
  agentId?: string
}

// ============================================================================
// API Schema definitions
// ============================================================================

export interface ChannelSchemas {
  /** List channels (filterable by type/agentId), create a new channel */
  '/channels': {
    GET: {
      query?: ListChannelsQuery
      response: ListChannelsResponse
    }
    POST: {
      body: CreateChannelDto
      response: AgentChannelEntity
    }
  }

  /** Get, update, or delete a specific channel */
  '/channels/:id': {
    GET: {
      params: { id: string }
      response: AgentChannelEntity
    }
    PATCH: {
      params: { id: string }
      body: UpdateChannelDto
      response: AgentChannelEntity
    }
    DELETE: {
      params: { id: string }
      response: void
    }
  }
}
