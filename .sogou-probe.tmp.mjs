// 临时探针：看搜狗资讯通道到底回了什么。
import { safeFetch } from './src/safe-fetch.js';

const q = process.argv[2] ?? 'C罗 退出 葡萄牙国家队';
const url = `https://news.sogou.com/news?query=${encodeURIComponent(q)}`;
try {
  const res = await safeFetch(url, 512000);
  const body = String(res.body ?? '');
  console.log('status', res.statusCode, 'finalUrl', res.url, 'len', body.length);
  console.log('vr-title', (body.match(/<h3[^>]*class="[^"]*vr-title/g) || []).length,
    'h3', (body.match(/<h3/g) || []).length,
    'link?url=', (body.match(/\/link\?url=/g) || []).length);
  console.log('head:', body.slice(0, 400).replace(/\s+/g, ' '));
  const idx = body.search(/vr-title/);
  if (idx >= 0) console.log('around vr-title:', body.slice(Math.max(0, idx - 200), idx + 900).replace(/\s+/g, ' '));
} catch (error) {
  console.log('THREW:', error?.message ?? error);
}
process.exit(0);
