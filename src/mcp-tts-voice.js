// AI 语音 MCP server（stdio）：文字 → 腾讯云语音合成 TTS（TextToVoice）→ 交给桥接发成 QQ 语音条。
//
// 与 qq-bridge-addons 的 mcp-voice-tts.js 同一个思路，只是把「本地 GPT-SoVITS 9880」换成
// 「腾讯云 TTS API」（不需要 GPU / 不需要常驻服务）。
//
// 工具：qq_say_voice(text, target?)
//   1. POST https://tts.tencentcloudapi.com（TC3-HMAC-SHA256 签名）合成 wav
//   2. 落到 audio/generated/（桥接语音库目录内，避免越权路径）
//   3. spawn node scripts/send-voice.mjs send <file> <target>
//      —— 复用桥接自己那套白名单/限流/审计，不另开一条发送通道
//
// 凭据：环境变量 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY，
//       或 /root/qq-bridge/.secrets/tencent.json（{"secretId":"...","secretKey":"..."}，600）。
// 音色：TTS_VOICE_TYPE，默认 402000（云晓芙 · 聊天女声）。
// 自测：node src/mcp-tts-voice.js test "你好呀" /tmp/t.wav

import path from 'node:path'
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

function projectRoot() {
  try {
    const entry = String(process.argv[1] ?? '')
    if (entry) {
      const dir = path.dirname(path.resolve(entry))
      if (path.basename(dir) === 'src') return path.dirname(dir)
    }
  } catch { /* 忽略 */ }
  return process.cwd()
}

const ROOT = projectRoot()
const CONFIG_PATH = path.join(ROOT, 'config.json')
const AUDIO_DIR = path.join(ROOT, 'audio')
const GEN_DIR = path.join(AUDIO_DIR, 'generated')
const SECRET_FILE = path.join(ROOT, '.secrets', 'tencent.json')

const TTS_HOST = 'tts.tencentcloudapi.com'
const TTS_SERVICE = 'tts'
const TTS_VERSION = '2019-08-23'
const TTS_REGION = process.env.TTS_REGION ?? 'ap-guangzhou'
const VOICE_TYPE = Number(process.env.TTS_VOICE_TYPE ?? 402000)
const SPEED = Number(process.env.TTS_SPEED ?? 1.0)
const VOLUME = Number(process.env.TTS_VOLUME ?? 0)
const SAMPLE_RATE = Number(process.env.TTS_SAMPLE_RATE ?? 24000)
const EMOTION = process.env.TTS_EMOTION ?? ''
const EMOTION_INTENSITY = process.env.TTS_EMOTION_INTENSITY ?? ''
const MAX_CHARS = 100

// 热配置：/root/qq-bridge/.secrets/tts.json 可覆盖 VoiceType/SampleRate/Speed/Volume/EmotionCategory，
// 改完下一次调用即生效，不用重启 DSH。
function hotConfig() {
  try {
    const j = JSON.parse(readFileSync('/root/qq-bridge/.secrets/tts.json', 'utf8'))
    return j && typeof j === 'object' ? j : {}
  } catch { return {} }
}

function credentials() {
  const id = process.env.TENCENTCLOUD_SECRET_ID
  const key = process.env.TENCENTCLOUD_SECRET_KEY
  if (id && key) return { secretId: id, secretKey: key }
  if (existsSync(SECRET_FILE)) {
    const parsed = JSON.parse(readFileSync(SECRET_FILE, 'utf8'))
    if (parsed.secretId && parsed.secretKey) return { secretId: parsed.secretId, secretKey: parsed.secretKey }
  }
  throw new Error('缺少腾讯云凭据：设置 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY，或写入 .secrets/tencent.json')
}

function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function hmac(key, input) {
  return createHmac('sha256', key).update(input, 'utf8').digest()
}

// 腾讯云 API 3.0 TC3-HMAC-SHA256 签名
function signedRequest(payload, action) {
  const { secretId, secretKey } = credentials()
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = [
    'content-type:application/json; charset=utf-8',
    'host:' + TTS_HOST,
    'x-tc-action:' + action.toLowerCase(),
  ].join('\n') + '\n'
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(body)].join('\n')
  const scope = date + '/' + TTS_SERVICE + '/tc3_request'
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), scope, sha256Hex(canonicalRequest)].join('\n')
  const kDate = hmac('TC3' + secretKey, date)
  const kService = hmac(kDate, TTS_SERVICE)
  const kSigning = hmac(kService, 'tc3_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')
  return {
    url: 'https://' + TTS_HOST + '/',
    headers: {
      'content-type': contentType,
      host: TTS_HOST,
      'x-tc-action': action,
      'x-tc-timestamp': String(timestamp),
      'x-tc-version': TTS_VERSION,
      'x-tc-region': TTS_REGION,
      authorization: 'TC3-HMAC-SHA256 Credential=' + secretId + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature,
    },
    body,
  }
}

// --- Fish Audio 分支 -------------------------------------------------------
// 直接用平台上公开音色的 reference_id（「蓝色大肥鱼」），一次 JSON 请求即可：
// 不需要上传参考音频、不需要自建模型、不需要 GPU。
const FISH_HOST = process.env.FISH_HOST ?? 'https://api.fish.audio'
const FISH_MODEL = process.env.FISH_MODEL ?? 's2.1-pro-free'
const FISH_REFERENCE_ID = process.env.FISH_REFERENCE_ID ?? 'fe50cdf3040449298470d58ff0991e1d'
const FISH_SECRET_FILE = path.join(ROOT, '.secrets', 'fish.json')

function fishCredentials() {
  const direct = process.env.FISH_API_KEY
  if (direct) return { apiKey: direct }
  if (existsSync(FISH_SECRET_FILE)) {
    const parsed = JSON.parse(readFileSync(FISH_SECRET_FILE, 'utf8'))
    if (parsed.apiKey) return parsed
  }
  throw new Error('缺少 Fish Audio key：写 .secrets/fish.json {"apiKey":"sk-fish-..."} 或设 FISH_API_KEY')
}

async function synthesizeFish(text, hot = {}) {
  const { apiKey } = fishCredentials()
  const fmt = String(hot.FishFormat ?? process.env.FISH_FORMAT ?? 'mp3').toLowerCase().trim()
  const body = {
    text,
    reference_id: String(hot.FishReferenceId ?? FISH_REFERENCE_ID),
    format: fmt,
    temperature: Number(hot.FishTemperature ?? 0.7),
    top_p: Number(hot.FishTopP ?? 0.7),
    prosody: {
      speed: Number(hot.Speed ?? 1.0),
      volume: Number(hot.Volume ?? 0),
      normalize_loudness: true,
    },
    normalize: true,
    latency: String(hot.FishLatency ?? 'normal'),
  }
  if (fmt === 'mp3') body.mp3_bitrate = Number(hot.FishMp3Bitrate ?? 64)
  else body.sample_rate = Number(hot.FishSampleRate ?? 24000)
  const fishHost = String(hot.FishHost ?? FISH_HOST)
  const res = await fetch(fishHost + '/v1/tts', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json',
      model: String(hot.FishModel ?? FISH_MODEL),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(hot.FishTimeoutMs ?? 20_000)),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error('Fish ' + res.status + ': ' + detail.slice(0, 200))
  }
  const audio = Buffer.from(await res.arrayBuffer())
  if (audio.length < 1000) throw new Error('Fish 返回音频过小（' + audio.length + ' 字节）')
  const ext = fmt === 'mp3' ? '.mp3' : (fmt === 'opus' ? '.ogg' : '.wav')
  return { audio, requestId: 'fish:' + (res.headers.get('x-request-id') || 'ok'), ext }
}

async function synthesize(text) {
  const hot = hotConfig()
  const provider = String(hot.Provider ?? process.env.TTS_PROVIDER ?? 'tencent').toLowerCase().trim()
  if (provider === 'fish' || provider === 'fishaudio') {
    try {
      return await synthesizeFish(text, hot)
    } catch (err) {
      console.error('[qq-voice] Fish 合成失败，回退腾讯云：' + err.message)
    }
  }
  const payload = {
    Text: text,
    SessionId: 'qq-bridge-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    ModelType: Number(hot.ModelType ?? 1),
    VoiceType: Number(hot.VoiceType ?? VOICE_TYPE),
    PrimaryLanguage: 1,
    SampleRate: Number(hot.SampleRate ?? SAMPLE_RATE),
    Codec: hot.Codec ?? 'wav',
    Speed: Number(hot.Speed ?? SPEED),
    Volume: Number(hot.Volume ?? VOLUME),
  }
  const fastVoice = hot.FastVoiceType ?? process.env.TTS_FAST_VOICE_TYPE ?? ''
  if (fastVoice) payload.FastVoiceType = String(fastVoice)
  const emotion = hot.EmotionCategory ?? EMOTION
  if (emotion) {
    payload.EmotionCategory = emotion
    if (EMOTION_INTENSITY) payload.EmotionIntensity = Number(EMOTION_INTENSITY)
  }
  const call = async (p) => {
    const { url, headers, body } = signedRequest(p, 'TextToVoice')
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(30_000) })
    const json = await res.json().catch(() => ({}))
    return (json && json.Response) || {}
  }
  let resp = await call(payload)
  // 基础/精品音色只支持 16k，超自然/大模型音色才吃 24k —— 遇到不支持的采样率就降档重试一次。
  if (resp.Error && String(resp.Error.Code || '').includes('SampleRate') && payload.SampleRate !== 16000) {
    payload.SampleRate = 16000
    resp = await call(payload)
  }
  if (resp.Error) {
    throw new Error(resp.Error.Code + ': ' + resp.Error.Message + '（RequestId ' + (resp.RequestId || '?') + '）')
  }
  if (!resp.Audio) throw new Error('TTS 返回为空（RequestId ' + (resp.RequestId || '?') + '）')
  const audio = Buffer.from(resp.Audio, 'base64')
  if (audio.length < 1000) throw new Error('返回音频过小（' + audio.length + ' 字节）')
  return { audio, requestId: resp.RequestId }
}

const server = new McpServer({ name: 'qq-voice', version: '1.1.0' })

server.tool(
  'qq_say_voice',
  '把一句话合成成语音（默认腾讯云 TTS；.secrets/tts.json 里 Provider=fish 时走 Fish Audio 的大肥鱼音色），并以 QQ 语音条发到指定群/私聊。只用于短句（不超过 100 字），适合语气词、吐槽、一句话回应。发送仍然受桥接白名单与限流约束。',
  {
    text: z.string().describe('要说的内容，短句，不超过 100 字'),
    target: z.string().optional().describe('目标，格式 group:群号 或 private:QQ号；省略则发到配置里第一个白名单群'),
  },
  async ({ text, target }) => {
    const say = String(text ?? '').trim()
    if (!say) return { content: [{ type: 'text', text: 'text 为空' }], isError: true }
    if (say.length > MAX_CHARS) {
      return { content: [{ type: 'text', text: '太长（' + say.length + ' 字），上限 ' + MAX_CHARS }], isError: true }
    }

    let cfg
    try { cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) } catch (e) {
      return { content: [{ type: 'text', text: '读 config.json 失败：' + e.message }], isError: true }
    }

    let dest = String(target ?? '').trim()
    if (!dest) {
      const first = (cfg.allow && cfg.allow.groups && cfg.allow.groups[0]) || ''
      if (!first) return { content: [{ type: 'text', text: '没有指定 target，且白名单为空' }], isError: true }
      dest = 'group:' + first
    }

    let audio
    let requestId
    let ext = '.wav'
    try {
      ({ audio, requestId, ext = '.wav' } = await synthesize(say))
    } catch (error) {
      return { content: [{ type: 'text', text: 'TTS 合成失败：' + error.message }], isError: true }
    }

    mkdirSync(GEN_DIR, { recursive: true })
    const name = createHash('sha1').update(say).digest('hex').slice(0, 12) + ext
    const file = path.join(GEN_DIR, name)
    writeFileSync(file, audio)

    const script = path.join(ROOT, 'scripts', 'send-voice.mjs')
    const run = spawnSync(process.execPath, [script, 'send', 'generated/' + name, dest], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      windowsHide: true,
      env: { ...process.env, PATH: path.dirname(process.execPath) + ':' + (process.env.PATH ?? '') },
    })
    const out = String(run.stdout ?? '') + String(run.stderr ?? '')
    if (run.status !== 0) {
      return { content: [{ type: 'text', text: '发送失败（exit ' + run.status + '）：\n' + out.slice(-600) }], isError: true }
    }
    return {
      content: [{
        type: 'text',
        text: '已发送语音到 ' + dest + '：' + say + '\n（' + Math.round(audio.length / 1024) + ' KB，RequestId ' + requestId + '）\n' +
          out.split(/\r?\n/).filter(l => l.includes('✅') || l.includes('messageId')).join('\n'),
      }],
    }
  },
)

if (process.argv[2] === 'test') {
  const text = process.argv[3] ?? '你好呀，我是小鲸鱼'
  const out = process.argv[4] ?? '/tmp/tts-test.wav'
  synthesize(text).then(({ audio, requestId }) => {
    writeFileSync(out, audio)
    console.log('ok ' + audio.length + ' bytes -> ' + out + ' (RequestId ' + requestId + ')')
  }).catch(err => { console.error('fail:', err.message); process.exit(1) })
} else {
  await server.connect(new StdioServerTransport())
}
