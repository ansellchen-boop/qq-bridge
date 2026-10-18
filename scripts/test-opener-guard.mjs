const cfg={socialV2:{}};
const log=(...a)=>console.log('  [log]',...a);
let FAKE=null; const getSocialV2State=()=>FAKE;
  const OPENER_LAZY_CHARS = ['哦', '行', '？', '?', '嗯', '这', '那', '啊', '唉', '额'];
  const OPENER_LOOKBACK = 6;
  const OPENER_MAX_BLOCKS_PER_TURN = 2;
  const openerBlockLog = new Map();

  function openerCharOfV2(text) {
    let s = String(text ?? '').replace(/^[\s\u200b\u3000]+/, '');
    if (!s) return '';
    const m = /^(?:@[^\s]{1,24}\s*|[\[【][^\]】]{0,24}[\]】]\s*)*([\s\S])/.exec(s);
    s = m ? m[1] : s[0];
    return s || '';
  }

  function openerStatsV2(st) {
    const list = Array.isArray(st?.recentMessages) ? st.recentMessages : [];
    const seq = [];
    for (let i = list.length - 1; i >= 0 && seq.length < OPENER_LOOKBACK; i--) {
      const m = list[i];
      if (!m || !m.isSelf) continue;
      const t = String(m.text ?? m.plain ?? '');
      if (!t.trim()) continue;
      const ch = openerCharOfV2(t);
      if (ch) seq.unshift(ch);
    }
    const counts = {};
    for (const ch of seq) counts[ch] = (counts[ch] || 0) + 1;
    const hot = OPENER_LAZY_CHARS.filter((c) => (counts[c] || 0) >= 2);
    const last = seq[seq.length - 1] || '';
    const prev = seq[seq.length - 2] || '';
    return { seq, counts, hot, last, prev, collide: !!last && last === prev };
  }

  function openerVarietyLineV2(key, st) {
    const { seq, counts, hot, collide } = openerStatsV2(st);
    if (seq.length < 2) return '';
    const shown = seq.map((c) => `「${c}」`).join('');
    const extra = collide && OPENER_LAZY_CHARS.includes(seq[seq.length - 1]) ? [seq[seq.length - 1]] : [];
    const banned = [...new Set([...hot, ...extra])];
    if (!banned.length) {
      return `【开场字】你最近 ${seq.length} 条发言的开头是 ${shown}——这回合若发言，开头别和上一条撞字。`;
    }
    const detail = banned.map((c) => `「${c}」${counts[c] ?? 1} 次`).join('、');
    const list = banned.map((c) => `「${c}」`).join('');
    return `【开场字·硬提醒】你最近 ${seq.length} 条发言的开头是 ${shown}，其中 ${detail} 已经重复。这回合你要是发言：第一个字不许再用 ${list}（桥接层会在发送口拦截重发，白费一次工具调用）。开场直接说事、点对方名字、或用没出现过的字起头：得了吧／就这／少来／嚯／笑死／我懂了／说实话／说真的／瞅瞅你／呵。`;
  }

  function openerGuardCheckV2(key, messages) {
    if (cfg.socialV2?.openerGuard?.enabled === false) return null;
    const list = Array.isArray(messages) ? messages : [];
    const first = list.find((m) => String(m ?? '').trim());
    if (!first) return null;
    const text = String(first).trim();
    if (text.length <= 2) return null;
    const ch = openerCharOfV2(text);
    if (!ch || !OPENER_LAZY_CHARS.includes(ch)) return null;
    const { counts, hot, last, seq } = openerStatsV2(getSocialV2State(key));
    if (seq.length < 3) return null;
    const banned = new Set(hot);
    if (last && OPENER_LAZY_CHARS.includes(last)) banned.add(last);
    if (!banned.has(ch)) return null;
    const now = Date.now();
    const rec = openerBlockLog.get(key) ?? { n: 0, at: 0 };
    if (now - rec.at > 180000) rec.n = 0;
    if (rec.n >= OPENER_MAX_BLOCKS_PER_TURN) {
      rec.n = 0; rec.at = now; openerBlockLog.set(key, rec);
      log(`[开场字] ${key} 已拦截 ${OPENER_MAX_BLOCKS_PER_TURN} 次，本条放行（避免死循环）`);
      return null;
    }
    rec.n += 1; rec.at = now; openerBlockLog.set(key, rec);
    return { char: ch, error: `【开场字重复】你最近 ${seq.length} 条发言里「${ch}」已用 ${counts[ch] ?? 1} 次，这条又以「${ch}」起头。原意别改，换个开头重发：直接说事、点对方名字、或用没出现过的字（得了吧／就这／少来／嚯／笑死／说实话）。` };
  }


function mk(chars){ FAKE={recentMessages:chars.map(c=>({isSelf:true,text:c+'随便说点啥'}))}; }
function t(name,fn){ try{ console.log(name,'→',fn()); }catch(e){ console.log(name,'✗',e.message); } }

console.log('--- 變體提示詞 ---');
mk(['哦','行','哦','行','？','在']);
t('line(哦/行/哦/行/？/在)',()=>openerVarietyLineV2('group:1',FAKE).slice(0,110)+' …');
mk(['哦','行','在','看','喂','这']);
t('line(無重複)',()=>openerVarietyLineV2('group:1',FAKE).slice(0,80));

console.log('--- 發送口攔截 ---');
mk(['哦','行','哦','行','？','在']);
t('攔「哦那你继续」',()=>{const r=openerGuardCheckV2('group:1',['哦那你继续']);return r?('BLOCK '+r.char):'pass';});
t('放「在吗」',()=>{const r=openerGuardCheckV2('group:1',['在吗']);return r?'BLOCK':'pass';});
t('放單字「？」',()=>{const r=openerGuardCheckV2('group:1',['？']);return r?'BLOCK':'pass';});
t('放「得了吧 你继续」',()=>{const r=openerGuardCheckV2('group:1',['得了吧 你继续']);return r?'BLOCK':'pass';});
mk(['哦','行','在','看','喂','哦']);
t('撞上一條「哦」時攔「哦你看」',()=>{const r=openerGuardCheckV2('group:1',['哦你看']);return r?('BLOCK '+r.char):'pass';});
mk(['哦','行','哦','行','？','在']);
t('連攔 3 次（第 3 次放行）',()=>{const a=openerGuardCheckV2('group:1',['哦行吧'])?1:0;const b=openerGuardCheckV2('group:1',['哦行吧'])?1:0;const c=openerGuardCheckV2('group:1',['哦行吧'])?1:0;return `${a}${b}${c}（應為 110）`;});
t('前導 @ 與引用前綴',()=>{mk(['哦','行','哦','行','？','在']);const r=openerGuardCheckV2('group:1',['[引用 某人：原文] 哦你说得对']);return r?('BLOCK '+r.char):'pass';});
