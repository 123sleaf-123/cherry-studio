import { beforeEach, describe, expect, it, vi } from 'vitest'

const getWebSearchProviderMock = vi.fn()
const processWebsearchMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock('@renderer/services/WebSearchService', () => ({
  webSearchService: {
    getWebSearchProviderAsync: getWebSearchProviderMock,
    processWebsearch: processWebsearchMock
  }
}))

vi.mock('@logger', () => ({
  loggerService: {
    withContext: vi.fn(() => ({
      warn: loggerWarnMock
    }))
  }
}))

describe('webSearchToolWithPreExtractedKeywords', () => {
  beforeEach(() => {
    getWebSearchProviderMock.mockReset()
    processWebsearchMock.mockReset()
    loggerWarnMock.mockReset()
  })

  it('returns an empty result when the configured provider is unavailable', async () => {
    getWebSearchProviderMock.mockResolvedValue(undefined)

    const { webSearchToolWithPreExtractedKeywords } = await import('../WebSearchTool')
    const tool = webSearchToolWithPreExtractedKeywords('tavily', { question: ['latest cherry studio'] }, 'request-1')

    await expect(tool.execute?.({ additionalContext: undefined }, {} as never)).resolves.toEqual({
      query: '',
      results: []
    })

    expect(processWebsearchMock).not.toHaveBeenCalled()
    expect(loggerWarnMock).toHaveBeenCalledWith('Skip web search because provider is unavailable', {
      webSearchProviderId: 'tavily',
      requestId: 'request-1'
    })
  })
})
