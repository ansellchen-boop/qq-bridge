// 解码最新 N 个 session transcript，统计一批标记命中次数。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const root = '/root/.dsh/sessions';
const limit = Number(process.argv[2] ?? 3);
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
  if (!offsets.length) throw new Error('no zstd frame');
  const parts = [];
  for (let i = 0; i < offsets.length; i++) {
    const start = offsets[i];
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, end))); } catch {}
  }
  return Buffer.concat(parts).toString('utf8');
}

const MARKS = ['搜索怎么问', '发送与汇报禁令', '【QQ 场景规则】', '口癖配额', '幽默小鲸鱼', '被反爬拦截', 'channels', '360资讯', '换关键词重搜'];
for (const [mtime, fp] of cands.slice(0, limit)) {
  let text = '';
  try { text = decodeMulti(readFileSync(fp)); } catch (e) { console.log(fp, 'DECODE FAIL', e.message); continue; }
  console.log(`\n=== ${new Date(mtime).toISOString()} chars=${text.length}\n    ${fp}`);
  for (const mark of MARKS) {
    const hits = text.split(mark).length - 1;
    if (hits > 0) console.log(`    ${JSON.stringify(mark)}: ${hits}`);
  }
  const i = text.lastIndexOf('【QQ 场景规则】');
  if (i >= 0) console.log('    TAIL-OF-PRESET-CONTEXT:', JSON.stringify(text.slice(i, i + 260)));
}
