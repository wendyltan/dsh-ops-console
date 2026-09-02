import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const ready = { ok: true, tailscaleRunning: true, serveActive: true, dnsName: 'h.example.ts.net', exposure: { state: 'not-detected' }, invitation: { url: 'https://h.example.ts.net/', qrSvg: '<svg></svg>' } }
function render({ access = ready, trust = { ok: true, tailnetTrusted: true, pendingRestart: false }, local = true, error = null, loading = false } = {}) {
  let index = 0, plugin, root
  const states = [{ data: access, loading, error }, { data: trust, loading, error: null }, { data: { local, contractVersion: 3 }, loading: false, error: null }]
  const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: (initial) => [index < 3 ? states[index++] : (index++, initial), () => {}], useEffect: () => {}, useCallback: (fn) => fn }
  new Function('window', source)({ __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => React) } } })
  plugin.apply({ slots: { inject: (_, fn) => fn(), register: (_, fn) => { root = fn() } } })
  const nodes = [], texts = []
  function walk(node) {
    if (node == null || node === false) return
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node !== 'object') { texts.push(String(node)); return }
    if (typeof node.type === 'function') return walk(node.type(node.props))
    nodes.push(node); walk(node.props.children)
  }
  walk(root)
  return { nodes, text: texts.join(' '), buttons: nodes.filter((n) => n.type === 'button'), images: nodes.filter((n) => n.type === 'img') }
}
assert.equal(render().images.length, 1)
const partial = render({ trust: { ok: true, tailnetTrusted: false, pendingRestart: true } })
assert.match(partial.text, /继续完成设置/)
assert.equal(partial.images.length, 0)
assert.ok(partial.buttons.some((n) => n.props.children.flat(Infinity).includes('继续完成设置') && !n.props.disabled))
assert.doesNotMatch(render({ trust: { ok: true, tailnetTrusted: true, pendingRestart: true } }).text, /继续完成设置/)
assert.match(render({ trust: { ok: true, tailnetTrusted: true, pendingRestart: true } }).text, /仅刷新网页无效/)
const exposed = render({ access: { ...ready, exposure: { state: 'detected', endpoints: ['h.example.ts.net:443'] } } })
assert.match(exposed.text, /公网 Funnel 配置/)
assert.equal(exposed.images.length, 0)
assert.equal(render({ access: { ...ready, exposure: { state: 'unknown' } } }).images.length, 0)
assert.doesNotMatch(render({ local: false }).text, /关闭远程访问|设置远程访问|更多访问设置/)
assert.equal(render({ error: 'network error' }).images.length, 0)
assert.equal(render({ access: null, trust: null, loading: true }).images.length, 0)
console.log('Client states: ready, partial retry, restart pending, public warning, unknown, remote permissions and loading passed')
