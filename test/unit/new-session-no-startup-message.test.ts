import test from 'node:test'
import assert from 'node:assert/strict'
import { PiAcpAgent } from '../../src/acp/agent.js'
import { FakeAgentSideConnection, asAgentConn } from '../helpers/fakes.js'

class FakeSessions {
  constructor(private readonly session: any) {}

  async create() {
    return this.session
  }

  closeAllExcept() {}

  close() {}
}

test('PiAcpAgent: newSession does not send a synthetic startup message', async () => {
  const realSetTimeout = globalThis.setTimeout
  const scheduled: Array<() => void> = []
  ;(globalThis as any).setTimeout = (callback: () => void) => {
    scheduled.push(callback)
    return 0 as any
  }

  try {
    const conn = new FakeAgentSideConnection()
    const session = {
      sessionId: 's1',
      cwd: process.cwd(),
      proc: {
        async getAvailableModels() {
          return { models: [{ provider: 'test', id: 'model', name: 'model' }] }
        },
        async getState() {
          return { thinkingLevel: 'medium', model: { provider: 'test', id: 'model' } }
        },
        async getAvailableThinkingLevels() {
          return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
        },
        async getCommands() {
          return { commands: [] }
        }
      },
      async publishContextUsage() {}
    }

    const agent = new PiAcpAgent(asAgentConn(conn), {} as any)
    ;(agent as any).sessions = new FakeSessions(session) as any

    const response = await agent.newSession({ cwd: process.cwd(), mcpServers: [] } as any)

    assert.equal('_meta' in response, false)
    assert.equal(scheduled.length, 1)

    scheduled[0]!()
    await new Promise(resolve => realSetTimeout(resolve, 0))

    assert.equal(
      conn.updates.some(update => update.update.sessionUpdate === 'agent_message_chunk'),
      false
    )
  } finally {
    ;(globalThis as any).setTimeout = realSetTimeout
  }
})
