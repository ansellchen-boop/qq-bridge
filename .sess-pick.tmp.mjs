// 在最新 session 里抽取包含搜索痕迹的行，并打印标记附近的上下文。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const root = '/root/.dsh/sessions';
const cands = [];
for (const d of readdirSync(root)) {
  const dd = join(root, d);
  let st; try { st = statSync(dd); } catch { continue; }
  if (!st.isDirectory()) continue;
  for (const sd of readdirSync(dd)) {
    const sdd = join(dd, sd);
    let s2; try { s2 = statSync(sdd); } catch { continue; }
    if (!s2.isDirectory()) continue;
    for (const f of readdirSync(sdd)) {
      if (!f.endsWith('.zstd')) continue;
      const fp = join(sdd, f);
      cands.push([statSync(fp).mtimeMs, fp]);
    }
  }
}
cands.sort((a, b) => b[0] - a[0]);

function decodeMulti(buf) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const offsets = [];
  let idx = buf.indexOf(MAGIC, 0);
  while (idx >= 0) { offsets.push(idx); idx = buf.indexOf(MAGIC, idx + 4); }
  const parts = [];
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i];
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, end))); } catch {}
  }
  return Buffer.concat(parts).toString('utf8');
}

const text = decodeMulti(readFileSync(cands[0][1]));
const lines = text.split('\n').filter((l) => l.trim());
const NEEDLES = ['mcp__web-search-safe__web_search', '"channels"', '被反爬拦截', '换关键词重搜'];
const matched = [];
for (let i = 0; i < lines.length; i++) {
  if (NEEDLES.some((n) => lines[i].includes(n))) matched.push(i);
}
console.log('FILE:', cands[0][1]);
console.log('matched lines:', matched.join(','));
for (const i of matched.slice(-6)) {
  const raw = lines[i];
  const at = Math.max(...NEEDLES.map((n) => raw.indexOf(n)).filter((x) => x >= 0));
  const from = Math.max(0, at - 700);
  console.log(`\n===== #${i} len=${raw.length} =====`);
  console.log(raw.slice(from, at + 2400));
}
// 最后一条 assistant 文本
for (let i = lines.length - 1; i >= 0; i--) {
  try {
    const o = JSON.parse(lines[i]);
    if (o.type === 'assistant/message') {
      const parts = o.data?.message?.content ?? o.data?.content ?? [];
      const txt = parts.filter((p) => p?.type === 'text').map((p) => p.text).join('\n');
      console.log(`\n===== last assistant/message #${i} =====\n` + txt.slice(0, 1800));
      break;
    }
  } catch {}
}
