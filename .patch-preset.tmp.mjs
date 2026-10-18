// 本地补丁：给 qq-chat-v2 preset 加一条「搜索怎么问」的现场指引（A 方案）。
// 插在【发送与汇报禁令】那一行之前，保持 6 空格缩进 + 单行 + 「 - 」分条的行文风格。
import { readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';

const FILE = 'dsh/agent-presets/qq-chat-v2/agent.cordis.yml';
const ANCHOR = '      【发送与汇报禁令（违反即严重违规）】';
const MARK = '【搜索怎么问】';

const NEW_LINE = [
  '      【搜索怎么问】',
  ' - 提问要短：先抽出“主体 + 事件”两三个词（如「C罗 退出 葡萄牙国家队」「韩国 银行 黑客攻击」），不要把用户整句话或一长串定语塞进 query；同一件事最多换 2~3 种说法，别反复重搜。',
  ' - 先看返回里的 channels / errors：某条通道写着「被反爬拦截」「HTTP 4xx/5xx」，那是这条通道本身坏了，换别的通道的条目或换个说法，不要当成“世界上没有这件事”。',
  ' - 先看条目本身：带「日期 + 来源」的通常是新闻，可以直接引用并在回复里写出来源和时间；没有日期的网页条目（百科/问答/贴吧）可能是旧页面，引用前先确认时间对不对。',
  ' - 跑题条目直接丢掉：如果标题或摘要跟你问的完全无关（例如查「C罗」却回一堆 C 语言教程），那是搜索引擎拆词造成的，要换关键词重搜，绝不能把无关条目硬套成答案。',
  ' - 实在搜不到就直说搜不到、或直说只找到旧信息，不要凭记忆编造标题、日期和链接；需要确切事实时用 mcp__web-search-safe__web_fetch 打开你确定的站点（官网/百科/新闻首页）再读一遍。',
].join('');

const source = readFileSync(FILE, 'utf8');
if (source.includes(MARK)) {
  console.log('ALREADY-PATCHED: 已包含', MARK, '，未做修改。');
  process.exit(0);
}
const anchorIndex = source.indexOf(ANCHOR);
if (anchorIndex < 0) {
  console.error('ANCHOR-NOT-FOUND:', ANCHOR);
  process.exit(2);
}
const backup = `${FILE}.bak-searchguidance-${Date.now()}`;
copyFileSync(FILE, backup);
const patched = source.slice(0, anchorIndex) + NEW_LINE + '\n' + source.slice(anchorIndex);
writeFileSync(FILE, patched);
console.log('backup:', backup);
console.log('bytes:', statSync(FILE).size, '(was', statSync(backup).size + ')');
console.log('lines:', patched.split('\n').length, '(was', source.split('\n').length + ')');
console.log('inserted-before-char:', anchorIndex);
