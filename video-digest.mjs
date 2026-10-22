// B 站视频「摘要包」生成器：把一条视频拆成模型能读的东西。
//
// 全部数据走 yt-dlp（它自带 B 站风控所需的请求头；直接用 fetch 打 api.bilibili.com 会 412）。
//
// 产物（默认 ./digest/<bvid>/）：
//   digest.md      标题/UP主/简介/字幕全文/关键帧清单（可直接喂给模型）
//   digest.json    结构化数据
//   cover.jpg      封面
//   frames/*.jpg   关键帧（--frames N 时才生成）
//
// 用法：
//   node video-digest.mjs <链接或BV号> [--frames 6] [--out 目录] [--max-minutes 30]
//
// 依赖：yt-dlp（默认 C:\yt-dlp\yt-dlp.exe）、ffmpeg（PATH 或 WinGet 安装目录）

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

const YTDLP = process.env.YTDLP_PATH ?? 'yt-dlp'
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg'
const COOKIE_FILE = process.env.BILI_COOKIES_PATH ?? join(import.meta.dirname, '.cookies', 'bilibili.txt')

function resolveFfmpeg() {
  try {
    return execFileSync('where', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim()
  } catch {
    const base = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
    const hit = execFileSync('powershell', ['-NoProfile', '-Command',
      `(Get-ChildItem '${base}' -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName`],
      { encoding: 'utf8' }).trim()
    return hit || 'ffmpeg'
  }
}

const argv = process.argv.slice(2)
const target = argv.find(a => !a.startsWith('--') && !/^\d+$/.test(a))
const numArg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback
}
const FRAMES = numArg('--frames', 0)
const MAX_MINUTES = numArg('--max-minutes', 30)
const OUT_ROOT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : join(import.meta.dirname, 'digest')

if (!target) {
  console.error('用法: node video-digest.mjs <链接或BV号> [--frames 6] [--out 目录] [--max-minutes 30]')
  process.exit(1)
}

function ytdlp(args, cwd) {
  // 2026-10-22：本机（腾讯云机房 IP）对浏览器 UA 一律 412，空 UA 反而放行；
  // 见诊断记录 bilibili 412；yt-dlp 默认 UA 是浏览器串，所以这里强制空 UA。
  // B 站 AI 字幕需要登录态：有 cookies 檔就帶上（--cookies），沒有就匿名跑。
  const cookieArgs = existsSync(COOKIE_FILE) ? ['--cookies', COOKIE_FILE] : []
  return execFileSync(YTDLP, ['--user-agent', '', ...cookieArgs, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 20 * 60 * 1000 })
}

function toUrl(input) {
  const bv = /(BV[0-9A-Za-z]{10})/.exec(input)
  if (bv) return `https://www.bilibili.com/video/${bv[1]}`
  if (/^https?:\/\//.test(input)) return input
  throw new Error(`无法识别的输入: ${input}`)
}

const url = toUrl(target)
console.log(`[digest] 读取元数据: ${url}`)
const meta = JSON.parse(ytdlp(['--dump-single-json', '--no-warnings', '--no-playlist', url]))
const bvid = meta.id ?? /(BV[0-9A-Za-z]{10})/.exec(url)?.[1] ?? 'unknown'
const minutes = Math.round((meta.duration ?? 0) / 60)

const outDir = resolve(OUT_ROOT, bvid)
mkdirSync(outDir, { recursive: true })
mkdirSync(join(outDir, 'frames'), { recursive: true })

console.log(`[digest] ${meta.title}`)
console.log(`[digest] UP主 ${meta.uploader}  时长 ${minutes} 分钟  BV ${bvid}`)

// ---- 封面 ----
let coverNote = ''
try {
  const res = await fetch(meta.thumbnail)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  writeFileSync(join(outDir, 'cover.jpg'), Buffer.from(await res.arrayBuffer()))
  coverNote = 'cover.jpg'
} catch (error) {
  coverNote = `封面下载失败: ${error.message}`
}

// ---- 字幕（yt-dlp 直接下）----
let subtitleText = ''
let subtitleNote = '该视频没有可获取的字幕'
const hasSubs = Object.keys(meta.subtitles ?? {}).length + Object.keys(meta.automatic_captions ?? {}).length > 0
if (hasSubs) {
  try {
    ytdlp(['--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'zh.*,ai-zh,zh-CN,zh-Hans',
      '--sub-format', 'vtt', '-o', 'sub', url], outDir)
    const file = readdirSync(outDir).find(f => f.startsWith('sub') && f.endsWith('.vtt'))
    if (file) {
      const raw = readFileSync(join(outDir, file), 'utf8')
      subtitleText = raw
        .split(/\r?\n/)
        .filter(line => line.trim() && !/^(WEBVTT|NOTE|Kind:|Language:|\d+$)/.test(line.trim()))
        .filter(line => !/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s-->/.test(line.trim()))
        .join('\n')
        .replace(/<[^>]+>/g, '')
      subtitleNote = `字幕来源: ${file}`
    } else {
      subtitleNote = 'yt-dlp 未产出字幕文件（可能需登录 Cookie）'
    }
  } catch (error) {
    subtitleNote = `字幕下载失败: ${error.message}`
  }
}

// ── B 站 AI 字幕（2026-10-22 加入）─────────────────────────────────────────────
// yt-dlp 對 B 站 AI 字幕常常看不到（metadata 的 subtitles 為空）。這裡帶登入 Cookie 呼叫
// **wbi 簽名** 的 player/wbi/v2；未簽名的 x/player/v2 不穩定（會回別的視頻/廣告字幕），不用。
function biliCookieHeader() {
  try {
    const raw = readFileSync(COOKIE_FILE, 'utf8')
    const parts = []
    for (const line of raw.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const f = line.split('\t')
      if (f.length >= 7 && /bilibili\.com$/.test(f[0].replace(/^\./, ''))) parts.push(`${f[5]}=${f[6]}`)
    }
    return parts.join('; ')
  } catch { return '' }
}

const WBI_TAB = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52]
let wbiCache = { key: '', at: 0 }

async function wbiKey(headers) {
  if (wbiCache.key && Date.now() - wbiCache.at < 10 * 60 * 1000) return wbiCache.key
  const nav = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers })).json()
  const img = nav?.data?.wbi_img?.img_url?.split('/').pop()?.split('.')[0] ?? ''
  const sub = nav?.data?.wbi_img?.sub_url?.split('/').pop()?.split('.')[0] ?? ''
  if (!img || !sub) return ''
  wbiCache = { key: WBI_TAB.map(i => (img + sub)[i] ?? '').join('').slice(0, 32), at: Date.now() }
  return wbiCache.key
}

async function fetchBiliAiSubtitle(bvid) {
  const cookie = biliCookieHeader()
  if (!cookie) return ''
  const headers = { 'user-agent': '', cookie, referer: 'https://www.bilibili.com/' }
  const view = await (await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { headers })).json()
  const aid = view?.data?.aid
  const cid = view?.data?.cid ?? view?.data?.pages?.[0]?.cid
  if (!aid || !cid) return ''
  const key = await wbiKey(headers)
  const params = new URLSearchParams({ aid: String(aid), cid: String(cid), wts: String(Math.floor(Date.now() / 1000)) })
  const query = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const base = new URLSearchParams(query).toString()
  if (key) params.set('w_rid', createHash('md5').update(base + key).digest('hex'))
  const pv = await (await fetch(`https://api.bilibili.com/x/player/wbi/v2?${params.toString()}`, { headers })).json()
  const list = pv?.data?.subtitle?.subtitles ?? []
  const pick = list.find(x => x.lan === 'ai-zh') ?? list.find(x => /^zh/.test(x.lan ?? '')) ?? list[0]
  if (!pick?.subtitle_url) return ''
  const u = pick.subtitle_url.startsWith('//') ? `https:${pick.subtitle_url}` : pick.subtitle_url
  const sub = await (await fetch(u, { headers })).json()
  return (sub?.body ?? []).map(x => String(x.content ?? '').trim()).filter(Boolean).join('\n')
}

// yt-dlp 拿不到字幕時，改用 player/v2 直取 AI 字幕
if (!subtitleText) {
  try {
    const ai = await fetchBiliAiSubtitle(bvid)
    if (ai) {
      subtitleText = ai
      subtitleNote = '字幕来源: B 站 AI 字幕（wbi 直取，需登录 Cookie）'
    }
  } catch (error) {
    subtitleNote = `AI 字幕直取失败: ${error.message}`
  }
}

// ---- 关键帧 ----
const frames = []
if (FRAMES > 0) {
  if (minutes > MAX_MINUTES) {
    console.log(`[digest] 视频 ${minutes} 分钟 > --max-minutes ${MAX_MINUTES}，跳过抽帧`)
  } else {
    try {
      console.log('[digest] 下载视频用于抽帧…')
      // 只取视频流（抽帧不需要音频）；用 height<=720 兜底，避免竖屏视频（如 480x852）匹配不到
      ytdlp(['-f', 'bv*[height<=720]/b[height<=720]/b', '-o', 'video.%(ext)s', url], outDir)
      const video = readdirSync(outDir).find(f => f.startsWith('video.') && f.endsWith('.mp4'))
      if (video) {
        const dur = meta.duration ?? 60
        for (let i = 0; i < FRAMES; i++) {
          const t = Math.floor((dur / (FRAMES + 1)) * (i + 1))
          const name = `f${String(i + 1).padStart(2, '0')}.jpg`
          execFileSync(FFMPEG, ['-y', '-ss', String(t), '-i', join(outDir, video),
            '-frames:v', '1', '-update', '1', '-vf', 'scale=720:-1', '-q:v', '3', join(outDir, 'frames', name)],
            { windowsHide: true, timeout: 60_000 })
          frames.push({ time: t, file: `frames/${name}` })
        }
        console.log(`[digest] 抽帧完成 ${frames.length} 张`)
      }
    } catch (error) {
      console.log(`[digest] 抽帧失败: ${error.message}`)
    }
  }
}

// ---- 输出 ----
const digest = {
  bvid,
  url,
  title: meta.title,
  owner: meta.uploader,
  durationSeconds: meta.duration,
  publishedAt: meta.upload_date ?? null,
  stats: {
    view: meta.view_count, like: meta.like_count, comment: meta.comment_count,
    favorite: meta.favorite_count, coin: meta.repost_count,
  },
  tags: meta.tags ?? [],
  description: meta.description ?? '',
  subtitleNote,
  subtitleChars: subtitleText.length,
  cover: coverNote,
  frames,
}

const md = [
  `# ${meta.title}`,
  '',
  `- 链接：${url}`,
  `- UP主：${meta.uploader}`,
  `- 时长：${minutes} 分钟`,
  `- 发布：${meta.upload_date ?? '未知'}`,
  `- 数据：播放 ${meta.view_count ?? '-'} / 点赞 ${meta.like_count ?? '-'} / 评论 ${meta.comment_count ?? '-'} / 收藏 ${meta.favorite_count ?? '-'}`,
  `- 标签：${(meta.tags ?? []).join(' / ') || '（无）'}`,
  `- 封面：${coverNote}`,
  '',
  '## 简介',
  (meta.description ?? '').trim() || '（无）',
  '',
  '## 字幕',
  subtitleNote,
  '',
  subtitleText || '（未获取到字幕；内容理解只能依赖简介与画面帧）',
  '',
  frames.length > 0 ? '## 关键帧\n' + frames.map(f => `- ${f.time}s: ${f.file}`).join('\n') : '',
].join('\n')

writeFileSync(join(outDir, 'digest.json'), JSON.stringify(digest, null, 2), 'utf8')
writeFileSync(join(outDir, 'digest.md'), md, 'utf8')

console.log(`\n[digest] 输出目录: ${outDir}`)
console.log(`[digest] 字幕 ${subtitleText.length} 字 · 关键帧 ${frames.length} 张 · ${subtitleNote}`)
