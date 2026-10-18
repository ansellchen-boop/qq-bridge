// 临时探针：以 stdio 拉起指定 MCP server，跑几组真实 web_search 查询并打印结果概况。
// 用法：node .search-probe.tmp.mjs <entry.js> "<query1>" "<query2>" ...
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = process.argv[2];
const queries = process.argv.slice(3);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
  cwd: '/root/qq-bridge',
  stderr: 'pipe',
});
const client = new Client({ name: 'search-probe', version: '0.0.0' });

await client.connect(transport);
try {
  console.log('serverVersion:', JSON.stringify(client.getServerVersion()));
} catch (error) {
  console.log('serverVersion: (unavailable)', error?.message);
}
const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));
for (const tool of tools) console.log(`  ${tool.name}: ${String(tool.description).slice(0, 110)}`);

for (const query of queries) {
  const started = Date.now();
  const result = await client.callTool({ name: 'web_search', arguments: { query } });
  const ms = Date.now() - started;
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) {
    console.log(`\n=== ${query} [isError ${ms}ms] ${text.slice(0, 300)}`);
    continue;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.log(`\n=== ${query} [unparsable ${ms}ms] ${text.slice(0, 300)}`);
    continue;
  }
  console.log(`\n=== ${query} (${ms}ms) channels=${JSON.stringify(parsed.channels)} results=${parsed.results?.length}`);
  console.log(`note: ${parsed.note ?? '(none)'}`);
  if (parsed.errors) console.log(`errors: ${JSON.stringify(parsed.errors)}`);
  for (const item of (parsed.results ?? [])) {
    console.log(`- [${item.channel}${item.date ? ' ' + item.date : ''}${item.source ? ' / ' + item.source : ''}] ${String(item.title).slice(0, 70)}`);
    console.log(`    ${String(item.url).slice(0, 90)}`);
    if (item.snippet) console.log(`    ${String(item.snippet).slice(0, 130)}`);
  }
}

await client.close();
process.exit(0);
