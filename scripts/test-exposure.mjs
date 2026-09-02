import assert from 'node:assert/strict'
import { inspectFunnelExposure } from '../lib/exposure.js'

const hp = 'h.example.ts.net:443'
const web = { [hp]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:3080' } } } }
const inspect = (config) => inspectFunnelExposure(config, '3080')
assert.equal(inspect({ Web: web }).state, 'not-detected')
assert.equal(inspect({ Web: web, AllowFunnel: { [hp]: true } }).state, 'detected')
assert.equal(inspect({ Web: web, AllowFunnel: { [hp]: false } }).state, 'not-detected')
assert.equal(inspect({ Web: web, AllowFunnel: { 'other.example.ts.net:443': true } }).state, 'not-detected')
assert.equal(inspect({ Web: web, AllowFunnel: { 'h.example.ts.net:8443': true } }).state, 'not-detected')
assert.equal(inspect({ Web: { [hp]: { Handlers: { '/app': { Proxy: 'http://localhost:3080/' } } } }, AllowFunnel: { [hp]: true } }).state, 'detected')
assert.equal(inspect({ Web: { [hp]: { Handlers: { '/': { Proxy: 'http://127.0.0.1:9999' } } } }, AllowFunnel: { [hp]: true } }).state, 'not-detected')
assert.equal(inspect({ Foreground: { session: { Web: web, AllowFunnel: { [hp]: true } } } }).state, 'detected')
assert.equal(inspect({ Web: web, Foreground: { session: { AllowFunnel: { [hp]: true } } } }).state, 'detected')
assert.equal(inspect({ TCP: { '443': { TCPForward: '127.0.0.1:3080' } }, AllowFunnel: { [hp]: true } }).state, 'detected')
assert.equal(inspect({ TCP: { '443': { TCPForward: '[::1]:3080' } }, AllowFunnel: { [hp]: true } }).state, 'detected')
for (const config of [[], 'garbage', { AllowFunnel: [] }, { AllowFunnel: { [hp]: 'true' } }, { Web: [] }, { Foreground: { bad: [] } }]) assert.equal(inspect(config).state, 'unknown')
assert.equal(inspect(null).state, 'not-detected')
console.log('Funnel exposure: exact host/port, unrelated services, subpaths, foreground, TCP and unknown-state tests passed')
