// 追蹤最新 session 的最後一輪：工具調用、搜索結果、發送出去的消息。
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

console.log('=== newest session files ===');
for (const [m, fp] of cands.slice(0, 5)) console.log(new Date(m).toISOString(), statSync(fp).size, fp);

const target = cands[0][1];
const lines = decodeMulti(readFileSync(target)).split('\n').filter((l) => l.trim());
console.log('\n=== TRACE', target, 'lines:', lines.length, '===');

const tail = lines.slice(-Math.min(lines.length, 260));
for (const raw of tail) {
  let o = null; try { o = JSON.parse(raw); } catch { continue; }
  const t = o.type ?? '';
  if (t === 'tool/call') {
    const name = o.data?.name ?? o.data?.call?.name ?? o.name ?? '';
    const args = o.data?.arguments ?? o.data?.call?.arguments ?? o.data?.args ?? {};
    console.log(`\n[tool/call seq=${o.seq}] ${name}\n  ARGS: ${JSON.stringify(args).slice(0, 1200)}`);
  } else if (t === 'tool/result') {
    const s = JSON.stringify(o.data ?? {});
    console.log(`[tool/result seq=${o.seq}] len=${s.length}\n  ${s.slice(0, 2600)}`);
  } else if (t === 'assistant/message') {
    const parts = o.data?.message?.content ?? o.data?.content ?? [];
    const txt = Array.isArray(parts) ? parts.filter((p) => p?.type === 'text').map((p) => p.text).join('\n') : '';
    if (txt.trim()) console.log(`[assistant seq=${o.seq}] ${txt.slice(0, 1200)}`);
  } else if (t === 'user/message') {
    const parts = o.data?.message?.content ?? o.data?.content ?? [];
    const txt = Array.isArray(parts) ? parts.filter((p) => p?.type === 'text').map((p) => p.text).join('\n') : JSON.stringify(parts);
    console.log(`[user seq=${o.seq}] ${String(txt).slice(0, 900)}`);
  }
}
