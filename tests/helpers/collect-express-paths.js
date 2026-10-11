/**
 * Collect registered route paths from an Express app (flat + nested routers).
 * @param {import('express').Express} app
 * @returns {Set<string>}
 */
export function collectExpressPaths(app) {
  /** @type {Set<string>} */
  const paths = new Set()

  /** @param {import('express').Router['stack']} stack @param {string} prefix */
  function walk(stack, prefix = '') {
    for (const layer of stack || []) {
      if (layer.route?.path) {
        const routePath = layer.route.path
        const segments = Array.isArray(routePath) ? routePath : [routePath]
        for (const segment of segments) {
          paths.add(`${prefix}${segment}`)
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const mount = layer.regexp?.fast_slash
          ? ''
          : layer.regexp?.source
            ?.replace('^\\/', '/')
            ?.replace('\\/?(?=\\/|$)', '')
            ?.replace(/\\\//g, '/')
            ?.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param') || ''
        walk(layer.handle.stack, `${prefix}${mount}`)
      }
    }
  }

  walk(app._router?.stack)
  return paths
}
