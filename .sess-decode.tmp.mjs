// 找出最新写入的 session transcript，解码（多 frame zstd）并在里面找关键标记。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const root = process.argv[2] ?? '/root/.dsh/sessions';
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
for (const [m, fp] of cands.slice(0, 6)) console.log(new Date(m).toISOString(), statSync(fp).size, fp);

function decodeMulti(buf) {
  const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
  const offsets = [];
  let idx = buf.indexOf(MAGIC, 0);
  while (idx >= 0) { offsets.push(idx); idx = buf.indexOf(MAGIC, idx + 4); }
  if (!offsets.length) throw new Error('no zstd frame');
  const parts = [];
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i];
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, end))); } catch {}
  }
  return Buffer.concat(parts).toString('utf8');
}

const [mtime, fp] = cands[0];
console.log('--- decoding', new Date(mtime).toISOString(), fp);
const text = decodeMulti(readFileSync(fp));
console.log('decoded chars:', text.length);
for (const mark of ['搜索怎么问', '被反爬拦截', '口癖配额', 'channels', '360资讯']) {
  console.log(JSON.stringify(mark), 'hits:', text.split(mark).length - 1);
}
const i = text.lastIndexOf('搜索怎么问');
if (i >= 0) console.log('CONTEXT:', text.slice(Math.max(0, i - 300), i + 700));
