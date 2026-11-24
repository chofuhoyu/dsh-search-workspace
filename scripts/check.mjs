/**
 * Offline checks for dsh-search-workspace.
 *
 * The browser bundle is evaluated the way the client module loader does, then
 * `apply` runs against a minimal fake Client context. The browser component is
 * rendered once with fake hooks, and the pure search/tree helpers are exercised
 * directly. This does not replace installing the bundle in a live profile.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const root = new URL('..', import.meta.url)
const read = name => readFile(new URL(name, root), 'utf8')

// ------------------------------------------------------------- manifest

const manifest = JSON.parse(await read('package.json'))
assert.equal(manifest.name, 'dsh-search-workspace')
assert.equal(manifest.version, '0.0.2')
assert.equal(manifest.private, undefined, 'the package must be publishable')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.dsh?.client?.platform, 'web')
assert.deepEqual(Array.from(manifest.dsh.client.inject), [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-shortcuts',
  '@deepseek-ai/dsh-client-ui-context-menu',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-session',
  '@deepseek-ai/dsh-client-ui-sidebar',
  '@deepseek-ai/dsh-client-ui-workspace',
])
for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'README.md', 'LICENSE']) {
  assert.ok(manifest.files.includes(file) || manifest.files.some(pattern => pattern.endsWith(`/${file}`)), `files lists ${file}`)
}
assert.ok(manifest.files.includes('locale/*.json'), 'files lists the locale dictionaries')
assert.ok(manifest.files.includes('scripts/*.mjs'), 'files lists the check scripts')
assert.ok(manifest.engines.dsh.includes('>=0.2.2-rc.1'), 'engines.dsh covers the target release')

const patch = await read('cordis.patch.yml')
assert.match(patch, /- insert:/)
assert.match(patch, /id: search-workspace/)
assert.match(patch, /name: dsh-search-workspace/)

for (const locale of ['zh', 'en']) {
  const dict = JSON.parse(await read(`locale/${locale}.json`))
  assert.equal(typeof dict.meta?.title, 'string', `${locale} meta.title`)
  assert.ok(dict.meta.title.length > 0, `${locale} meta.title is not empty`)
  assert.equal(typeof dict.meta?.description, 'string', `${locale} meta.description`)
  assert.ok(dict.meta.description.length > 0, `${locale} meta.description is not empty`)
}

const icon = await read('icon.svg')
assert.match(icon.trimStart(), /^<svg[\s>]/, 'icon is an SVG document')
assert.match(icon, /viewBox="/, 'icon declares a viewBox')
assert.ok(!/<script/i.test(icon), 'icon has no script')
assert.ok(Buffer.byteLength(icon) < 256 * 1024, 'icon stays under the 256 KiB limit')

// ---------------------------------------------------------- client bundle

const source = await read('client.js')
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(source), 'no literal hex colors')
assert.ok(!/\brgba?\(/.test(source), 'no literal rgb colors')
assert.ok(!/\bhsla?\(/.test(source), 'no literal hsl colors')
const requires = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(match => match[1])
assert.deepEqual(requires, [
  'react',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
], 'the bundle imports only React and the shipped UI primitives')

let row
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(value) {
        row = value
      },
    },
  },
  console,
  setTimeout,
  clearTimeout,
  document: {
    head: { appendChild() {} },
    createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
    body: {},
    activeElement: null,
  },
}
vm.runInNewContext(source, sandbox, { filename: 'client.js' })

assert.equal(row?.id, 'dsh-search-workspace', 'client bundle id')
assert.equal(typeof row.factory, 'function', 'client factory')

const makeHook = () => () => {}
const React = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: initial => [initial, makeHook()],
  useEffect: makeHook(),
  useLayoutEffect: makeHook(),
  useMemo: factory => factory(),
  useRef: initial => ({ current: initial }),
  useCallback: fn => fn,
}
const primitives = {
  Button: Symbol('Button'),
  IconArchiveOffOutlineRegular: Symbol('IconArchiveOffOutlineRegular'),
  IconCheckOutlineRegular: Symbol('IconCheckOutlineRegular'),
  IconChevronsUpDownOutlineRegular: Symbol('IconChevronsUpDownOutlineRegular'),
  IconClockOutlineRegular: Symbol('IconClockOutlineRegular'),
  IconCloseFillRegular: Symbol('IconCloseFillRegular'),
  IconEditOutlineRegular: Symbol('IconEditOutlineRegular'),
  IconEllipsisOutlineRegular: Symbol('IconEllipsisOutlineRegular'),
  IconFolderCloseRegular: Symbol('IconFolderCloseRegular'),
  IconFolderOpenRegular: Symbol('IconFolderOpenRegular'),
  IconNewChatOutlineRegular: Symbol('IconNewChatOutlineRegular'),
  IconPinFillRegular: Symbol('IconPinFillRegular'),
  IconPlusOutlineRegular: Symbol('IconPlusOutlineRegular'),
  IconProjectAddOutlineRegular: Symbol('IconProjectAddOutlineRegular'),
  IconQueueOutlineRegular: Symbol('IconQueueOutlineRegular'),
  IconSearchOutlineRegular: Symbol('IconSearchOutlineRegular'),
  IconSlidersTwoOutlineRegular: Symbol('IconSlidersTwoOutlineRegular'),
  IconTrashOutlineRegular: Symbol('IconTrashOutlineRegular'),
  IconTriangleRightFillRegular: Symbol('IconTriangleRightFillRegular'),
  Input: Symbol('Input'),
  Menu: Symbol('Menu'),
  Modal: Symbol('Modal'),
  StateDot: Symbol('StateDot'),
  Tooltip: Symbol('Tooltip'),
  relativeTime: () => ({ unit: 'now', n: 0 }),
  useDismissOnOutsidePointer: makeHook(),
}
const requireStub = (id) => {
  if (id === 'react') return React
  if (id === 'react-dom') return { createPortal: element => ({ portal: element }) }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  throw new Error(`unexpected client require: ${id}`)
}
const plugin = row.factory(requireStub)
assert.equal(typeof plugin.apply, 'function', 'client apply')
assert.deepEqual(Array.from(plugin.inject), [
  'slots', 'locale', 'shortcuts', 'uiWorkspace', 'workspaces', 'sessions',
])
for (const name of ['filterRows', 'queryTokens', 'matchesTokens', 'sessionNode', 'buildSessionNodes', 'orderSessions']) {
  assert.equal(typeof plugin.__internal[name], 'function', `${name} seam`)
}

// ------------------------------------------------------------- apply run

const registrations = []
const disposers = []
const commands = []
const dictionaries = []
let searchRequestSource
const snapshot = {
  items: [
    { workspaceId: 'ws-a', title: 'dsh-plugins', path: '/Users/me/Code/dsh-plugins', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
    { workspaceId: 'ws-b', title: 'deepseek-harness', path: '/Users/me/Code/deepseek-harness', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
    { workspaceId: 'ws-c', title: 'default-workspace', path: '/Users/me/Documents/deepseek-harness/default-workspace', sessionIds: [], createdAt: '', updatedAt: '' },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
}
const calls = []
const ctx = {
  effect(callback) {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
  locale: {
    register(ns, dicts) {
      dictionaries.push({ ns, dicts })
      return () => {}
    },
    bind() {
      return key => key
    },
  },
  shortcuts: {
    register(command) {
      commands.push(command)
      return () => {}
    },
  },
  slots: {
    inject(key, callback) {
      const dispose = callback()
      disposers.push(dispose)
      return dispose
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
  workspaces: {
    list: { getSnapshot: () => snapshot },
    create: async input => {
      calls.push(['createWorkspace', input.path])
      return { workspaceId: 'ws-new', path: input.path }
    },
    rename: async (id, title) => { calls.push(['renameWorkspace', id, title]); return {} },
    delete: async (id) => { calls.push(['deleteWorkspace', id]) },
  },
  sessions: {
    searchResultLimit: 20,
    list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready' }) },
    search: async (query) => {
      calls.push(['searchSessions', query])
      return { ok: true, value: { items: [{ sessionId: 's1', snippet: 'hit' }], hasMore: true } }
    },
  },
  uiWorkspace: {
    pickDirectory: async () => { calls.push(['pickDirectory']); return '/tmp/picked' },
    openSession: (id) => { calls.push(['openSession', id]) },
    startSession: (id) => { calls.push(['startSession', id]) },
  },
}
plugin.apply(ctx)

const bySlot = name => registrations.find(entry => entry.options.name === name)
const browser = bySlot('sidebar.workspaces')
assert.ok(browser, 'the browser registration exists')
assert.equal(browser.options.priority, -1, 'the browser shadows the shipped entry')
assert.equal(browser.options.children, undefined, 'the browser declares no child slots')
assert.equal(browser.options.locale, 'workspace', 'the browser reuses the shipped workspace copy')
const hero = bySlot('conversation.hero.workspace')
assert.ok(hero, 'the hero picker registration exists')
assert.equal(hero.options.priority, -1, 'the hero picker shadows the shipped entry')
assert.equal(hero.options.children, undefined, 'the hero picker declares no child slots')
assert.equal(registrations.length, 2, 'no other surfaces are registered')

const browserInjected = browser.options.inject()
searchRequestSource = browserInjected.hooks.searchRequest
assert.equal(typeof searchRequestSource.getSnapshot, 'function', 'the browser search request is observable')
assert.equal(searchRequestSource.getSnapshot(), 0)
assert.equal(typeof browserInjected.tExtra, 'function', 'the browser receives the extra copy seat')
assert.equal(browserInjected.searchResultLimit, 20, 'the browser receives the host search bound')
for (const name of ['openSession', 'startSession', 'addWorkspace', 'renameWorkspace', 'deleteWorkspace', 'searchSessions']) {
  assert.equal(typeof browserInjected[name], 'function', `browser injected ${name}`)
}
const heroInjected = hero.options.inject()
assert.equal(typeof heroInjected.pickDirectory, 'function')
assert.equal(typeof heroInjected.createWorkspace, 'function')

assert.equal(commands.length, 1, 'one command registered')
const command = commands[0]
assert.equal(command.id, 'workspace.search')
// DSH rejects arbitrary Web/Linux defaults: that profile only admits a small
// fixed chord set, so the command must stay unbound there.
assert.deepEqual(Object.keys(command.defaults), [
  'desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows',
])
assert.deepEqual(Array.from(command.regions), ['page', 'editable'])
assert.deepEqual(Array.from(command.modals), ['sidebar'])
assert.equal(command.resolve({ modal: null }).status, 'handled')
assert.equal(command.resolve({ modal: 'sidebar' }).status, 'handled')
assert.equal(command.resolve({ modal: 'settings' }).status, 'blocked')
command.resolve({ modal: null }).run()
assert.equal(searchRequestSource.getSnapshot(), 1, 'the command requests the browser search')

assert.equal(dictionaries.length, 1, 'one dictionary registration')
assert.equal(dictionaries[0].ns, 'workspaceSearch')
assert.deepEqual(Object.keys(dictionaries[0].dicts).sort(), ['en', 'zh'])
for (const locale of ['zh', 'en']) {
  const dict = dictionaries[0].dicts[locale]
  for (const key of ['find.action', 'find.blocked', 'find.search.placeholder', 'find.search.workspaces',
    'find.search.sessions', 'find.search.none', 'find.empty.workspaces', 'find.add.failed',
    'find.picker.placeholder', 'find.picker.add']) {
    assert.equal(typeof dict[key], 'string', `${locale} exposes ${key}`)
  }
}

// --------------------------------------------------- injected browser calls

let pickerResult = '/tmp/picked'
const originalPick = ctx.uiWorkspace.pickDirectory
ctx.uiWorkspace.pickDirectory = async () => pickerResult
calls.length = 0
await browserInjected.addWorkspace()
assert.deepEqual(calls, [
  ['createWorkspace', '/tmp/picked'],
  ['startSession', 'ws-new'],
], 'add workspace adopts the path and starts a session there')
pickerResult = null
calls.length = 0
await browserInjected.addWorkspace()
assert.deepEqual(calls, [], 'cancelling the chooser changes nothing')
ctx.uiWorkspace.pickDirectory = originalPick

calls.length = 0
await browserInjected.renameWorkspace('ws-a', 'Renamed')
await browserInjected.deleteWorkspace('ws-b')
assert.deepEqual(calls, [['renameWorkspace', 'ws-a', 'Renamed'], ['deleteWorkspace', 'ws-b']])

calls.length = 0
const search = await browserInjected.searchSessions('hello', new AbortController().signal)
assert.deepEqual(calls, [['searchSessions', 'hello']])
assert.equal(search.items.length, 1)
assert.equal(search.hasMore, true)
ctx.sessions.search = async () => ({ ok: false, error: { message: 'offline' } })
await assert.rejects(() => browserInjected.searchSessions('x', new AbortController().signal), /offline/)

// --------------------------------------------------------- rendered smoke

const useWorkspaces = selector => selector(snapshot)
const useSessions = selector => selector({
  ids: ['s1', 's2'],
  byId: {
    s1: { id: 's1', displayTitle: 'First', title: 'First', blank: false, running: false, updatedAt: 200, retainedBy: {}, origin: undefined },
    s2: { id: 's2', displayTitle: 'Second', title: 'Second', blank: false, running: false, updatedAt: 100, retainedBy: {}, origin: undefined },
  },
  phase: 'ready',
})
const useSessionStatus = selector => selector(new Map())
const usePanelInfo = selector => selector({ activePanelId: null })
const useWorkspaceAccess = () => true
const baseProps = {
  wide: true,
  expandSidebar: () => {},
  useSectionScroller: () => ({ bindScrollerRef: () => {} }),
  useSessions,
  useSessionStatus,
  useWorkspaces,
  usePanelInfo,
  useWorkspaceAccess,
  renderFactorySlot: () => null,
  t: key => key,
  tExtra: key => key,
  useSearchRequest: selector => selector(0),
  ...browserInjected,
}
const wideTree = browser.component(baseProps)
assert.ok(wideTree, 'the wide browser renders')
assert.equal(wideTree.type, 'div')
const railTree = browser.component({ ...baseProps, wide: false })
assert.ok(railTree, 'the rail browser renders')
assert.equal(railTree.props.className, 'dsws-broot dsws-brail')

const heroClosed = hero.component({
  open: false,
  anchorRef: { current: null },
  selectedId: undefined,
  onPick: () => {},
  onClose: () => {},
  createWorkspace: async () => ({}),
  pickDirectory: async () => null,
  useWorkspaces,
  t: key => key,
})
assert.equal(heroClosed, null, 'the closed hero picker renders nothing')
const heroOpen = hero.component({
  open: true,
  anchorRef: { current: null },
  selectedId: 'ws-a',
  onPick: () => {},
  onClose: () => {},
  createWorkspace: async () => ({}),
  pickDirectory: async () => null,
  useWorkspaces,
  t: key => key,
})
assert.ok(heroOpen?.portal, 'the open hero picker portals its popover')

// ------------------------------------------------------------- pure helpers

const {
  filterRows, queryTokens, matchesTokens, workspaceDisplayTitle, distinguishingPathSuffixes,
  workspaceRows, buildSessionNodes, orderSessions,
} = plugin.__internal
assert.equal(workspaceDisplayTitle('default-workspace', 'Default workspace'), 'Default workspace')
assert.equal(workspaceDisplayTitle('mine', 'Default workspace'), 'mine')

const rows = workspaceRows(snapshot.items, 'Default workspace')
assert.equal(rows[0].title, 'dsh-plugins')
assert.equal(rows[2].title, 'Default workspace', 'the automatic title localizes')

const same = distinguishingPathSuffixes([
  { id: 'a', title: 'app', path: '/work/one/app' },
  { id: 'b', title: 'app', path: '/work/two/app' },
  { id: 'c', title: 'only', path: '/work/only' },
])
assert.equal(same.get('a'), 'one/app')
assert.equal(same.get('b'), 'two/app')
assert.equal(same.has('c'), false)

assert.deepEqual(Array.from(filterRows(rows, '')).map(r => r.id), ['ws-a', 'ws-b', 'ws-c'])
assert.deepEqual(Array.from(filterRows(rows, 'plugins')).map(r => r.id), ['ws-a'])
assert.deepEqual(Array.from(filterRows(rows, 'HARNESS')).map(r => r.id), ['ws-b', 'ws-c'])
assert.deepEqual(Array.from(filterRows(rows, 'code dsh')).map(r => r.id), ['ws-a'])
assert.deepEqual(Array.from(filterRows(rows, 'nothing-here')), [])
assert.deepEqual(Array.from(filterRows(rows, 'default workspace')).map(r => r.id), ['ws-c'])

assert.deepEqual(Array.from(queryTokens('  Foo   Bar ')), ['foo', 'bar'])
assert.equal(matchesTokens(['foo'], 'a foo b'), true)
assert.equal(matchesTokens(['foo', 'bar'], 'foo', 'bar'), true)
assert.equal(matchesTokens(['foo'], 'nope'), false)
assert.equal(matchesTokens([], 'anything'), true)

const nodeList = {
  ids: ['s1', 's2', 's3', 'blank', 'archived', 'sub'],
  byId: {
    s1: { id: 's1', title: 'Alpha', displayTitle: 'Alpha', blank: false, running: true, updatedAt: 30, retainedBy: {} },
    s2: { id: 's2', title: 'Beta', displayTitle: 'Beta', blank: false, running: false, updatedAt: 20, retainedBy: {} },
    s3: { id: 's3', title: 'Gamma', displayTitle: 'Gamma', blank: false, running: false, updatedAt: 10, retainedBy: {} },
    blank: { id: 'blank', displayTitle: 'New', blank: true, running: false, updatedAt: 40, retainedBy: {} },
    archived: { id: 'archived', title: 'Old', displayTitle: 'Old', blank: false, running: false, updatedAt: 1, retainedBy: {} },
    sub: { id: 'sub', title: 'Child', displayTitle: 'Child', blank: false, running: false, updatedAt: 5, retainedBy: {}, origin: 'subagent' },
  },
  phase: 'ready',
}
const archivedSet = new Set(['archived'])
const pinnedSet = new Set(['s2'])
const nodes = buildSessionNodes(nodeList, new Map(), archivedSet, pinnedSet, 'blank', false)
assert.deepEqual(Array.from(nodes.keys()).sort(), ['blank', 's1', 's2', 's3'])
assert.equal(nodes.has('archived'), false, 'archived sessions hide by default')
assert.equal(nodes.has('sub'), false, 'subagent sessions never list')
assert.equal(nodes.get('s2').pinned, true)
const withArchived = buildSessionNodes(nodeList, new Map(), archivedSet, pinnedSet, 'blank', true)
assert.equal(withArchived.has('archived'), true, 'the archived view includes them')

const ordered = orderSessions(['s1', 's2', 's3'], nodes, false)
assert.deepEqual(Array.from(ordered).map(n => n.id), ['s2', 's1', 's3'], 'pinned rows lead')
const byRecency = orderSessions(['s1', 's2', 's3'], nodes, true)
assert.deepEqual(Array.from(byRecency).map(n => n.id), ['s2', 's1', 's3'], 'pinned row leads, then recency')

for (const dispose of disposers.reverse()) {
  if (typeof dispose === 'function') dispose()
}

console.log('dsh-search-workspace: checks passed')
