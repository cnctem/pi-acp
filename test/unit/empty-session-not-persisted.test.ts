import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PiAcpAgent } from '../../src/acp/agent.js'
import { SessionManager } from '../../src/acp/session.js'
import { SessionStore } from '../../src/acp/session-store.js'
import { PiRpcProcess } from '../../src/pi-rpc/process.js'
import { FakeAgentSideConnection, asAgentConn } from '../helpers/fakes.js'

test('SessionManager: empty sessions stay out of the session map until pi writes a file', async t => {
  const root = mkdtempSync(join(tmpdir(), 'pi-acp-empty-session-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const sessionFile = join(root, 'sessions', 's1.jsonl')
  const store = new SessionStore(join(root, 'session-map.json'))
  const proc = {
    async getState() {
      return { sessionId: 's1', sessionFile }
    },
    onEvent() {
      return () => {}
    },
    dispose() {}
  }

  t.mock.method(PiRpcProcess, 'spawn', async () => proc as unknown as PiRpcProcess)

  const manager = new SessionManager()
  Reflect.set(manager, 'store', store)
  t.after(() => manager.disposeAll())

  await manager.create({
    cwd: root,
    mcpServers: [],
    conn: asAgentConn(new FakeAgentSideConnection())
  })

  assert.equal(store.get('s1'), null)
  assert.equal(existsSync(join(root, 'session-map.json')), false)

  mkdirSync(dirname(sessionFile), { recursive: true })
  writeFileSync(sessionFile, '{"type":"session"}\n', 'utf-8')

  manager.remember('s1')
  assert.equal(store.get('s1')?.sessionFile, sessionFile)
})

test('PiAcpAgent: remembers a session after a prompt creates its session file', async () => {
  const conn = new FakeAgentSideConnection()
  const remembered: string[] = []
  const session = {
    sessionId: 's1',
    async prompt() {
      return 'end_turn' as const
    },
    wasCancelRequested() {
      return false
    }
  }
  const sessions = {
    maybeGet(sessionId: string) {
      return sessionId === session.sessionId ? session : undefined
    },
    remember(sessionId: string) {
      remembered.push(sessionId)
    }
  }

  const agent = new PiAcpAgent(asAgentConn(conn), {} as any)
  Reflect.set(agent, 'sessions', sessions)

  const result = await agent.prompt({
    sessionId: 's1',
    prompt: [{ type: 'text', text: 'hello' }]
  } as any)

  assert.equal(result.stopReason, 'end_turn')
  assert.deepEqual(remembered, ['s1'])
})
