// Read-only, route-scoped detection. This is not a public-network security audit.
// Schema: https://github.com/tailscale/tailscale/blob/main/ipn/serve.go
export function inspectFunnelExposure(value, port, dnsName = null) {
  const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  const endpoints = new Set()
  let uncertain = false
  const configs = []
  const visit = (config, depth = 0) => {
    if (!object(config) || depth > 2) { uncertain = true; return }
    configs.push(config)
    if (config.Foreground != null) {
      if (!object(config.Foreground)) uncertain = true
      else for (const child of Object.values(config.Foreground)) visit(child, depth + 1)
    }
  }
  visit(value === null ? {} : value)
  const authority = (v) => {
    if (!/^[a-z0-9.-]+:\d+$/i.test(v)) { uncertain = true; return null }
    return v.toLowerCase()
  }
  const targets = new Set()
  for (const config of configs) {
    if (config.AllowFunnel == null) continue
    if (!object(config.AllowFunnel)) { uncertain = true; continue }
    for (const [hostPort, enabled] of Object.entries(config.AllowFunnel)) {
      if (typeof enabled !== 'boolean') uncertain = true
      if (enabled === true) {
        const normalized = authority(hostPort)
        if (normalized) targets.add(normalized)
      }
    }
  }
  const harness = (target) => {
    if (typeof target !== 'string') return false
    try {
      const url = new URL(target.includes('://') ? target : `http://${target}`)
      return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === String(port)
    } catch { return false }
  }
  for (const config of configs) {
    if (config.Web != null && !object(config.Web)) uncertain = true
    else for (const [hostPort, server] of Object.entries(config.Web ?? {})) {
      if (!object(server) || !object(server.Handlers)) { uncertain = true; continue }
      for (const handler of Object.values(server.Handlers)) {
        if (!object(handler)) { uncertain = true; continue }
        if (targets.has(hostPort.toLowerCase()) && harness(handler.Proxy)) endpoints.add(hostPort)
      }
    }
    if (config.TCP != null && !object(config.TCP)) uncertain = true
    else for (const [listenPort, handler] of Object.entries(config.TCP ?? {})) {
      if (!object(handler)) { uncertain = true; continue }
      if (!harness(handler.TCPForward)) continue
      for (const target of targets) if (target.endsWith(`:${listenPort}`)) endpoints.add(target)
    }
  }
  return { state: endpoints.size ? 'detected' : uncertain ? 'unknown' : 'not-detected', endpoints: [...endpoints], defaultEntryPublic: dnsName !== null && targets.has(`${dnsName.toLowerCase()}:443`) }
}
