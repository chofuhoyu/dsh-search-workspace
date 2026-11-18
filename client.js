/**
 * dsh-search-workspace client half.
 *
 * Two surfaces, one index:
 *
 * - `conversation.hero.workspace` — the New Session workspace picker. This
 *   registration shadows the shipped picker at priority -1 and keeps its
 *   owner contract (`open` / `anchorRef` / `selectedId` / `onPick` /
 *   `onClose`). It adds a search field and direct row selection, and adopts a
 *   picked directory through the shipped `uiWorkspace` service so the
 *   "Add workspace…" entry keeps working without declaring the shipped
 *   directory-flow child (a shadow registration cannot redeclare it).
 * - `sidebar.footer.action` + `shell.overlay` — a workspace finder opened
 *   from the left sidebar (and by `workspace.search`). It searches the same
 *   registry by title or path and opens the most recent session, or starts a
 *   new session in a workspace without one.
 *
 * The shipped sidebar browser keeps its own search (sessions) and its child
 * seats; this plugin only adds the finder beside Settings. Styles use only the
 * `--dsw-*` theme tokens, and controls come from the shipped UI primitives so
 * the surfaces match the host chrome in both themes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-search-workspace',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const {
      Button, IconCheckOutlineRegular, IconCloseFillRegular, IconFolderCloseRegular,
      IconPlusOutlineRegular, IconSearchOutlineRegular, Input, Modal, Tooltip,
      useDismissOnOutsidePointer,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    /** Client locale namespace owned by this plugin. */
    const NS = 'workspaceSearch'
    /** Value the Host stores for the automatic first-use workspace title. */
    const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'
    /** `data-shortcut-modal` id of the finder dialog. */
    const FINDER_MODAL = 'search-workspace'
    /** Design cap for an anchored picker, in px. */
    const POPOVER_MAX_HEIGHT = 380
    /** Popover width, clamped to the viewport. */
    const POPOVER_WIDTH = 340

    const ZH = {
      'find.action': '查找工作区',
      'find.title': '查找工作区',
      'find.placeholder': '搜索工作区名称或路径',
      'find.noMatch': '没有匹配的工作区',
      'find.loading': '正在加载工作区…',
      'find.hint': '↑↓ 选择 · ↵ 打开',
      'find.newSession': '在此新建会话',
      'find.blocked': '请先关闭当前对话框',
      'find.close': '关闭',
      'find.oneSession': '1 个会话',
      'find.sessions': '{n} 个会话',
      'picker.placeholder': '搜索工作区',
      'picker.noMatch': '没有匹配的工作区',
      'picker.loading': '正在加载工作区…',
      'picker.add': '添加工作区…',
      'picker.clear': '清除搜索',
      'picker.createFailed': '无法添加该工作区',
    }

    const EN = {
      'find.action': 'Find workspace',
      'find.title': 'Find workspace',
      'find.placeholder': 'Search by workspace name or path',
      'find.noMatch': 'No matching workspace',
      'find.loading': 'Loading workspaces…',
      'find.hint': '↑↓ to choose · ↵ to open',
      'find.newSession': 'New session here',
      'find.blocked': 'Close the current dialog first',
      'find.close': 'Close',
      'find.oneSession': '1 session',
      'find.sessions': '{n} sessions',
      'picker.placeholder': 'Search workspaces',
      'picker.noMatch': 'No matching workspace',
      'picker.loading': 'Loading workspaces…',
      'picker.add': 'Add workspace…',
      'picker.clear': 'Clear search',
      'picker.createFailed': 'Could not add that workspace',
    }

    const STYLES = `
.dsws-foot {
  display: flex;
  width: 100%;
  min-width: 0;
}

.dsws-foot-rail {
  width: 36px;
}

.dsws-foot-button {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--dsh-sidebar-label-gap, 6px);
  height: 42px;
  margin: 0;
  padding: 0 calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));
  box-sizing: border-box;
  border: none;
  border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  background-clip: padding-box;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  white-space: nowrap;
  cursor: pointer;
}

.dsws-foot-rail .dsws-foot-button {
  flex: none;
  width: 36px;
  height: 36px;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-inline: 0;
  background-clip: border-box;
}

@media (hover: hover) {
  .dsws-foot-button:hover {
    background-color: var(--dsw-alias-interactive-bg-hover);
  }
}

.dsws-foot-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.dsws-popover {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-menu-surface-fill, var(--dsw-alias-bg-overlay));
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 22px;
}

.dsws-field {
  display: flex;
  margin: 8px 8px 4px;
}

.dsws-field-modal {
  display: flex;
  margin: 0;
}

.dsws-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.dsws-list-modal {
  min-height: 0;
  max-height: min(420px, 56vh);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0 -8px;
}

.dsws-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 4px 8px;
  box-sizing: border-box;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dsws-row[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsws-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.dsws-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsws-row-suffix {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}

.dsws-row-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}

.dsws-row-icon {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-secondary);
}

.dsws-row-check {
  flex: none;
  display: inline-flex;
  margin-left: auto;
  color: var(--dsw-alias-label-primary);
}

.dsws-count {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.dsws-status {
  padding: 8px 10px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
}

.dsws-error {
  margin: 0 8px 4px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}

.dsws-popover-footer {
  flex: none;
  padding: 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
}

.dsws-add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dsws-add[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsws-add:disabled {
  cursor: default;
  opacity: 0.6;
}

.dsws-modal {
  width: min(520px, 100%);
}

.dsws-hint {
  margin-right: auto;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
`

    // ---------------------------------------------------------------- icons

    /** One 16-box stroke glyph from the shipped icon artwork. */
    function strokeIcon(paths, defaultSize) {
      return function Icon({ size = defaultSize, className }) {
        return h(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 16 16',
            fill: 'none',
            strokeWidth: 1,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            className,
            'aria-hidden': 'true',
          },
          paths.map((d, index) => h('path', { key: index, d, stroke: 'currentColor' })),
        )
      }
    }

    const SearchIcon = strokeIcon([
      'M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z',
      'M10.2991 10.3933L14.7783 14.8725',
    ], 16)

    const FolderIcon = strokeIcon([
      'M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z',
      'M3.63501 7.66614H12.3647',
    ], 16)

    const PlusIcon = strokeIcon(['M8 2V14', 'M2 8H14'], 16)

    const CheckIcon = strokeIcon([
      'M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4',
    ], 14)

    const CloseIcon = strokeIcon(['M3.5 3.5L12.5 12.5', 'M12.5 3.5L3.5 12.5'], 14)

    // ------------------------------------------------------------- helpers

    /** One observable snapshot source, the shape the renderer binds as a hook. */
    function createSource(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          if (Object.is(next, value)) return
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    /** The label one Workspace shows for its stored title. */
    function workspaceDisplayTitle(title, localizedDefault) {
      return title === DEFAULT_WORKSPACE_DIRECTORY ? localizedDefault : title
    }

    /**
     * Shortest trailing path segment run that tells same-titled Workspaces
     * apart; the shipped picker carries the same helper.
     */
    function distinguishingPathSuffixes(workspaces) {
      const rows = workspaces.map(workspace => ({ ...workspace, parts: workspace.path.split(/([\\/])/) }))
      const suffix = (parts, count) => parts.slice(-(2 * count - 1)).join('')
      const suffixes = new Map()
      for (const row of rows) {
        const peers = rows.filter(other => other !== row && other.title === row.title)
        if (peers.length === 0) continue
        let count = 1
        while (2 * count - 1 < row.parts.length
          && (suffix(row.parts, count) === ''
            || peers.some(peer => suffix(peer.parts, count) === suffix(row.parts, count)))) count += 1
        suffixes.set(row.id, suffix(row.parts, count))
      }
      return suffixes
    }

    /** Project the registry snapshot into the searchable row shape. */
    function workspaceRows(items, localizedDefault) {
      const rows = (items ?? []).map(workspace => ({
        id: workspace.workspaceId,
        title: workspaceDisplayTitle(workspace.title, localizedDefault),
        path: workspace.path,
        sessionIds: workspace.sessionIds ?? [],
      }))
      const suffixes = distinguishingPathSuffixes(rows)
      return rows.map(row => ({ ...row, suffix: suffixes.get(row.id) }))
    }

    /**
     * Filter and rank rows for a query. Every whitespace-separated token must
     * appear in the title or the path; title matches lead, and an earlier
     * title match wins within that order. Ties keep registry order.
     */
    function filterRows(rows, query) {
      const tokens = String(query ?? '').trim().toLowerCase().split(/\s+/u).filter(Boolean)
      if (tokens.length === 0) return rows
      const scored = []
      for (const row of rows) {
        const title = row.title.toLowerCase()
        const path = row.path.toLowerCase()
        let score = 0
        let matched = true
        for (const token of tokens) {
          const titleIndex = title.indexOf(token)
          if (titleIndex >= 0) {
            score += titleIndex
            continue
          }
          const pathIndex = path.indexOf(token)
          if (pathIndex >= 0) {
            score += 1000 + pathIndex
            continue
          }
          matched = false
          break
        }
        if (matched) scored.push({ row, score })
      }
      scored.sort((left, right) => left.score - right.score)
      return scored.map(entry => entry.row)
    }

    /** Non-archived, non-subagent Sessions accounted to one row. */
    function countWorkspaceSessions(row, sessions, archived) {
      let count = 0
      for (const sessionId of row.sessionIds) {
        const summary = sessions.byId[sessionId]
        if (summary !== undefined && summary.origin !== 'subagent' && !archived.has(sessionId)) count += 1
      }
      return count
    }

    /** Most recently updated visible Session in one Workspace, if any. */
    function mostRecentSession(row, sessions, archived) {
      let best
      for (const sessionId of row.sessionIds) {
        const summary = sessions.byId[sessionId]
        if (summary === undefined || summary.origin === 'subagent' || archived.has(sessionId)) continue
        if (best === undefined || (summary.updatedAt ?? 0) > (best.updatedAt ?? 0)) best = summary
      }
      return best
    }

    // ---------------------------------------------------------- components

    /** Shared list row: folder glyph, title, disambiguating suffix, count. */
    function WorkspaceOption({ id, row, active, selected, count, showPath, onActivate, onHover }) {
      return h(
        'div',
        {
          id,
          role: 'option',
          'aria-selected': active ? 'true' : 'false',
          'data-active': active ? 'true' : undefined,
          className: 'dsws-row',
          title: row.path,
          onMouseMove: onHover,
          onClick: onActivate,
        },
        h('span', { className: 'dsws-row-icon' }, h(FolderIcon, { size: 16 })),
        h(
          'span',
          { className: 'dsws-row-main' },
          h('span', { className: 'dsws-row-title' }, row.title),
          showPath ? h('span', { className: 'dsws-row-path' }, row.path) : null,
        ),
        !showPath && row.suffix !== undefined ? h('span', { className: 'dsws-row-suffix' }, row.suffix) : null,
        count !== undefined && count > 0
          ? h('span', { className: 'dsws-count' }, count === 1 ? '1' : String(count))
          : null,
        selected ? h('span', { className: 'dsws-row-check' }, h(CheckIcon, { size: 14 })) : null,
      )
    }

    /** Arrow/Enter keys shared by the two search surfaces. */
    function keydownHandler({ rows, active, setActive, onActivate, onClose }) {
      return (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActive(Math.min(rows.length - 1, active + 1))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive(Math.max(0, active - 1))
          return
        }
        if (event.key === 'Home') {
          event.preventDefault()
          setActive(0)
          return
        }
        if (event.key === 'End') {
          event.preventDefault()
          setActive(Math.max(0, rows.length - 1))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const row = rows[active]
          if (row !== undefined) onActivate(row)
          return
        }
        if (event.key === 'Escape' && onClose !== undefined) {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }
    }

    /** The New Session picker: an anchored popover with a search field. */
    function SearchableWorkspacePicker({
      open, anchorRef, selectedId, onPick, onClose, createWorkspace, pickDirectory, useWorkspaces, t,
    }) {
      const snapshot = useWorkspaces(state => state)
      const items = snapshot?.items ?? []
      const defaultName = t('workspace.defaultName')
      const rows = useMemo(() => workspaceRows(items, defaultName), [items, defaultName])
      const [query, setQuery] = useState('')
      const [active, setActive] = useState(0)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const [box, setBox] = useState({ left: 8, top: 8, width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT })
      const absentAnchor = useRef(null)
      const popoverRef = useRef(null)
      const inputRef = useRef(null)
      const listRef = useRef(null)
      const restoreRef = useRef(null)
      const filtered = useMemo(() => filterRows(rows, query), [rows, query])

      const dismiss = useCallback(() => { onClose() }, [onClose])
      useDismissOnOutsidePointer(anchorRef ?? absentAnchor, open, (next) => { if (!next) dismiss() }, popoverRef)

      useEffect(() => {
        if (!open) return
        restoreRef.current = document.activeElement
        setQuery('')
        setError(undefined)
        const timer = window.setTimeout(() => { inputRef.current?.focus() }, 0)
        return () => { window.clearTimeout(timer) }
      }, [open])

      useEffect(() => {
        if (open) return
        const previous = restoreRef.current
        restoreRef.current = null
        if (previous !== null && previous.isConnected && typeof previous.focus === 'function') {
          previous.focus({ preventScroll: true })
        }
      }, [open])

      useEffect(() => {
        if (!open) return
        const index = filtered.findIndex(row => row.id === selectedId)
        setActive(index >= 0 ? index : 0)
      }, [open, filtered, selectedId])

      useEffect(() => {
        if (!open) return
        const element = listRef.current?.querySelector('[data-active="true"]')
        element?.scrollIntoView({ block: 'nearest' })
      }, [active, open])

      useLayoutEffect(() => {
        if (!open) return
        const anchor = anchorRef?.current
        if (anchor === null || anchor === undefined) return
        const place = () => {
          const rect = anchor.getBoundingClientRect()
          const width = Math.min(POPOVER_WIDTH, window.innerWidth - 16)
          let left = rect.left
          if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
          left = Math.max(8, left)
          const above = rect.top - 12
          const below = window.innerHeight - rect.bottom - 12
          const side = below >= 260 || below >= above ? 'below' : 'above'
          const maxHeight = Math.max(180, Math.min(POPOVER_MAX_HEIGHT, side === 'below' ? below : above))
          setBox(side === 'above'
            ? { left, width, maxHeight, bottom: window.innerHeight - rect.top + 6, top: undefined }
            : { left, width, maxHeight, top: rect.bottom + 6, bottom: undefined })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, anchorRef])

      const choose = (row) => {
        onPick(row.id)
        onClose()
      }

      const addWorkspace = async () => {
        if (busy) return
        setBusy(true)
        setError(undefined)
        try {
          const path = await pickDirectory()
          if (path === null || path === undefined) return
          const workspace = await createWorkspace({ path })
          onPick(workspace.workspaceId)
          onClose()
        } catch (reason) {
          setError(`${t('picker.createFailed')}: ${reason instanceof Error ? reason.message : String(reason)}`)
        } finally {
          setBusy(false)
        }
      }

      if (!open) return null

      const pending = snapshot?.phase === 'pending'
      const empty = filtered.length === 0
      const activeRow = filtered[active]
      const onKeyDown = keydownHandler({
        rows: filtered,
        active,
        setActive,
        onActivate: choose,
        onClose,
      })
      const style = {
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
        ...(box.top === undefined ? {} : { top: box.top }),
        ...(box.bottom === undefined ? {} : { bottom: box.bottom }),
      }

      return createPortal(
        h(
          'div',
          {
            ref: popoverRef,
            className: 'dsws-popover',
            role: 'presentation',
          },
          h(Input, {
            ref: inputRef,
            className: 'dsws-field',
            icon: h(SearchIcon, { size: 16 }),
            placeholder: t('picker.placeholder'),
            value: query,
            maxLength: 200,
            autoComplete: 'off',
            spellCheck: false,
            'aria-label': t('picker.placeholder'),
            'aria-controls': 'dsws-picker-list',
            'aria-activedescendant': activeRow === undefined ? undefined : `dsws-picker-option-${active}`,
            onChange: (event) => { setQuery(event.target.value) },
            onKeyDown,
          }),
          error === undefined ? null : h('div', { className: 'dsws-error', role: 'alert' }, error),
          pending && empty
            ? h('div', { className: 'dsws-status', role: 'status' }, t('picker.loading'))
            : null,
          !pending && empty
            ? h('div', { className: 'dsws-status', role: 'status' }, t('picker.noMatch'))
            : null,
          h(
            'div',
            { ref: listRef, id: 'dsws-picker-list', className: 'dsws-list', role: 'listbox', 'aria-label': t('picker.placeholder') },
            filtered.map((row, index) => h(WorkspaceOption, {
              key: row.id,
              id: `dsws-picker-option-${index}`,
              row,
              active: index === active,
              selected: row.id === selectedId,
              showPath: false,
              onHover: () => { if (index !== active) setActive(index) },
              onActivate: () => { choose(row) },
            })),
          ),
          h(
            'div',
            { className: 'dsws-popover-footer' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsws-add',
                disabled: busy,
                onClick: () => { void addWorkspace() },
              },
              h('span', { className: 'dsws-row-icon' }, h(PlusIcon, { size: 16 })),
              h('span', null, t('picker.add')),
            ),
          ),
        ),
        document.body,
      )
    }

    /** The finder dialog opened from the sidebar and by `workspace.search`. */
    function WorkspaceFinder({
      useFinderOpen, useWorkspaces, useSessions, closeFinder, openFinderWorkspace, startFinderSession, t,
    }) {
      const open = useFinderOpen(value => value)
      const snapshot = useWorkspaces(state => state)
      const sessions = useSessions(state => state)
      const items = snapshot?.items ?? []
      const archived = useMemo(() => new Set(snapshot?.archivedSessionIds ?? []), [snapshot?.archivedSessionIds])
      const defaultName = t('workspace.defaultName')
      const rows = useMemo(() => workspaceRows(items, defaultName), [items, defaultName])
      const [query, setQuery] = useState('')
      const [active, setActive] = useState(0)
      const inputRef = useRef(null)
      const listRef = useRef(null)
      const filtered = useMemo(() => filterRows(rows, query), [rows, query])

      useEffect(() => {
        if (!open) return
        setQuery('')
        setActive(0)
      }, [open])

      useEffect(() => {
        if (!open) return
        const element = listRef.current?.querySelector('[data-active="true"]')
        element?.scrollIntoView({ block: 'nearest' })
      }, [active, open])

      const activeRow = filtered[active]
      const pending = snapshot?.phase === 'pending'
      const empty = filtered.length === 0
      const onKeyDown = keydownHandler({
        rows: filtered,
        active,
        setActive,
        onActivate: (row) => { openFinderWorkspace(row.id) },
      })
      const footer = h(
        Fragment,
        null,
        h('span', { className: 'dsws-hint' }, t('find.hint')),
        h(Button, {
          variant: 'outline',
          size: 'sm',
          disabled: activeRow === undefined,
          onClick: () => { if (activeRow !== undefined) startFinderSession(activeRow.id) },
        }, t('find.newSession')),
      )

      return h(
        Modal,
        {
          open,
          onClose: closeFinder,
          title: t('find.title'),
          closeLabel: t('find.close'),
          footer,
          className: 'dsws-modal',
          shortcutModal: FINDER_MODAL,
        },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 } },
          h(Input, {
            ref: inputRef,
            className: 'dsws-field-modal',
            icon: h(SearchIcon, { size: 16 }),
            placeholder: t('find.placeholder'),
            value: query,
            maxLength: 200,
            autoComplete: 'off',
            spellCheck: false,
            'data-modal-autofocus': '',
            'aria-label': t('find.placeholder'),
            'aria-controls': 'dsws-finder-list',
            'aria-activedescendant': activeRow === undefined ? undefined : `dsws-finder-option-${active}`,
            onChange: (event) => { setQuery(event.target.value) },
            onKeyDown,
          }),
          pending && empty ? h('div', { className: 'dsws-status', role: 'status' }, t('find.loading')) : null,
          !pending && empty ? h('div', { className: 'dsws-status', role: 'status' }, t('find.noMatch')) : null,
          h(
            'div',
            { ref: listRef, id: 'dsws-finder-list', className: 'dsws-list-modal', role: 'listbox', 'aria-label': t('find.title') },
            filtered.map((row, index) => h(WorkspaceOption, {
              key: row.id,
              id: `dsws-finder-option-${index}`,
              row,
              active: index === active,
              selected: false,
              showPath: true,
              count: countWorkspaceSessions(row, sessions, archived),
              onHover: () => { if (index !== active) setActive(index) },
              onActivate: () => { openFinderWorkspace(row.id) },
            })),
          ),
        ),
      )
    }

    /** The sidebar-foot entry that opens the finder. */
    function FindWorkspaceAction({ wide, openFinder, t }) {
      return h(
        'div',
        { className: wide ? 'dsws-foot' : 'dsws-foot dsws-foot-rail' },
        h(
          Tooltip,
          { label: t('find.action'), side: 'top', portal: true },
          h(
            'button',
            {
              type: 'button',
              className: 'dsws-foot-button',
              'aria-label': t('find.action'),
              onClick: openFinder,
            },
            h(SearchIcon, { size: wide ? 16 : 18 }),
            wide ? h('span', { className: 'dsws-foot-label' }, t('find.action')) : null,
          ),
        ),
      )
    }

    // ------------------------------------------------------------- plugin

    /** Required client services: slots, copy, keys, navigation, registry writes. */
    const inject = ['slots', 'locale', 'shortcuts', 'uiWorkspace', 'workspaces', 'sessions']

    /**
     * Register the two surfaces once their parent slots are declared.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const finderOpen = createSource(false)
      const openFinder = () => { finderOpen.set(true) }
      const closeFinder = () => { finderOpen.set(false) }

      ctx.effect(() => {
        const element = document.createElement('style')
        element.setAttribute('data-dsh-plugin', 'dsh-search-workspace')
        element.textContent = STYLES
        document.head.appendChild(element)
        return () => { element.remove() }
      }, 'search-workspace: styles')

      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'search-workspace: dictionaries')

      ctx.effect(() => ctx.shortcuts.register({
        id: 'workspace.search',
        label: () => t('find.action'),
        aliases: ['find workspace', 'search workspace', 'switch workspace'],
        defaults: {
          'desktop:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
          'desktop:windows': { code: 'KeyK', modifiers: ['primary', 'shift'] },
          'desktop:linux': { code: 'KeyK', modifiers: ['primary', 'shift'] },
          'web:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
          'web:windows': { code: 'KeyK', modifiers: ['primary', 'shift'] },
          'web:linux': { code: 'KeyK', modifiers: ['primary', 'shift'] },
        },
        regions: ['page', 'editable'],
        modals: [FINDER_MODAL, 'sidebar'],
        resolve: (context) => {
          if (context.modal === FINDER_MODAL) return { status: 'handled', run: closeFinder }
          if (context.modal !== null && context.modal !== 'sidebar') {
            return { status: 'blocked', reason: t('find.blocked') }
          }
          return { status: 'handled', run: openFinder }
        },
      }), 'search-workspace: find command')

      const pickDirectory = async () => {
        const bridge = globalThis.__DSH_DIRECTORY_PICKER__
        if (bridge !== undefined && typeof bridge.pick === 'function') return await bridge.pick()
        return await ctx.uiWorkspace.pickDirectory()
      }

      const openFinderWorkspace = (workspaceId) => {
        const snapshot = ctx.workspaces.list.getSnapshot()
        const sessions = ctx.sessions.list.getSnapshot()
        const archived = new Set(snapshot.archivedSessionIds)
        const workspace = snapshot.items.find(item => item.workspaceId === workspaceId)
        const row = workspace === undefined
          ? { sessionIds: [] }
          : { sessionIds: workspace.sessionIds }
        const target = mostRecentSession(row, sessions, archived)
        closeFinder()
        if (target !== undefined) ctx.uiWorkspace.openSession(target.id)
        else ctx.uiWorkspace.startSession(workspaceId)
      }

      const startFinderSession = (workspaceId) => {
        closeFinder()
        ctx.uiWorkspace.startSession(workspaceId)
      }

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'workspace-search',
        order: 0,
        locale: NS,
        inject: () => ({ openFinder }),
      }, FindWorkspaceAction))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'workspace-search',
        order: 0,
        locale: NS,
        inject: () => ({
          hooks: { finderOpen },
          closeFinder,
          openFinderWorkspace,
          startFinderSession,
        }),
      }, WorkspaceFinder))

      // Shadow the shipped picker (priority 0) so the New Session chip opens a
      // searchable list. The shipped registration stays loaded, so directory
      // flows and the sidebar browser keep working; this entry declares no
      // child slots and adopts a directory through `uiWorkspace` instead.
      ctx.slots.inject('conversation.hero.workspace', () => {
        try {
          return ctx.slots.register({
            name: 'conversation.hero.workspace',
            priority: -1,
            locale: NS,
            inject: () => ({
              pickDirectory,
              createWorkspace: input => ctx.workspaces.create(input),
            }),
          }, SearchableWorkspacePicker)
        } catch (error) {
          console.warn('search-workspace: could not register the searchable workspace picker', error)
          return () => {}
        }
      })
    }

    return {
      inject,
      apply,
      __internal: { workspaceDisplayTitle, distinguishingPathSuffixes, workspaceRows, filterRows },
    }
  },
})
