import { ErrorCode } from '@shared/data/api'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listChannelsMock, createChannelMock, getChannelMock, updateChannelMock, deleteChannelMock } = vi.hoisted(
  () => ({
    listChannelsMock: vi.fn(),
    createChannelMock: vi.fn(),
    getChannelMock: vi.fn(),
    updateChannelMock: vi.fn(),
    deleteChannelMock: vi.fn()
  })
)

vi.mock('@main/services/agents/services/ChannelService', () => ({
  channelService: {
    listChannels: listChannelsMock,
    createChannel: createChannelMock,
    getChannel: getChannelMock,
    updateChannel: updateChannelMock,
    deleteChannel: deleteChannelMock
  }
}))

import { channelHandlers } from '../channels'

const CHANNEL_ID = 'channel_1234567890_abcdefghi'

const mockChannel = {
  id: CHANNEL_ID,
  type: 'telegram',
  name: 'Test Bot',
  agentId: null,
  sessionId: null,
  config: { bot_token: 'abc', allowed_chat_ids: [] },
  isActive: true,
  activeChatIds: [],
  permissionMode: null,
  createdAt: 1700000000000,
  updatedAt: 1700000000000
}

describe('channelHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── /channels ─────────────────────────────────────────────────────────────

  describe('/channels', () => {
    it('delegates GET to channelService.listChannels', async () => {
      listChannelsMock.mockResolvedValueOnce([mockChannel])

      const result = await channelHandlers['/channels'].GET({} as never)

      expect(listChannelsMock).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ items: [mockChannel], total: 1, page: 1 })
    })

    it('passes type filter to channelService.listChannels', async () => {
      listChannelsMock.mockResolvedValueOnce([mockChannel])

      await channelHandlers['/channels'].GET({ query: { type: 'telegram' } } as never)

      expect(listChannelsMock).toHaveBeenCalledWith({ agentId: undefined, type: 'telegram' })
    })

    it('delegates POST to channelService.createChannel', async () => {
      createChannelMock.mockResolvedValueOnce(mockChannel)

      const result = await channelHandlers['/channels'].POST({
        body: { type: 'telegram', name: 'Test Bot', config: { bot_token: 'abc' } }
      } as never)

      expect(createChannelMock).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ id: CHANNEL_ID })
    })
  })

  // ── /channels/:id ─────────────────────────────────────────────────────────

  describe('/channels/:id', () => {
    it('delegates GET to channelService.getChannel', async () => {
      getChannelMock.mockResolvedValueOnce(mockChannel)

      const result = await channelHandlers['/channels/:id'].GET({ params: { id: CHANNEL_ID } } as never)

      expect(getChannelMock).toHaveBeenCalledWith(CHANNEL_ID)
      expect(result).toMatchObject({ id: CHANNEL_ID })
    })

    it('throws NOT_FOUND when GET returns null', async () => {
      getChannelMock.mockResolvedValueOnce(null)

      await expect(channelHandlers['/channels/:id'].GET({ params: { id: 'missing' } } as never)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND
      })
    })

    it('delegates PATCH to channelService.updateChannel', async () => {
      updateChannelMock.mockResolvedValueOnce({ ...mockChannel, name: 'Updated' })

      const result = await channelHandlers['/channels/:id'].PATCH({
        params: { id: CHANNEL_ID },
        body: { name: 'Updated' }
      } as never)

      expect(updateChannelMock).toHaveBeenCalledWith(CHANNEL_ID, expect.objectContaining({ name: 'Updated' }))
      expect(result).toMatchObject({ name: 'Updated' })
    })

    it('throws NOT_FOUND when PATCH target is missing', async () => {
      updateChannelMock.mockResolvedValueOnce(null)

      await expect(
        channelHandlers['/channels/:id'].PATCH({ params: { id: 'missing' }, body: {} } as never)
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
    })

    it('delegates DELETE to channelService.deleteChannel', async () => {
      deleteChannelMock.mockResolvedValueOnce(true)

      const result = await channelHandlers['/channels/:id'].DELETE({ params: { id: CHANNEL_ID } } as never)

      expect(deleteChannelMock).toHaveBeenCalledWith(CHANNEL_ID)
      expect(result).toBeUndefined()
    })

    it('throws NOT_FOUND when DELETE target is missing', async () => {
      deleteChannelMock.mockResolvedValueOnce(false)

      await expect(
        channelHandlers['/channels/:id'].DELETE({ params: { id: 'missing' } } as never)
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND })
    })
  })
})
