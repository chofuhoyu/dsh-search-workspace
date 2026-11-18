/**
 * dsh-search-workspace host half.
 *
 * The feature is browser-only: the workspace registry, session list, navigation
 * service, and slot registry already exist in the Web client. This empty Host
 * plugin keeps the bundle row loadable and lets the client manifest attach the
 * browser half.
 */

/** Cordis plugin name used by Loader diagnostics. */
export const name = 'dsh-search-workspace'

/** Nothing to install on the Host side. */
export function apply() {}
