/**
 * Offline checks for dsh-search-workspace.
 *
 * The browser bundle is evaluated the way the client module loader does, then
 * `apply` runs against a minimal fake Client context. The search helpers and
 * the closed/opened component shapes are exercised without a browser. This
 * does not replace installing the bundle in a live Harness profile.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const root = new URL('..', import.meta.url)
const read = name => readFile(new URL(name, root), 'utf8')

// ------------------------------------------------------------- manifest

const manifest = JSON.parse(await read('package.json'))
assert.equal(manifest.name, 'dsh-search-workspace')
assert.equal(manifest.version, '0.0.1')
assert.equal(manifest.private, undefined, 'the package must be publishable')
assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml')
assert.equal(manifest.dsh?.client?.platform, 'web')
assert.deepEqual(Array.from(manifest.dsh.client.inject), [
  '@deepseek-ai/dsh-api-session-controller',
  '@deepseek-ai/dsh-api-workspace-controller',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-shortcuts',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-renderer',
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
  IconCheckOutlineRegular: Symbol('IconCheckOutlineRegular'),
  IconCloseFillRegular: Symbol('IconCloseFillRegular'),
  IconFolderCloseRegular: Symbol('IconFolderCloseRegular'),
  IconPlusOutlineRegular: Symbol('IconPlusOutlineRegular'),
  IconSearchOutlineRegular: Symbol('IconSearchOutlineRegular'),
  Input: Symbol('Input'),
  Modal: Symbol('Modal'),
  Tooltip: Symbol('Tooltip'),
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
assert.equal(typeof plugin.__internal.filterRows, 'function', 'filter seam')

// ------------------------------------------------------------- apply run

const registrations = []
const disposers = []
const commands = []
const dictionaries = []
let finderSource
const snapshot = {
  items: [
    { workspaceId: 'ws-a', title: 'dsh-plugins', path: '/Users/me/Code/dsh-plugins', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
    { workspaceId: 'ws-b', title: 'deepseek-harness', path: '/Users/me/Code/deepseek-harness', sessionIds: [], createdAt: '', updatedAt: '' },
    { workspaceId: 'ws-c', title: 'default-workspace', path: '/Users/me/Documents/deepseek-harness/default-workspace', sessionIds: [], createdAt: '', updatedAt: '' },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
}
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
    create: async input => ({ workspaceId: 'ws-new', path: input.path }),
  },
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {} }) },
  },
  uiWorkspace: {
    pickDirectory: async () => '/tmp/picked',
    openSession: () => {},
    startSession: () => {},
  },
}
plugin.apply(ctx)

const bySlot = (name, id) => registrations.find(entry =>
  entry.options.name === name && (id === undefined || entry.options.id === id))
assert.ok(bySlot('sidebar.footer.action', 'workspace-search'), 'sidebar footer action registered')
assert.ok(bySlot('shell.overlay', 'workspace-search'), 'finder overlay registered')
const hero = bySlot('conversation.hero.workspace')
assert.ok(hero, 'hero picker registered')
assert.equal(hero.options.priority, -1, 'hero picker shadows the shipped entry')
assert.equal(hero.options.children, undefined, 'hero picker declares no child slots')

const overlay = bySlot('shell.overlay', 'workspace-search')
const injected = overlay.options.inject()
assert.equal(typeof injected.hooks.finderOpen.getSnapshot, 'function', 'finder source is observable')
assert.equal(injected.hooks.finderOpen.getSnapshot(), false, 'finder starts closed')
const action = bySlot('sidebar.footer.action', 'workspace-search').options.inject()
action.openFinder()
assert.equal(injected.hooks.finderOpen.getSnapshot(), true, 'the footer entry opens the finder')
injected.closeFinder()
assert.equal(injected.hooks.finderOpen.getSnapshot(), false, 'the dialog closes the finder')

assert.equal(commands.length, 1, 'one command registered')
const command = commands[0]
assert.equal(command.id, 'workspace.search')
assert.deepEqual(Object.keys(command.defaults), [
  'desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows', 'web:linux',
])
assert.deepEqual(Array.from(command.regions), ['page', 'editable'])
assert.deepEqual(Array.from(command.modals), ['search-workspace', 'sidebar'])
assert.equal(command.resolve({ modal: null }).status, 'handled')
assert.equal(command.resolve({ modal: 'sidebar' }).status, 'handled')
assert.equal(command.resolve({ modal: 'search-workspace' }).status, 'handled')
assert.equal(command.resolve({ modal: 'settings' }).status, 'blocked')
command.resolve({ modal: null }).run()
assert.equal(injected.hooks.finderOpen.getSnapshot(), true, 'the command opens the finder')
command.resolve({ modal: 'search-workspace' }).run()
assert.equal(injected.hooks.finderOpen.getSnapshot(), false, 'the command toggles the finder closed')

assert.equal(dictionaries.length, 1, 'one dictionary registration')
assert.equal(dictionaries[0].ns, 'workspaceSearch')
assert.deepEqual(Object.keys(dictionaries[0].dicts).sort(), ['en', 'zh'])
for (const locale of ['zh', 'en']) {
  const dict = dictionaries[0].dicts[locale]
  for (const key of ['find.action', 'find.title', 'find.placeholder', 'find.noMatch', 'find.newSession',
    'picker.placeholder', 'picker.add', 'picker.noMatch']) {
    assert.equal(typeof dict[key], 'string', `${locale} exposes ${key}`)
  }
}

// ------------------------------------------------ rendered component smoke

const t = key => key
const footerElement = bySlot('sidebar.footer.action', 'workspace-search').component({
  wide: true, openFinder: () => {}, t,
})
assert.ok(footerElement, 'the footer action renders')
const railElement = bySlot('sidebar.footer.action', 'workspace-search').component({
  wide: false, openFinder: () => {}, t,
})
assert.ok(railElement, 'the rail action renders')

const useWorkspaces = selector => selector(snapshot)
const useSessions = selector => selector({ ids: [], byId: {} })
const heroClosed = bySlot('conversation.hero.workspace').component({
  open: false,
  anchorRef: { current: null },
  selectedId: undefined,
  onPick: () => {},
  onClose: () => {},
  createWorkspace: async () => ({}),
  pickDirectory: async () => null,
  useWorkspaces,
  t,
})
assert.equal(heroClosed, null, 'the closed hero picker renders nothing')
const heroOpen = bySlot('conversation.hero.workspace').component({
  open: true,
  anchorRef: { current: null },
  selectedId: 'ws-a',
  onPick: () => {},
  onClose: () => {},
  createWorkspace: async () => ({}),
  pickDirectory: async () => null,
  useWorkspaces,
  t,
})
assert.ok(heroOpen?.portal, 'the open hero picker portals its popover')

const finderElement = overlay.component({
  useFinderOpen: selector => selector(false),
  useWorkspaces,
  useSessions,
  closeFinder: () => {},
  openFinderWorkspace: () => {},
  startFinderSession: () => {},
  t,
})
assert.ok(finderElement, 'the finder renders')
assert.equal(finderElement.type, primitives.Modal, 'the finder uses the shipped Modal')
assert.equal(finderElement.props.open, false)

// ------------------------------------------------------------- pure helpers

const { filterRows, workspaceRows, distinguishingPathSuffixes, workspaceDisplayTitle } = plugin.__internal
assert.equal(workspaceDisplayTitle('default-workspace', 'Default workspace'), 'Default workspace')
assert.equal(workspaceDisplayTitle('mine', 'Default workspace'), 'mine')

const rows = workspaceRows(snapshot.items, 'Default workspace')
assert.equal(rows[0].title, 'dsh-plugins')
assert.equal(rows[2].title, 'Default workspace', 'the automatic title localizes')
assert.equal(rows[0].suffix, undefined, 'unique titles carry no suffix')

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
assert.deepEqual(Array.from(filterRows(rows, 'default workspace')).map(r => r.id), ['ws-c'],
  'the localized default title is searchable')

// Rank: an early title match leads a later path match.
const ranked = filterRows([
  { id: 'path-hit', title: 'zzz', path: '/a/harness', sessionIds: [] },
  { id: 'title-hit', title: 'harness', path: '/b', sessionIds: [] },
], 'harness')
assert.deepEqual(Array.from(ranked).map(r => r.id), ['title-hit', 'path-hit'])

for (const dispose of disposers.reverse()) {
  if (typeof dispose === 'function') dispose()
}

console.log('dsh-search-workspace: checks passed')
