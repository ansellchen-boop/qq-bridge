import fs from 'node:fs';
import zlib from 'node:zlib';

const SP = '/root/.dsh/sessions/--root-qq-bridge-state-agents--/session-c31ee33b-2561-4ca2-b84c-047c49343d67/session.v4.jsonl.zstd';
const TC = '/root/qq-bridge/state/tool-calls.jsonl';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cst = (t) => new Date((typeof t === 'number' ? t : Date.parse(t)) + 8 * 3600e3).toISOString().slice(11, 19);

function decode() {
  const buf = fs.readFileSync(SP);
  const idx = [];
  for (let i = 0; i + 4 <= buf.length; i++) if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) idx.push(i);
  let text = '';
  for (let k = 0; k < idx.length; k++) { const end = k + 1 < idx.length ? idx[k + 1] : buf.length; try { text += zlib.zstdDecompressSync(buf.subarray(idx[k], end)).toString('utf8'); } catch {} }
  const objs = [];
  for (const l of text.split('\n')) { if (!l.trim()) continue; try { objs.push(JSON.parse(l)); } catch {} }
  return { objs, bytes: buf.length };
}

function sends(sinceIso) {
  const raw = fs.readFileSync(TC, 'utf8');
  const out = [];
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (j.type !== 'call' || !/qq_send_message$/.test(String(j.tool))) continue;
    if (sinceIso && j.time < sinceIso) continue;
    let a; try { a = JSON.parse(j.args); } catch { a = {}; }
    for (const m of (Array.isArray(a?.messages) ? a.messages : [])) out.push({ time: j.time, text: String(m) });
  }
  return out;
}

console.log('[monitor] 起點 ' + cst(Date.now()) + '（等 turn 159 帶新卡）');
let injTime = null;
for (let i = 0; i < 60; i++) {                       // 最多 ~20 分鐘
  const { objs, bytes } = decode();
  const turns = [...new Set(objs.map((o) => o.data?.turn).filter((t) => t != null))];
  const lastTurn = turns[turns.length - 1];
  const hit = objs.find((o) => o.type === 'user/message' && JSON.stringify(o).includes('别拿同一个字当开场拐杖'));
  if (hit) { injTime = new Date(hit.time).toISOString(); console.log('[' + cst(Date.now()) + '] ✅ 新卡已注入：seq=' + hit.seq + ' turn=' + (hit.data?.turn ?? '-') + ' time=' + cst(hit.time) + '（檔 ' + bytes + ' B）'); break; }
  console.log('[' + cst(Date.now()) + '] 尚未注入 | 最新 turn=' + lastTurn + ' | 檔 ' + bytes + ' B');
  await sleep(20000);
}
if (!injTime) { console.log('逾時，仍未看到新卡注入'); process.exit(0); }

// 等新 turn 發言（最多 12 分鐘）
for (let i = 0; i < 36; i++) {
  const s = sends(injTime);
  if (s.length >= 3) break;
  await sleep(20000);
}
const s = sends(injTime);
console.log('\n=== 新卡 turn 的發言（' + s.length + ' 條）===');
for (const x of s) console.log(cst(x.time) + '  [' + [...x.text][0] + ']  ' + x.text);
const dist = {};
for (const x of s) { const c = [...x.text][0]; dist[c] = (dist[c] || 0) + 1; }
console.log('\n首字分布：' + Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
const avg = s.length ? (s.reduce((n, x) => n + x.text.length, 0) / s.length).toFixed(1) : 0;
console.log('平均字數=' + avg);
