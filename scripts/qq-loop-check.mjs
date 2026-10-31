#!/usr/bin/env node
// qq-loop-check.mjs —— QQ 环路冒烟检查：发一条 → 回读确认 → 撤回 → 确认已撤。
//
// 用法：
//   node scripts/qq-loop-check.mjs                 # 发到默认群 722686811（4 人小群）
//   node scripts/qq-loop-check.mjs --group 722686811
//   node scripts/qq-loop-check.mjs --list          # 只列群，不发消息
//   node scripts/qq-loop-check.mjs --keep          # 不撤回（调试用，慎用）
//
// 退出码：0 全过 / 1 有断言失败 / 2 连不上 OneBot。
//
// 为什么必须回读：
//   send_group_msg 返回 retcode=0 只证明 OneBot 收下了请求，不证明消息进了存储、
//   更不证明 QQ 侧真的收到了。get_msg 能取到实体、内容带我们的标记，才算「到了」。
//
// 为什么撤回放 finally：
//   中途任何一步炸了也要把消息收回来，否则群里会留一条僵尸测试消息。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEFAULT_GROUP = 722686811;
const ARGS = process.argv.slice(2);
const keep = ARGS.includes('--keep');
const listOnly = ARGS.includes('--list');
const gi = ARGS.indexOf('--group');
const groupId = gi >= 0 ? Number(ARGS[gi + 1]) : DEFAULT_GROUP;

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const sn = cfg.snowluma ?? {};
const base = String(sn.httpUrl ?? 'http://127.0.0.1:3000')
  .replace('0.0.0.0', '127.0.0.1')
  .replace(/\/+$/, '');
const token = sn.accessToken;

async function call(action, params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)]));
  const url = `${base}/${action}${qs.toString() ? '?' + qs : ''}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(10_000)
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* 下面统一报 */ }
  if (!body) throw new Error(`${action}: HTTP ${res.status}，响应不是 JSON：${text.slice(0, 120)}`);
  return { httpStatus: res.status, ...body };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

const tag = 'qq-loop-' + crypto.randomBytes(4).toString('hex');
let messageId = null;
let deleted = false;

try {
  // 1) 网关在线
  const status = await call('get_status');
  const online = status?.data?.online === true;
  const good = status?.data?.good === true;
  check('网关 get_status 可达且 retcode=0', status.retcode === 0, `retcode=${status.retcode}`);
  check('账号在线（online=true）', online, `online=${status?.data?.online}`);
  check('心跳健康（good=true）', good, `good=${status?.data?.good}`);

  // 2) 目标群存在
  const groups = await call('get_group_list');
  const list = Array.isArray(groups.data) ? groups.data : [];
  console.log(`  可见群：${list.map((g) => `${g.group_id}(${g.group_name})`).join('、') || '（空）'}`);
  const target = list.find((g) => Number(g.group_id) === Number(groupId));
  check(`目标群 ${groupId} 在可见列表里`, Boolean(target), target ? target.group_name : '未找到');

  if (listOnly) {
    const fail = results.filter((r) => !r.ok).length;
    console.log(fail === 0 ? '\n✓ 只读检查通过（--list，未发消息）' : `\n✗ ${fail} 项失败`);
    process.exit(fail === 0 ? 0 : 1);
  }
  if (!target) throw new Error('目标群不存在，放弃发送');

  // 3) 发送
  const msg = `[自检] 桥接链路冒烟 ${tag}（这条会被立刻撤回）`;
  const sent = await call('send_group_msg', { group_id: groupId, message: msg });
  messageId = sent?.data?.message_id ?? null;
  check('send_group_msg 返回 retcode=0', sent.retcode === 0, `retcode=${sent.retcode}`);
  check('拿到了 message_id', messageId !== null && messageId !== undefined, `message_id=${messageId}`);
  if (messageId === null || messageId === undefined) throw new Error('没有 message_id，后续无法回读/撤回');

  // 4) 回读 —— 这才是「真到了」的证据
  const got = await call('get_msg', { message_id: messageId });
  const gotOk = got.retcode === 0 && String(got?.data?.message_id) === String(messageId);
  check('get_msg 能取回刚发的消息', gotOk, `retcode=${got.retcode}`);
  const body = JSON.stringify(got?.data ?? {});
  check('回读内容包含本次唯一标记', body.includes(tag), tag);

  // 5) 撤回
  if (!keep) {
    const del = await call('delete_msg', { message_id: messageId });
    deleted = del.retcode === 0;
    check('delete_msg 撤回成功', deleted, `retcode=${del.retcode}`);

    // 6) 撤回的「真正生效」无法从 OneBot API 侧复核 —— 如实说明，不作断言。
    //    实测：delete_msg 之后 get_msg 仍返回同一实体（读的是本地消息缓存），
    //    且二次 delete_msg 仍返回 retcode=0（幂等，不会报「已撤回」）。
    const after = await call('get_msg', { message_id: messageId });
    console.log(
      `  ℹ️ 撤回有效性无法从 API 侧确认：撤回后 get_msg 仍 retcode=${after.retcode}（本地缓存），` +
        'delete_msg 幂等。retcode=0 是唯一信号，要肉眼复核得去 QQ 客户端看。'
    );
  } else {
    console.log(`  ⚠️ --keep：消息保留在群里，message_id=${messageId}`);
  }
} catch (error) {
  check('执行过程未抛异常', false, error?.message ?? String(error));
} finally {
  // 兜底：只要发出去过、又还没撤，就再试一次
  if (messageId !== null && messageId !== undefined && !keep && !deleted) {
    try {
      const del = await call('delete_msg', { message_id: messageId });
      console.log(`  🧹 兜底撤回：retcode=${del.retcode}`);
    } catch (e) {
      console.log(`  ⚠️ 兜底撤回失败，群里可能残留 message_id=${messageId}：${e?.message ?? e}`);
    }
  }
}

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length === 0) {
  console.log(`✓ QQ 环路检查通过（${results.length} 项）`);
  process.exit(0);
}
console.log(`✗ QQ 环路检查失败：${failed.length}/${results.length} 项`);
process.exit(1);
