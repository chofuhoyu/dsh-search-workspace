/**
 * dsh-search-workspace client half.
 *
 * Two surfaces, one workspace index:
 *
 * - `sidebar.workspaces` — this registration shadows the shipped browser at
 *   priority -1. It keeps the shipped shell contract (section header, search,
 *   workspace groups, session rows, add workspace) and makes the search box
 *   filter *workspaces* by name or path as well as sessions by title or
 *   content. The shipped registration stays loaded, so the `uiWorkspace`
 *   service, context menus, session dialogs, notices, and directory picker
 *   composition keep working. This entry declares no child slots (the shipped
 *   one owns them), so it renders its own rows and uses the shipped context
 *   menu factory for the per-session "..." menu.
 * - `conversation.hero.workspace` — the New Session workspace picker. This
 *   registration shadows the shipped picker at priority -1 and adds a search
 *   field while keeping direct selection and adopting a picked directory
 *   through the shipped `uiWorkspace` service.
 *
 * Styles use only the `--dsw-*` theme tokens; controls come from the shipped
 * UI primitives so both surfaces match the host chrome in light and dark.
 */
window.__ModuleLoader__.load({
  id: 'dsh-search-workspace',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const {
      Button, IconArchiveOffOutlineRegular, IconCheckOutlineRegular, IconChevronsUpDownOutlineRegular,
      IconClockOutlineRegular, IconCloseFillRegular, IconEditOutlineRegular, IconEllipsisOutlineRegular,
      IconFolderCloseRegular, IconFolderOpenRegular, IconNewChatOutlineRegular, IconPinFillRegular,
      IconPlusOutlineRegular, IconProjectAddOutlineRegular, IconQueueOutlineRegular,
      IconSearchOutlineRegular, IconSlidersTwoOutlineRegular, IconTrashOutlineRegular,
      IconTriangleRightFillRegular, Input, Menu, Modal, StateDot, Tooltip, relativeTime,
      useDismissOnOutsidePointer,
    } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement
    const { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } = React

    /** Client locale namespace owned by this plugin (extra browser copy). */
    const NS = 'workspaceSearch'
    /** The shipped locale namespace whose copy the browser reuses. */
    const WORKSPACE_NS = 'workspace'
    /** Value the Host stores for the automatic first-use workspace title. */
    const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'
    /** Design cap for the anchored picker, in px. */
    const POPOVER_MAX_HEIGHT = 380
    /** Picker width, clamped to the viewport. */
    const POPOVER_WIDTH = 340
    /** Debounce for the Host content search. */
    const SEARCH_DEBOUNCE_MS = 250
    /** Delay after expanding the sidebar before focusing the search input. */
    const EXPAND_SLIDE_MS = 300

    const ZH = {
      'find.action': '查找工作区',
      'find.blocked': '请先关闭当前对话框',
      'find.search.placeholder': '搜索工作区或会话',
      'find.search.workspaces': '匹配的工作区',
      'find.search.sessions': '匹配的会话',
      'find.search.none': '没有匹配的工作区或会话',
      'find.empty.workspaces': '暂无工作区',
      'find.loading': '正在加载…',
      'find.add.failed': '无法添加工作区',
      'find.picker.placeholder': '搜索工作区',
      'find.picker.noMatch': '没有匹配的工作区',
      'find.picker.loading': '正在加载工作区…',
      'find.picker.add': '添加工作区…',
      'find.picker.createFailed': '无法添加该工作区',
    }

    const EN = {
      'find.action': 'Find workspace',
      'find.blocked': 'Close the current dialog first',
      'find.search.placeholder': 'Search workspaces or sessions',
      'find.search.workspaces': 'Matching workspaces',
      'find.search.sessions': 'Matching sessions',
      'find.search.none': 'No matching workspace or session',
      'find.empty.workspaces': 'No workspaces yet',
      'find.loading': 'Loading…',
      'find.add.failed': 'Could not add a workspace',
      'find.picker.placeholder': 'Search workspaces',
      'find.picker.noMatch': 'No matching workspace',
      'find.picker.loading': 'Loading workspaces…',
      'find.picker.add': 'Add workspace…',
      'find.picker.createFailed': 'Could not add that workspace',
    }

    const STYLES = `
.dsws-broot {
  --dsws-toolbar-height: 36px;
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.dsws-broot:not(.dsws-brail) {
  flex: none;
  max-height: 100cqh;
}

.dsws-broot:not(.dsws-brail):has(.dsws-bsearch-open) {
  height: 100cqh;
}

.dsws-bheader {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: var(--dsws-toolbar-height);
  padding-left: var(--dsh-sidebar-row-padding, 12px);
  margin-bottom: 0;
  box-sizing: border-box;
  border-radius: var(--dsw-radius-md);
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-blabel {
  position: relative;
  left: -1px;
  flex: none;
  max-width: 45%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  line-height: 20px;
}

.dsws-blabel-hidden {
  max-width: 0;
  margin-right: -4px;
  opacity: 0;
  visibility: hidden;
}

.dsws-bsearch {
  flex: none;
  display: flex;
  align-items: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  box-sizing: border-box;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
}

.dsws-bsearch-open {
  flex: 1;
  width: auto;
  height: 32px;
  margin-left: 0;
  padding: 0 4px 0 0;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-caption);
}

.dsws-bicon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}

.dsws-bicon:focus-visible,
.dsws-bsearch-button:focus-visible,
.dsws-bsearch-clear:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

@media (hover: hover) {
  .dsws-bicon:hover {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}

.dsws-bsearch-button {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.dsws-bsearch-open .dsws-bsearch-button {
  width: 26px;
  height: 30px;
}

.dsws-binput {
  flex: 1;
  width: 0;
  min-width: 0;
  margin-left: -2px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
}

.dsws-binput::placeholder {
  color: var(--dsw-alias-label-tertiary);
}

.dsws-bsearch-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}

.dsws-bactions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
}

.dsws-bactions-hidden {
  display: none;
}

.dsws-brail {
  flex: none;
  align-items: center;
}

.dsws-brailrow {
  display: flex;
  justify-content: center;
  margin-bottom: 8px;
}

.dsws-brail .dsws-bicon,
.dsws-brail .dsws-bsearch-button {
  width: 36px;
  height: 36px;
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-primary);
}

.dsws-blistarea {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 8px;
}

.dsws-bmessage {
  flex: none;
  margin: 0 12px 4px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dsws-bmessage-error {
  color: var(--dsw-alias-state-error-primary);
}

.dsws-bsection {
  display: flex;
  flex-direction: column;
}

.dsws-bsectionlabel {
  padding: 8px 12px 4px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-brow {
  display: flex;
  align-items: center;
  gap: var(--dsh-sidebar-label-gap, 6px);
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  padding-inline-start: calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px) + var(--dsws-indent, 0px));
  box-sizing: border-box;
  border: none;
  border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  background-clip: padding-box;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  user-select: none;
}

@media (hover: hover) {
  .dsws-brow:hover {
    background-color: var(--dsw-alias-interactive-bg-hover);
  }
}

.dsws-brow:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}

.dsws-bworkspace {
  min-height: 32px;
}

.dsws-bcurrent .dsws-bslot {
  color: var(--dsw-alias-brand-primary);
}

.dsws-bsession {
  height: 32px;
  --dsws-indent: 16px;
}

.dsws-bsession.dsws-bselected {
  background-color: var(--dsw-alias-interactive-bg-hover);
}

.dsws-bslot {
  flex: none;
  width: 16px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-bchevron {
  flex: none;
  width: 12px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-barrow {
  transition: transform 150ms var(--ds-ease-in-out);
}

.dsws-barrow-open {
  transform: rotate(90deg);
}

.dsws-btitle {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsws-bcount {
  flex: none;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-brest {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-btime {
  flex: none;
  font-size: 10px;
  line-height: 16px;
}

.dsws-bpin {
  flex: none;
  color: var(--dsw-alias-label-caption);
}

.dsws-bactionsrow {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
}

@media (hover: hover) {
  .dsws-brow:hover .dsws-bactionsrow {
    opacity: 1;
  }
}

@media (hover: none) {
  .dsws-bactionsrow {
    opacity: 1;
  }
}

.dsws-brow:focus-within .dsws-bactionsrow {
  opacity: 1;
}

.dsws-barchived .dsws-btitle {
  color: var(--dsw-alias-label-caption);
}

.dsws-bempty {
  padding: 16px 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  text-align: center;
}

.dsws-bresult {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  min-height: 48px;
  padding: 4px calc(var(--dsh-sidebar-row-padding, 12px) - var(--dsh-sidebar-paint-inset, 3px));
  box-sizing: border-box;
  border: none;
  border-inline: var(--dsh-sidebar-paint-inset, 3px) solid transparent;
  border-radius: var(--dsw-radius-lg);
  background: transparent;
  background-clip: padding-box;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}

@media (hover: hover) {
  .dsws-bresult:hover {
    background-color: var(--dsw-alias-interactive-bg-hover);
  }

  .dsws-bresult:hover .dsws-bactionsrow {
    opacity: 1;
  }
}

.dsws-bresult-top {
  display: flex;
  align-items: center;
  gap: var(--dsh-sidebar-label-gap, 6px);
  min-width: 0;
}

.dsws-bresult-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  margin-left: 22px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsws-bresult-workspace {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsws-bresult-snippet {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsws-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.dsws-view-menu {
  min-width: 200px;
}

.dsws-dialog-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 7px 14px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  outline: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsws-dialog-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
}

.dsws-dialog-input:disabled {
  color: var(--dsw-alias-label-dimmed);
}

.dsws-dialog-error {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-error-primary);
}

.dsws-dialog-status {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
}

.dsws-dialog-delete:not(:disabled) {
  color: var(--dsw-alias-state-error-primary);
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

.dsws-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
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

.dsws-add:disabled {
  cursor: default;
  opacity: 0.6;
}
`

    // ------------------------------------------------------------- helpers

    /** Join truthy class names. */
    const cls = (...values) => values.filter(Boolean).join(' ')

    /** The label one Workspace shows for its stored title. */
    function workspaceDisplayTitle(title, localizedDefault) {
      return title === DEFAULT_WORKSPACE_DIRECTORY ? localizedDefault : title
    }

    /** Shortest trailing path segment run that tells same-titled Workspaces apart. */
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

    /** Project workspace items into the searchable picker row shape. */
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

    /** Split a query into lower-case tokens. */
    function queryTokens(query) {
      return String(query ?? '').trim().toLowerCase().split(/\s+/u).filter(Boolean)
    }

    /** Whether every token appears in at least one of the supplied texts. */
    function matchesTokens(tokens, ...texts) {
      if (tokens.length === 0) return true
      const haystacks = texts.map(text => String(text ?? '').toLowerCase())
      return tokens.every(token => haystacks.some(text => text.includes(token)))
    }

    /** Filter and rank picker rows; title matches lead path matches. */
    function filterRows(rows, query) {
      const tokens = queryTokens(query)
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

    /** Map the shipped pending-interaction union to the row presentation kind. */
    function pendingKind(kind) {
      return kind === 'approval' || kind === 'plan-review' || kind === 'question' ? kind : undefined
    }

    /** One session row's presentation facts. */
    function sessionNode(summary, status, pinned, archived) {
      return {
        id: summary.id,
        title: summary.blank ? '' : (summary.title?.trim() || summary.displayTitle || summary.id),
        blank: summary.blank,
        archived: archived.has(summary.id),
        pinned: !archived.has(summary.id) && pinned.has(summary.id),
        running: status?.running ?? summary.running === true,
        completed: status?.completionUnread === true,
        pendingInteraction: pendingKind(status?.pendingInteraction?.kind),
        updatedAt: summary.updatedAt ?? 0,
        cwd: summary.cwd,
      }
    }

    /** Build the visible session node map for the current list state. */
    function buildSessionNodes(list, statuses, archived, pinned, currentId, includeArchived) {
      const nodes = new Map()
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.origin === 'subagent') continue
        if (summary.blank && summary.id !== currentId) continue
        const isArchived = archived.has(summary.id)
        if (isArchived && !includeArchived) continue
        nodes.set(summary.id, sessionNode(summary, statuses.get(summary.id), pinned, archived))
      }
      return nodes
    }

    /** Stable row order: current blank, pinned, ordinary, archived. */
    function orderSessions(ids, nodes, orderByUpdated) {
      const rows = []
      for (const id of ids) {
        const node = nodes.get(id)
        if (node !== undefined) rows.push(node)
      }
      const rank = node => node.blank ? 0 : node.pinned ? 1 : node.archived ? 3 : 2
      rows.sort((left, right) => {
        const delta = rank(left) - rank(right)
        if (delta !== 0) return delta
        return orderByUpdated ? right.updatedAt - left.updatedAt : 0
      })
      return rows
    }

    /** State-dot presentation for one session node. */
    function statusState(node) {
      if (node.pendingInteraction !== undefined) return 'warning'
      if (node.running) return 'ongoing'
      if (node.completed) return 'done'
      return 'idle'
    }

    /** Localized status text for the row's screen-reader label. */
    function statusText(node, t) {
      switch (node.pendingInteraction) {
        case 'approval': return t('status.waitingApproval')
        case 'plan-review': return t('status.planReview')
        case 'question': return t('status.waitingAnswer')
        default: break
      }
      if (node.running) return t('status.running')
      if (node.completed) return t('status.completed')
      return t('status.idle')
    }

    /** Compact pending label that replaces the update time, or undefined. */
    function pendingTrailing(node, t) {
      switch (node.pendingInteraction) {
        case 'approval': return t('status.compact.approval')
        case 'plan-review': return t('status.compact.planReview')
        case 'question': return t('status.compact.answer')
        default: return undefined
      }
    }

    /** Localized compact relative time. */
    function timeLabel(updatedAt, now, t) {
      const { unit, n } = relativeTime(updatedAt, now)
      return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
    }

    // ---------------------------------------------------------- components

    /** The shipped per-session "..." menu trigger, guarded for a missing factory. */
    function SessionMenuButton({ node, title, renderFactorySlot, t }) {
      let button
      try {
        button = renderFactorySlot('contextMenu.button', {
          target: { kind: 'session', value: { sessionId: node.id, displayTitle: node.title } },
          label: t('actions.session.aria', { name: title }),
          className: 'dsws-bicon',
          size: 'sm',
        })
      } catch (error) {
        console.warn('search-workspace: could not render the session menu trigger', error)
        return null
      }
      if (button === null || button === undefined) return null
      return h('span', { className: 'dsws-bactionsrow', onClick: (event) => { event.stopPropagation() } }, button)
    }

    /** One top-level session row. */
    function SessionRow({ node, currentId, now, onOpen, renderFactorySlot, t }) {
      const selected = node.id === currentId
      const state = statusState(node)
      const compact = pendingTrailing(node, t)
      const title = node.blank ? t('session.new') : (node.title || t('session.untitled'))
      return h(
        'div',
        {
          className: cls('dsws-brow', 'dsws-bsession', selected && 'dsws-bselected', node.archived && 'dsws-barchived'),
          role: 'treeitem',
          'aria-selected': selected ? 'true' : 'false',
          'aria-description': node.archived ? t('toast.archivedNotOpenable') : undefined,
          tabIndex: 0,
          'data-row-key': `session:${node.id}`,
          onClick: () => { onOpen(node) },
          onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpen(node)
          },
        },
        h('span', { className: 'dsws-bslot' },
          !node.archived && !node.blank && state !== 'idle' ? h(StateDot, { state }) : null,
          !node.archived && !node.blank && state !== 'idle'
            ? h('span', { className: 'dsws-hidden' }, statusText(node, t))
            : null),
        h('span', { className: 'dsws-btitle' }, title),
        !node.blank
          ? h('span', { className: 'dsws-brest' },
            h('span', { className: 'dsws-btime' }, compact ?? timeLabel(node.updatedAt, now, t)),
            node.pinned ? h(IconPinFillRegular, { size: 12, className: 'dsws-bpin' }) : null)
          : null,
        !node.blank
          ? h(SessionMenuButton, { node, title, renderFactorySlot, t })
          : null,
      )
    }

    /** The workspace row's own rename/delete menu. */
    function WorkspaceMenu({ label, canRename, canDelete, onRename, onDelete, t }) {
      const [open, setOpen] = useState(false)
      if (!canRename && !canDelete) return null
      const items = []
      if (canRename) items.push({ id: 'rename', label: t('rename'), icon: h(IconEditOutlineRegular, { size: 16 }) })
      if (canDelete) {
        items.push({
          id: 'delete', label: t('delete.workspace'), icon: h(IconTrashOutlineRegular, { size: 16 }),
          danger: true, separatorBefore: true,
        })
      }
      return h(Menu, {
        open,
        onClose: () => { setOpen(false) },
        items,
        onSelect: (id) => {
          setOpen(false)
          if (id === 'rename') onRename()
          else if (id === 'delete') onDelete()
        },
        anchor: h(Tooltip, { label: t('actions.workspace.aria', { name: label }), side: 'bottom', align: 'end', delayMs: 500, portal: true },
          h('button', {
            type: 'button',
            className: 'dsws-bicon',
            'aria-label': t('actions.workspace.aria', { name: label }),
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            onClick: () => { setOpen(value => !value) },
          }, h(IconEllipsisOutlineRegular, { size: 16 }))),
        side: 'bottom',
        align: 'end',
        dense: true,
        portal: true,
        listClassName: 'dsws-view-menu',
      })
    }

    /** Archived visibility and ordering choices for the browser. */
    function ViewOptionsMenu({ includeArchived, orderByUpdated, onChange, t }) {
      const [open, setOpen] = useState(false)
      return h(Menu, {
        open,
        onClose: () => { setOpen(false) },
        items: [
          { id: 'hide-archived', label: t('viewOptions.hideArchived'), icon: h(IconArchiveOffOutlineRegular, { size: 16 }) },
          { id: 'show-archived', label: t('viewOptions.showArchived'), icon: h(IconQueueOutlineRegular, { size: 16 }) },
          { type: 'separator', id: 'order-separator' },
          { id: 'order-manual', label: t('orderBy.manual'), icon: h(IconChevronsUpDownOutlineRegular, { size: 16 }) },
          { id: 'order-updated', label: t('orderBy.updated'), icon: h(IconClockOutlineRegular, { size: 16 }) },
        ],
        selectedIds: [includeArchived ? 'show-archived' : 'hide-archived', orderByUpdated ? 'order-updated' : 'order-manual'],
        onSelect: (id) => {
          setOpen(false)
          if (id === 'hide-archived') onChange({ includeArchived: false })
          else if (id === 'show-archived') onChange({ includeArchived: true })
          else if (id === 'order-manual') onChange({ orderByUpdated: false })
          else if (id === 'order-updated') onChange({ orderByUpdated: true })
        },
        anchor: h(Tooltip, { label: t('viewOptions.label'), side: 'bottom', delayMs: 500, portal: true },
          h('button', {
            type: 'button',
            className: 'dsws-bicon',
            'aria-label': t('viewOptions.label'),
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            onClick: () => { setOpen(value => !value) },
          }, h(IconSlidersTwoOutlineRegular, { size: 16 }))),
        align: 'end',
        dense: true,
        portal: true,
        listClassName: 'dsws-view-menu',
      })
    }

    /** One workspace group header plus its session rows. */
    function WorkspaceGroupRow({
      group, expanded, expandable = true, sessions, currentGroup, startSession, openSession,
      onRename, onDelete, useWorkspaceAccess, renderFactorySlot, t, now,
    }) {
      const workspaceId = group.workspaceId
      const canCreate = useWorkspaceAccess(workspaceId, 'session/create')
      const canRename = useWorkspaceAccess(workspaceId, 'workspace/rename')
      const canDelete = useWorkspaceAccess(workspaceId, 'workspace/delete')
      const onToggle = () => { if (expandable) group.onToggle() }
      return h(
        'div',
        { className: 'dsws-bsection', 'data-group-key': group.key },
        h(
          'div',
          {
            className: cls('dsws-brow', 'dsws-bworkspace', currentGroup && 'dsws-bcurrent'),
            role: 'treeitem',
            'aria-expanded': expandable ? (expanded ? 'true' : 'false') : undefined,
            'data-row-key': `workspace:${group.key}`,
            tabIndex: 0,
            onClick: onToggle,
            onKeyDown: (event) => {
              if (event.target !== event.currentTarget) return
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onToggle()
            },
          },
          expandable
            ? h('span', { className: 'dsws-bchevron' },
              h(IconTriangleRightFillRegular, { size: 10, className: cls('dsws-barrow', expanded && 'dsws-barrow-open') }))
            : h('span', { className: 'dsws-bchevron' }),
          h('span', { className: 'dsws-bslot' },
            expanded ? h(IconFolderOpenRegular, { size: 16 }) : h(IconFolderCloseRegular, { size: 16 })),
          h('span', { className: 'dsws-btitle' }, group.label),
          h('span', { className: 'dsws-bcount' }, String(group.sessions.length)),
          h('span', { className: 'dsws-bactionsrow', onClick: (event) => { event.stopPropagation() } },
            canCreate
              ? h(Tooltip, {
                label: t('actions.newSession'), side: 'bottom', align: 'end', delayMs: 500, portal: true,
              }, h('button', {
                type: 'button',
                className: 'dsws-bicon',
                'aria-label': t('actions.newSession.aria', { name: group.label }),
                onClick: () => { startSession(workspaceId) },
              }, h(IconNewChatOutlineRegular, { size: 14 })))
              : null,
            h(WorkspaceMenu, {
              label: group.label,
              canRename,
              canDelete,
              onRename,
              onDelete,
              t,
            })),
        ),
        expanded && sessions.length > 0
          ? h('div', { role: 'group' },
            sessions.map(node => h(SessionRow, {
              key: node.id,
              node,
              currentId: group.currentId,
              now,
              onOpen: openSession,
              renderFactorySlot,
              t,
            })))
          : null,
      )
    }

    /** The Ungrouped bucket: sessions outside every workspace. */
    function UngroupedGroupRow({ group, expanded, onToggle, sessions, currentId, openSession, renderFactorySlot, t, now }) {
      return h(
        'div',
        { className: 'dsws-bsection', 'data-group-key': group.key },
        h('div', {
          className: 'dsws-brow',
          role: 'treeitem',
          'aria-expanded': expanded ? 'true' : 'false',
          'data-row-key': 'workspace:ungrouped',
          tabIndex: 0,
          onClick: onToggle,
          onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onToggle()
          },
        },
          h('span', { className: 'dsws-bchevron' },
            h(IconTriangleRightFillRegular, { size: 10, className: cls('dsws-barrow', expanded && 'dsws-barrow-open') })),
          h('span', { className: 'dsws-bslot' }, h(IconFolderCloseRegular, { size: 16 })),
          h('span', { className: 'dsws-btitle' }, t('group.ungrouped')),
          h('span', { className: 'dsws-bcount' }, String(sessions.length))),
        expanded && sessions.length > 0
          ? h('div', { role: 'group' },
            sessions.map(node => h(SessionRow, {
              key: node.id,
              node,
              currentId,
              now,
              onOpen: openSession,
              renderFactorySlot,
              t,
            })))
          : null,
      )
    }

    /** One flat search-result session row with its workspace label and snippet. */
    function SearchSessionRow({ node, workspace, snippet, currentId, onOpen, renderFactorySlot, t }) {
      const selected = node.id === currentId
      const state = statusState(node)
      const title = node.blank ? t('session.new') : (node.title || t('session.untitled'))
      return h(
        'div',
        {
          className: cls('dsws-bresult', node.archived && 'dsws-barchived'),
          role: 'treeitem',
          'aria-selected': selected ? 'true' : 'false',
          tabIndex: 0,
          'data-row-key': `session:${node.id}`,
          onClick: () => { onOpen(node) },
          onKeyDown: (event) => {
            if (event.target !== event.currentTarget) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpen(node)
          },
        },
        h('div', { className: 'dsws-bresult-top' },
          h('span', { className: 'dsws-bslot' },
            !node.archived && !node.blank && state !== 'idle' ? h(StateDot, { state }) : null),
          h('span', { className: 'dsws-btitle' }, title),
          h(SessionMenuButton, { node, title, renderFactorySlot, t })),
        h('div', { className: 'dsws-bresult-meta' },
          h('span', { className: 'dsws-bresult-workspace' }, workspace),
          snippet === undefined ? null : h('span', { className: 'dsws-bresult-snippet' }, snippet)),
      )
    }

    /** Workspace rename and removal dialogs. */
    function WorkspaceDialogs({ request, workspaces, renameWorkspace, deleteWorkspace, onClose, t }) {
      const composingRef = useRef(false)
      const renameTarget = request.action === 'rename' ? request : null
      const [renameDraft, setRenameDraft] = useState(request.displayTitle)
      const [renaming, setRenaming] = useState(false)
      const [renameError, setRenameError] = useState(undefined)
      const renameTrimmed = renameDraft.trim()
      const renameDuplicate = renameTarget !== null && renameTrimmed !== ''
        && workspaces.some(workspace => workspace.workspaceId !== renameTarget.workspaceId && workspace.title === renameTrimmed)
      const renameBlocked = renaming || renameTrimmed === ''
        || renameTarget === null || renameTrimmed === renameTarget.storedTitle || renameDuplicate
      const closeRename = () => {
        if (renaming) return
        onClose()
        setRenameError(undefined)
      }
      const confirmRename = () => {
        if (renameBlocked) return
        setRenaming(true)
        setRenameError(undefined)
        renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
          setRenaming(false)
          onClose()
        }).catch((reason) => {
          setRenaming(false)
          setRenameError(reason instanceof Error ? reason.message : String(reason))
        })
      }

      const deleteTarget = request.action === 'delete' ? request : null
      const [deleting, setDeleting] = useState(false)
      const [deleteError, setDeleteError] = useState(undefined)
      const closeDelete = () => {
        if (deleting) return
        onClose()
        setDeleteError(undefined)
      }
      const confirmDelete = () => {
        if (deleting || deleteTarget === null) return
        setDeleting(true)
        setDeleteError(undefined)
        deleteWorkspace(deleteTarget.workspaceId).then(() => {
          setDeleting(false)
          onClose()
        }).catch((reason) => {
          setDeleting(false)
          setDeleteError(reason instanceof Error ? reason.message : String(reason))
        })
      }

      return h(
        Fragment,
        null,
        h(Modal, {
          open: renameTarget !== null,
          onClose: closeRename,
          closeLabel: t('close'),
          title: t('rename.workspace.title'),
          footer: h(Fragment, null,
            h(Button, { variant: 'outline', disabled: renaming, onClick: closeRename }, t('cancel')),
            h(Button, { variant: 'primary', disabled: renameBlocked, onClick: confirmRename }, t('rename'))),
        },
        h('input', {
          className: 'dsws-dialog-input',
          value: renameDraft,
          'aria-label': t('field.workspaceName'),
          'data-modal-autofocus': '',
          disabled: renaming,
          onFocus: (event) => { event.target.select() },
          onChange: (event) => { setRenameDraft(event.target.value); setRenameError(undefined) },
          onCompositionStart: () => { composingRef.current = true },
          onCompositionEnd: () => { composingRef.current = false },
          onKeyDown: (event) => {
            if (event.key === 'Enter' && !composingRef.current) {
              event.preventDefault()
              confirmRename()
            }
          },
        }),
        renameDuplicate
          ? h('div', { className: 'dsws-dialog-error', role: 'alert' }, t('conflict.named', { name: renameTrimmed }))
          : null,
        renameError !== undefined
          ? h('div', { className: 'dsws-dialog-error', role: 'alert' }, renameError)
          : null),
        h(Modal, {
          open: deleteTarget !== null,
          onClose: closeDelete,
          closeLabel: t('close'),
          title: t('delete.workspace'),
          ...(deleteTarget === null ? {} : { description: t('delete.desc', { name: deleteTarget.displayTitle }) }),
          footer: h(Fragment, null,
            h(Button, { variant: 'outline', disabled: deleting, onClick: closeDelete }, t('cancel')),
            h(Button, {
              variant: 'outline', className: 'dsws-dialog-delete', disabled: deleting, onClick: confirmDelete,
            }, t('delete.workspace'))),
        },
        deleting ? h('div', { className: 'dsws-dialog-status', role: 'status' }, t('delete.pending')) : null,
        deleteError !== undefined ? h('div', { className: 'dsws-dialog-error', role: 'alert' }, deleteError) : null),
      )
    }

    /** The searchable browsing region that replaces the shipped browser. */
    function WorkspaceBrowser({
      wide, expandSidebar, useSectionScroller, useSessions, useSessionStatus, useWorkspaces, usePanelInfo,
      useWorkspaceAccess, renderFactorySlot, t, tExtra, useSearchRequest,
      openSession, startSession, addWorkspace, renameWorkspace, deleteWorkspace, searchSessions, searchResultLimit,
    }) {
      const section = useSectionScroller()
      const list = useSessions(state => state)
      const statuses = useSessionStatus(state => state)
      const snapshot = useWorkspaces(state => state)
      const panelActive = usePanelInfo(info => info.activePanelId !== null)
      const request = useSearchRequest(value => value)
      const workspaces = snapshot?.items ?? []
      const archived = useMemo(() => new Set(snapshot?.archivedSessionIds ?? []), [snapshot?.archivedSessionIds])
      const pinned = useMemo(() => new Set(snapshot?.pinnedSessionIds ?? []), [snapshot?.pinnedSessionIds])
      const defaultName = t('workspace.defaultName')
      const [query, setQuery] = useState('')
      const [searchExpanded, setSearchExpanded] = useState(false)
      const [focusOnExpand, setFocusOnExpand] = useState(false)
      const [includeArchived, setIncludeArchived] = useState(false)
      const [orderByUpdated, setOrderByUpdated] = useState(false)
      const [expansion, setExpansion] = useState({})
      const [adding, setAdding] = useState(false)
      const [error, setError] = useState(undefined)
      const [notice, setNotice] = useState(undefined)
      const [dialogTarget, setDialogTarget] = useState(undefined)
      const [remote, setRemote] = useState({ query: '', status: 'idle', items: [], hasMore: false })
      const inputRef = useRef(null)
      const searchRootRef = useRef(null)
      const lastRequest = useRef(0)
      const now = Date.now()

      const currentId = panelActive
        ? undefined
        : Object.values(list.byId).find(summary => (summary.retainedBy?.mainView ?? 0) > 0)?.id

      const nodes = useMemo(
        () => buildSessionNodes(list, statuses, archived, pinned, currentId, includeArchived),
        [list, statuses, archived, pinned, currentId, includeArchived],
      )

      const groups = useMemo(() => {
        const result = workspaces.map(workspace => ({
          key: workspace.workspaceId,
          workspaceId: workspace.workspaceId,
          path: workspace.path,
          rawTitle: workspace.title,
          label: workspaceDisplayTitle(workspace.title, defaultName),
          sessions: orderSessions(workspace.sessionIds ?? [], nodes, orderByUpdated),
        }))
        const accounted = new Set(workspaces.flatMap(workspace => workspace.sessionIds ?? []))
        const ungroupedIds = list.ids.filter(id => nodes.has(id) && !accounted.has(id))
        const ungrouped = orderSessions(ungroupedIds, nodes, true)
        return { result, ungrouped }
      }, [workspaces, nodes, orderByUpdated, defaultName, list.ids])

      const currentGroupKey = useMemo(() => {
        if (currentId === undefined || !nodes.has(currentId)) return undefined
        const owner = workspaces.find(workspace => (workspace.sessionIds ?? []).includes(currentId))
        return owner === undefined ? 'ungrouped' : owner.workspaceId
      }, [currentId, nodes, workspaces])

      const ownerBySession = useMemo(() => {
        const owners = new Map()
        for (const group of groups.result) {
          for (const node of group.sessions) owners.set(node.id, group)
        }
        if (groups.ungrouped.length > 0) {
          const ungrouped = { key: 'ungrouped', label: t('group.ungrouped') }
          for (const node of groups.ungrouped) owners.set(node.id, ungrouped)
        }
        return owners
      }, [groups, t])

      const isExpanded = useCallback(
        key => expansion[key] ?? key === currentGroupKey,
        [expansion, currentGroupKey],
      )

      const setGroupExpanded = useCallback((key, value) => {
        setExpansion(previous => ({ ...previous, [key]: value }))
      }, [])

      useEffect(() => {
        if (currentGroupKey === undefined) return
        setExpansion(previous => previous[currentGroupKey] === undefined
          ? { ...previous, [currentGroupKey]: true }
          : previous)
      }, [currentGroupKey])

      const requestSearch = useCallback(() => {
        setSearchExpanded(true)
        setNotice(undefined)
        if (!wide) {
          setFocusOnExpand(true)
          expandSidebar()
          return
        }
        const timer = window.setTimeout(() => { inputRef.current?.focus() }, 0)
        return () => { window.clearTimeout(timer) }
      }, [wide, expandSidebar])

      useEffect(() => {
        if (request === lastRequest.current) return
        lastRequest.current = request
        requestSearch()
      }, [request, requestSearch])

      useEffect(() => {
        if (!wide) {
          setSearchExpanded(false)
          return
        }
        if (!focusOnExpand) return
        setSearchExpanded(true)
        const timer = window.setTimeout(() => {
          inputRef.current?.focus()
          setFocusOnExpand(false)
        }, EXPAND_SLIDE_MS)
        return () => { window.clearTimeout(timer) }
      }, [wide, focusOnExpand])

      useEffect(() => {
        if (!wide || !searchExpanded || query !== '') return
        const onPointerDown = (event) => {
          if (event.target instanceof Node && searchRootRef.current?.contains(event.target) === true) return
          setSearchExpanded(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        return () => { document.removeEventListener('pointerdown', onPointerDown) }
      }, [wide, searchExpanded, query])

      const changeQuery = (value) => {
        setQuery(value)
        setNotice(undefined)
        if (value !== '') setSearchExpanded(true)
      }

      const clearSearch = () => {
        setQuery('')
        if (wide) setSearchExpanded(false)
      }

      useEffect(() => {
        if (query.trim() === '') {
          setRemote({ query: '', status: 'idle', items: [], hasMore: false })
          return
        }
        const controller = new AbortController()
        setRemote({ query, status: 'loading', items: [], hasMore: false })
        const timer = window.setTimeout(() => {
          searchSessions(query, controller.signal).then((result) => {
            if (controller.signal.aborted) return
            setRemote({ query, status: 'ready', items: result.items, hasMore: result.hasMore })
          }).catch(() => {
            if (controller.signal.aborted) return
            setRemote({ query, status: 'error', items: [], hasMore: false })
          })
        }, SEARCH_DEBOUNCE_MS)
        return () => {
          window.clearTimeout(timer)
          controller.abort()
        }
      }, [query, searchSessions])

      const tokens = queryTokens(query)
      const searching = tokens.length > 0
      const contentMatches = remote.status === 'ready' && remote.query === query ? remote.items : []
      const workspaceMatches = useMemo(() => {
        if (!searching) return []
        return groups.result.filter(group => matchesTokens(tokens, group.label, group.path))
      }, [searching, groups, tokens])
      const matchedWorkspaceIds = useMemo(
        () => new Set(workspaceMatches.map(group => group.key)),
        [workspaceMatches],
      )
      const sessionMatches = useMemo(() => {
        if (!searching) return []
        const found = new Map()
        for (const group of groups.result) {
          for (const node of group.sessions) {
            if (node.blank || matchedWorkspaceIds.has(group.key)) continue
            if (matchesTokens(tokens, node.title)) found.set(node.id, { node, group, snippet: undefined })
          }
        }
        for (const node of groups.ungrouped) {
          if (node.blank) continue
          if (matchesTokens(tokens, node.title) && !found.has(node.id)) {
            found.set(node.id, { node, group: undefined, snippet: undefined })
          }
        }
        for (const item of contentMatches) {
          const owner = ownerBySession.get(item.sessionId)
          if (owner === undefined) continue
          if (matchedWorkspaceIds.has(owner.key)) continue
          const node = nodes.get(item.sessionId)
          if (node === undefined) continue
          found.set(item.sessionId, { node, group: owner.key === 'ungrouped' ? undefined : owner, snippet: item.snippet })
        }
        return [...found.values()]
      }, [searching, groups, matchedWorkspaceIds, ownerBySession, contentMatches, nodes, tokens])

      const busy = adding
      const phase = snapshot?.phase ?? list.phase
      const loading = phase === 'pending'

      const openSessionRow = (node) => {
        if (node.archived) {
          setNotice(t('toast.archivedNotOpenable'))
          return
        }
        setQuery('')
        setNotice(undefined)
        openSession(node.id)
      }

      const startSessionRow = (workspaceId) => {
        setQuery('')
        setNotice(undefined)
        startSession(workspaceId)
      }

      const handleAdd = async () => {
        if (busy) return
        setAdding(true)
        setError(undefined)
        try {
          await addWorkspace()
          setSearchExpanded(false)
          setQuery('')
        } catch (reason) {
          setError(`${tExtra('find.add.failed')}: ${reason instanceof Error ? reason.message : String(reason)}`)
        } finally {
          setAdding(false)
        }
      }

      const requestRename = (group) => {
        setDialogTarget({
          action: 'rename',
          workspaceId: group.workspaceId,
          displayTitle: group.label,
          storedTitle: group.rawTitle,
        })
      }
      const requestDelete = (group) => {
        setDialogTarget({
          action: 'delete',
          workspaceId: group.workspaceId,
          displayTitle: group.label,
          storedTitle: group.rawTitle,
        })
      }

      const viewMenu = h(ViewOptionsMenu, {
        includeArchived,
        orderByUpdated,
        onChange: (patch) => {
          if (patch.includeArchived !== undefined) setIncludeArchived(patch.includeArchived)
          if (patch.orderByUpdated !== undefined) setOrderByUpdated(patch.orderByUpdated)
        },
        t,
      })

      const addButton = (size) => h(Tooltip, {
        label: t('workspace.add'), side: 'bottom', delayMs: 500, portal: true,
      }, h('button', {
        type: 'button',
        className: 'dsws-bicon',
        'aria-label': t('workspace.add'),
        disabled: busy,
        onClick: () => { void handleAdd() },
      }, h(IconProjectAddOutlineRegular, { size })))

      const renderNormalList = () => {
        if (loading && groups.result.length === 0 && groups.ungrouped.length === 0) {
          return h('div', { className: 'dsws-bempty' }, tExtra('find.loading'))
        }
        if (groups.result.length === 0 && groups.ungrouped.length === 0) {
          return h('div', { className: 'dsws-bempty' }, tExtra('find.empty.workspaces'))
        }
        const rows = []
        for (const group of groups.result) {
          const expanded = isExpanded(group.key)
          rows.push(h(WorkspaceGroupRow, {
            key: group.key,
            group: {
              ...group,
              currentId,
              onToggle: () => { setGroupExpanded(group.key, !expanded) },
            },
            expanded,
            sessions: group.sessions,
            currentGroup: currentGroupKey === group.key,
            startSession: startSessionRow,
            openSession: openSessionRow,
            onRename: () => { requestRename(group) },
            onDelete: () => { requestDelete(group) },
            useWorkspaceAccess,
            renderFactorySlot,
            t,
            now,
          }))
        }
        if (groups.ungrouped.length > 0) {
          const expanded = isExpanded('ungrouped')
          rows.push(h(UngroupedGroupRow, {
            key: 'ungrouped',
            group: { key: 'ungrouped' },
            expanded,
            onToggle: () => { setGroupExpanded('ungrouped', !expanded) },
            sessions: groups.ungrouped,
            currentId,
            openSession: openSessionRow,
            renderFactorySlot,
            t,
            now,
          }))
        }
        return rows
      }

      const renderSearch = () => {
        const rows = []
        if (workspaceMatches.length > 0) {
          rows.push(h('div', { className: 'dsws-bsectionlabel', key: 'label-workspaces' }, tExtra('find.search.workspaces')))
          for (const group of workspaceMatches) {
            rows.push(h(WorkspaceGroupRow, {
              key: group.key,
              group: {
                ...group,
                currentId,
                onToggle: () => {},
              },
              expanded: true,
              expandable: false,
              sessions: group.sessions,
              currentGroup: currentGroupKey === group.key,
              startSession: startSessionRow,
              openSession: openSessionRow,
              onRename: () => { requestRename(group) },
              onDelete: () => { requestDelete(group) },
              useWorkspaceAccess,
              renderFactorySlot,
              t,
              now,
            }))
          }
        }
        if (sessionMatches.length > 0) {
          rows.push(h('div', { className: 'dsws-bsectionlabel', key: 'label-sessions' }, tExtra('find.search.sessions')))
          for (const match of sessionMatches) {
            rows.push(h(SearchSessionRow, {
              key: match.node.id,
              node: match.node,
              workspace: match.group === undefined ? t('group.ungrouped') : match.group.label,
              snippet: match.snippet,
              currentId,
              onOpen: openSessionRow,
              renderFactorySlot,
              t,
            }))
          }
        }
        if (rows.length === 0 && remote.status !== 'loading') {
          rows.push(h('div', { className: 'dsws-bempty', key: 'empty' }, tExtra('find.search.none')))
        }
        if (remote.status === 'error') {
          rows.push(h('div', { className: 'dsws-bempty', key: 'unavailable' }, t('search.unavailable')))
        }
        if (remote.status === 'loading' && rows.length === 0) {
          rows.push(h('div', { className: 'dsws-bempty', key: 'loading' }, t('search.pending')))
        }
        if (remote.hasMore) {
          rows.push(h('div', { className: 'dsws-bempty', key: 'more' }, t('search.hasMore', { n: searchResultLimit })))
        }
        return rows
      }

      const header = h(
        'div',
        { className: 'dsws-bheader' },
        h('span', { className: cls('dsws-blabel', searchExpanded && 'dsws-blabel-hidden') }, t('section.workspaces')),
        h('div', {
          ref: searchRootRef,
          className: cls('dsws-bsearch', searchExpanded && 'dsws-bsearch-open'),
          onClick: () => { if (!searchExpanded) requestSearch() },
        },
          h('button', {
            type: 'button',
            className: 'dsws-bsearch-button',
            'aria-label': t('search.sessions.aria'),
            'aria-expanded': searchExpanded,
            onClick: (event) => {
              event.stopPropagation()
              if (searchExpanded) {
                inputRef.current?.focus()
                return
              }
              requestSearch()
            },
          }, h(IconSearchOutlineRegular, { size: searchExpanded ? 11 : 14 })),
          h('input', {
            ref: inputRef,
            className: 'dsws-binput',
            type: 'text',
            placeholder: tExtra('find.search.placeholder'),
            maxLength: 200,
            value: query,
            tabIndex: searchExpanded ? 0 : -1,
            'aria-label': tExtra('find.search.placeholder'),
            onChange: (event) => { changeQuery(event.target.value) },
            onKeyDown: (event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              clearSearch()
              inputRef.current?.blur()
            },
          }),
          searchExpanded
            ? h('button', {
              type: 'button',
              className: 'dsws-bsearch-clear',
              'aria-label': t('search.clear'),
              onClick: (event) => {
                event.stopPropagation()
                clearSearch()
              },
            }, h(IconCloseFillRegular, { size: 12 }))
            : null),
        h('div', { className: cls('dsws-bactions', searchExpanded && 'dsws-bactions-hidden') },
          viewMenu,
          addButton(16)),
      )

      const rail = h(
        'div',
        { className: 'dsws-broot dsws-brail' },
        h('div', { className: 'dsws-brailrow' },
          h(Tooltip, { label: t('search.sessions.aria'), side: 'right', portal: true },
            h('button', {
              type: 'button',
              className: 'dsws-bsearch-button',
              'aria-label': t('search.sessions.aria'),
              onClick: () => { requestSearch() },
            }, h(IconSearchOutlineRegular, { size: 18 })))),
        h('div', { className: 'dsws-brailrow' }, addButton(18)),
      )

      if (!wide) return rail

      return h(
        'div',
        { className: 'dsws-broot' },
        header,
        error !== undefined ? h('div', { className: 'dsws-bmessage dsws-bmessage-error', role: 'alert' }, error) : null,
        notice !== undefined ? h('div', { className: 'dsws-bmessage' }, notice) : null,
        h(
          'div',
          {
            ref: section.bindScrollerRef,
            className: 'dsws-blistarea',
            role: 'tree',
            'aria-label': t('section.workspaces'),
            'data-sidebar-list-area': '',
          },
          searching ? renderSearch() : renderNormalList(),
        ),
        dialogTarget !== undefined
          ? h(WorkspaceDialogs, {
            key: `${dialogTarget.action}/${dialogTarget.workspaceId}`,
            request: dialogTarget,
            workspaces,
            renameWorkspace,
            deleteWorkspace,
            onClose: () => { setDialogTarget(undefined) },
            t,
          })
          : null,
      )
    }

    /** The New Session picker: an anchored popover with a search field. */
    function WorkspaceOption({ id, row, active, selected, showPath, count, onActivate, onHover }) {
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
        h('span', { className: 'dsws-row-icon' }, h(IconFolderCloseRegular, { size: 16 })),
        h(
          'span',
          { className: 'dsws-row-main' },
          h('span', { className: 'dsws-row-title' }, row.title),
          showPath ? h('span', { className: 'dsws-row-path' }, row.path) : null,
        ),
        !showPath && row.suffix !== undefined ? h('span', { className: 'dsws-row-suffix' }, row.suffix) : null,
        count !== undefined && count > 0
          ? h('span', { className: 'dsws-row-check' }, String(count))
          : null,
        selected ? h('span', { className: 'dsws-row-check' }, h(IconCheckOutlineRegular, { size: 14 })) : null,
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

    /** The New Session picker: anchored popover with a search field. */
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
          setError(`${t('find.picker.createFailed')}: ${reason instanceof Error ? reason.message : String(reason)}`)
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
          { ref: popoverRef, className: 'dsws-popover', role: 'presentation' },
          h(Input, {
            ref: inputRef,
            className: 'dsws-field',
            icon: h(IconSearchOutlineRegular, { size: 16 }),
            placeholder: t('find.picker.placeholder'),
            value: query,
            maxLength: 200,
            autoComplete: 'off',
            spellCheck: false,
            'aria-label': t('find.picker.placeholder'),
            'aria-controls': 'dsws-picker-list',
            'aria-activedescendant': activeRow === undefined ? undefined : `dsws-picker-option-${active}`,
            onChange: (event) => { setQuery(event.target.value) },
            onKeyDown,
          }),
          error === undefined ? null : h('div', { className: 'dsws-error', role: 'alert' }, error),
          pending && empty
            ? h('div', { className: 'dsws-status', role: 'status' }, t('find.picker.loading'))
            : null,
          !pending && empty
            ? h('div', { className: 'dsws-status', role: 'status' }, t('find.picker.noMatch'))
            : null,
          h(
            'div',
            { ref: listRef, id: 'dsws-picker-list', className: 'dsws-list', role: 'listbox', 'aria-label': t('find.picker.placeholder') },
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
              h('span', { className: 'dsws-row-icon' }, h(IconPlusOutlineRegular, { size: 16 })),
              h('span', null, t('find.picker.add')),
            ),
          ),
        ),
        document.body,
      )
    }

    // ------------------------------------------------------------- plugin

    /** Required client services. */
    const inject = ['slots', 'locale', 'shortcuts', 'uiWorkspace', 'workspaces', 'sessions']

    /**
     * Register the searchable browser and picker once their parent slots are
     * declared.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const searchRequest = { value: 0, listeners: new Set() }
      const searchRequestSource = {
        getSnapshot: () => searchRequest.value,
        subscribe: (listener) => {
          searchRequest.listeners.add(listener)
          return () => { searchRequest.listeners.delete(listener) }
        },
      }
      const requestBrowserSearch = () => {
        searchRequest.value += 1
        for (const listener of [...searchRequest.listeners]) listener()
      }

      ctx.effect(() => {
        const element = document.createElement('style')
        element.setAttribute('data-dsh-plugin', 'dsh-search-workspace')
        element.textContent = STYLES
        document.head.appendChild(element)
        return () => { element.remove() }
      }, 'search-workspace: styles')

      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'search-workspace: dictionaries')

      ctx.effect(() => {
        try {
          return ctx.shortcuts.register({
            id: 'workspace.search',
            label: () => t('find.action'),
            aliases: ['find workspace', 'search workspace', 'switch workspace'],
            // Web/Linux has no default: the browser only admits a small fixed
            // chord set, and the shortcut registry rejects any other default
            // for that profile. The command stays bindable from Settings.
            defaults: {
              'desktop:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
              'desktop:windows': { code: 'KeyK', modifiers: ['primary', 'shift'] },
              'desktop:linux': { code: 'KeyK', modifiers: ['primary', 'shift'] },
              'web:macos': { code: 'KeyK', modifiers: ['primary', 'shift'] },
              'web:windows': { code: 'KeyK', modifiers: ['primary', 'shift'] },
            },
            regions: ['page', 'editable'],
            modals: ['sidebar'],
            resolve: (context) => {
              if (context.modal !== null && context.modal !== 'sidebar') {
                return { status: 'blocked', reason: t('find.blocked') }
              }
              return { status: 'handled', run: requestBrowserSearch }
            },
          })
        } catch (error) {
          console.warn('search-workspace: could not register the browser search shortcut', error)
          return () => {}
        }
      }, 'search-workspace: browser search command')

      const pickDirectory = async () => {
        const bridge = globalThis.__DSH_DIRECTORY_PICKER__
        if (bridge !== undefined && typeof bridge.pick === 'function') return await bridge.pick()
        return await ctx.uiWorkspace.pickDirectory()
      }

      const addWorkspace = async () => {
        const path = await pickDirectory()
        if (path === null || path === undefined) return
        const workspace = await ctx.workspaces.create({ path })
        ctx.uiWorkspace.startSession(workspace.workspaceId)
      }

      ctx.slots.inject('sidebar.workspaces', () => {
        try {
          return ctx.slots.register({
            name: 'sidebar.workspaces',
            priority: -1,
            locale: WORKSPACE_NS,
            inject: () => ({
              tExtra: t,
              hooks: { searchRequest: searchRequestSource },
              openSession: (sessionId) => { ctx.uiWorkspace.openSession(sessionId) },
              startSession: (workspaceId) => { ctx.uiWorkspace.startSession(workspaceId) },
              addWorkspace,
              renameWorkspace: async (workspaceId, title) => { await ctx.workspaces.rename(workspaceId, title) },
              deleteWorkspace: async (workspaceId) => { await ctx.workspaces.delete(workspaceId) },
              searchSessions: async (query, signal) => {
                const result = await ctx.sessions.search(query, signal)
                if (!result.ok) throw new Error(result.error.message)
                return result.value
              },
              searchResultLimit: ctx.sessions.searchResultLimit,
            }),
          }, WorkspaceBrowser)
        } catch (error) {
          console.warn('search-workspace: could not register the searchable browser', error)
          return () => {}
        }
      })

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
      __internal: {
        workspaceDisplayTitle, distinguishingPathSuffixes, workspaceRows, filterRows,
        queryTokens, matchesTokens, sessionNode, buildSessionNodes, orderSessions,
      },
    }
  },
})
