// 打印最新 session 的尾部条目，并对含标记的行多打一些上下文。
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
console.log('FILE:', cands[0][1], 'lines:', lines.length);
const MARKS = ['搜索怎么问', '360资讯', '被反爬', 'channels'];
const start = Math.max(0, lines.length - 40);
for (let i = start; i < lines.length; i++) {
  const raw = lines[i];
  const hit = MARKS.some((m) => raw.includes(m));
  let label = '';
  try {
    const o = JSON.parse(raw);
    label = [o.type, o.role, o.kind].filter(Boolean).join('/');
    if (typeof o.content === 'string') label += ' | ' + o.content.slice(0, 60).replace(/\n/g, ' ');
  } catch {}
  console.log(`#${i} [${raw.length}] ${label}`);
  if (hit) {
    console.log('   >>> ' + raw.slice(0, 2200));
  }
}
