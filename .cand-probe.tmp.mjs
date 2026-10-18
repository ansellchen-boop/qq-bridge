// 临时探针：为「搜狗资讯被反爬」找替补新闻通道。只打印体积与命中特征。
import { safeFetch } from './src/safe-fetch.js';

const q = 'C罗 退出 葡萄牙国家队';
const enc = encodeURIComponent(q);
const space = encodeURIComponent(q.replace(/\s+/g, '+'));

const candidates = [
  ['baidu-news', `https://www.baidu.com/s?rtt=4&bsst=1&cl=2&tn=news&word=${enc}`],
  ['baidu-web', `https://www.baidu.com/s?wd=${enc}`],
  ['toutiao-so', `https://so.toutiao.com/search?dvpf=pc&source=input&keyword=${enc}`],
  ['xinhua-api', `https://so.news.cn/getNews?key=${enc}&curPage=1&sortField=0&searchFields=1&lang=cn`],
  ['cctv-search', `https://search.cctv.com/search.php?qtext=${enc}&type=web`],
  ['thepaper', `https://www.thepaper.cn/searchResult?searchWord=${enc}`],
  ['sina-news', `https://search.sina.com.cn/news?q=${enc}&c=news&from=channel`],
  ['netease-so', `https://www.163.com/search?keyword=${enc}`],
  ['so360-web', `https://www.so.com/s?q=${enc}`],
];

const sigs = {
  'res-list': /<li[^>]*class="[^"]*res-list/g,
  'b_algo': /<li class="b_algo"/g,
  'baidu-result': /class="result[^"]*"/g,
  'h3': /<h3/g,
  'vr-title': /vr-title/g,
  'news-item': /class="[^"]*news[^"]*item/g,
  'json': /\{"[a-zA-Z]+":/g,
};

for (const [name, url] of candidates) {
  const started = Date.now();
  try {
    const res = await safeFetch(url, 512000);
    const body = String(res.body ?? '');
    const hits = Object.entries(sigs)
      .map(([key, re]) => `${key}=${(body.match(re) || []).length}`)
      .filter((entry) => !entry.endsWith('=0'))
      .join(' ');
    console.log(`[${name}] ${Date.now() - started}ms status=${res.statusCode} len=${body.length} final=${String(res.url).slice(0, 90)}`);
    console.log(`    hits: ${hits || '(none)'}`);
    console.log(`    head: ${body.slice(0, 220).replace(/\s+/g, ' ')}`);
  } catch (error) {
    console.log(`[${name}] ${Date.now() - started}ms THREW ${error?.message ?? error}`);
  }
}
process.exit(0);
