import { apply } from '/root/qq-bridge/plugins/qq-agent-presets/qq-tool-restrict.mjs'
let guard = null, denied = []
apply({ tools: { restrict: (o) => denied.push(...(o?.deny ?? [])), guard: (fn) => { guard = fn } } })
const decide = (name) => { const r = guard({ name }); return r === undefined ? 'allow' : 'DENY: ' + String(r).slice(0, 60) }
const cases = [
  ['mcp__snowluma__qq_send_message', 'allow'], ['compress', 'allow'],
  ['memory_read', 'allow'], ['memory_save', 'allow'],
  ['dev_something', 'DENY'], ['random_tool', 'DENY'],
]
let bad = 0
for (const [name, want] of cases) {
  const got = decide(name)
  const ok = want === 'allow' ? got === 'allow' : got.startsWith('DENY')
  if (!ok) bad++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(34)} → ${got}`)
}
console.log(bad === 0 ? 'ALL 6 PASS' : `${bad} FAILED`)
