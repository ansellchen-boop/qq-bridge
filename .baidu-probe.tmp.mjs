// 临时探针：看百度资讯结果块的真实结构，便于写解析器。
import { safeFetch } from './src/safe-fetch.js';

const q = 'C罗 退出 葡萄牙国家队';
const url = `https://www.baidu.com/s?rtt=4&bsst=1&cl=2&tn=news&word=${encodeURIComponent(q)}`;
const res = await safeFetch(url, 512000);
const body = String(res.body ?? '');
console.log('status', res.statusCode, 'len', body.length);
const idx = body.search(/class="result/);
console.log('first result idx', idx);
console.log(body.slice(Math.max(0, idx - 100), idx + 1500).replace(/\s+/g, ' '));
console.log('---- second ----');
const idx2 = body.indexOf('class="result', idx + 10);
console.log(body.slice(idx2, idx2 + 1200).replace(/\s+/g, ' '));
process.exit(0);
