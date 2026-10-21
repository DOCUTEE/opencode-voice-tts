// voice-tts — OpenCode V2 plugin: tóm tắt câu trả lời và đọc to bằng giọng tiếng Việt tự nhiên.
//
// Engine đọc:
//   - "omnivoice": OmniVoice (MLX, giọng thiết kế + clone vùng miền) — mặc định
//   - "vieneu":    VieNeu-TTS (ONNX, 25 giọng dựng sẵn)
//   - "say":       giọng macOS có sẵn (dự phòng, luôn hoạt động)
//
// Lệnh trong TUI:
//   /tts                     — bật/tắt đọc tự động
//   /tts on|off|status       — điều khiển tường minh
//   /tts-stop                — dừng câu đang đọc
//   /tts-summary on|off      — bật/tắt tóm tắt trước khi đọc
//   /tts-prefix [câu|off]    — đổi câu mở đầu trước phần tóm tắt
//   /tts-engine <tên>        — chọn engine đọc
//   /tts-voice [tên]         — chọn giọng (không tên = xem danh sách)
//   /tts-rate <số>           — tốc độ cho engine "say" (80-400)
//   /tts-setup [cờ]          — cài runtime Python trên máy mới (--with-8bit, --warm)

import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin"
import { speechCommands } from "./daemon"
import { DEFAULT_PREFIX, firstFormQuestion, withPrefix } from "./speech"

type Engine = "omnivoice" | "vieneu" | "say"

type Settings = {
  enabled: boolean
  engine: Engine
  omnivoiceVoice: string
  vieneuVoice: string
  voice: string
  rate: number
  summarize: boolean
  prefix: string
  maxChars: number
  announcePermissions: boolean
  announceErrors: boolean
}

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  engine: "omnivoice",
  omnivoiceVoice: "clone:nam-nam",
  vieneuVoice: "Ngọc Huyền",
  voice: "Linh",
  rate: 190,
  summarize: true,
  prefix: DEFAULT_PREFIX,
  maxChars: 280,
  announcePermissions: true,
  announceErrors: true,
}

const SETTINGS_KEY = "settings"
const PKG_ROOT = fileURLToPath(new URL("..", import.meta.url))
const PYTHON_DIR = `${PKG_ROOT}python/`
const RUNTIME_DIR = process.env.VOICE_TTS_HOME ?? `${homedir()}/.local/share/opencode-voice-tts`
const DAEMON_SCRIPT = `${PYTHON_DIR}daemon.py`
const SETUP_SCRIPT = `${PKG_ROOT}scripts/setup.sh`
const HANDY_SCRIPT = `${PKG_ROOT}scripts/setup_handy.sh`

type EngineRuntime = {
  python: string
  env: Record<string, string>
}

const ENGINE_RUNTIME: Record<"omnivoice" | "vieneu", EngineRuntime> = {
  omnivoice: {
    python: `${RUNTIME_DIR}/venv-mlx/bin/python`,
    env: { TTS_ENGINE: "omnivoice" },
  },
  vieneu: {
    python: `${RUNTIME_DIR}/venv-vieneu/bin/python`,
    env: { TTS_ENGINE: "vieneu" },
  },
}

function engineInstalled(engine: "omnivoice" | "vieneu"): boolean {
  try {
    return existsSync(ENGINE_RUNTIME[engine].python)
  } catch {
    return false
  }
}

function log(level: "info" | "warn" | "error", message: string) {
  console.log(`[voice-tts] ${level}: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS }
  const pick = <K extends keyof Settings>(key: K, fallback: Settings[K]): Settings[K] =>
    typeof value[key] === typeof fallback ? (value[key] as Settings[K]) : fallback
  const engine = pick("engine", DEFAULT_SETTINGS.engine)
  const storedMaxChars = pick("maxChars", DEFAULT_SETTINGS.maxChars)
  return {
    enabled: pick("enabled", DEFAULT_SETTINGS.enabled),
    engine: engine === "say" || engine === "vieneu" || engine === "omnivoice" ? engine : DEFAULT_SETTINGS.engine,
    omnivoiceVoice: pick("omnivoiceVoice", DEFAULT_SETTINGS.omnivoiceVoice),
    vieneuVoice: pick("vieneuVoice", DEFAULT_SETTINGS.vieneuVoice),
    voice: pick("voice", DEFAULT_SETTINGS.voice),
    rate: pick("rate", DEFAULT_SETTINGS.rate),
    summarize: pick("summarize", DEFAULT_SETTINGS.summarize),
    prefix: pick("prefix", DEFAULT_SETTINGS.prefix),
    // 700 là giá trị mặc định cũ (quá dài khiến TTS chậm); hạ về mặc định mới.
    maxChars: storedMaxChars === 700 ? DEFAULT_SETTINGS.maxChars : storedMaxChars,
    announcePermissions: pick("announcePermissions", DEFAULT_SETTINGS.announcePermissions),
    announceErrors: pick("announceErrors", DEFAULT_SETTINGS.announceErrors),
  }
}

// Loại code, bảng, markdown trước khi đọc để câu nói nghe tự nhiên.
function cleanForSpeech(markdown: string, maxChars: number): string {
  let text = markdown
  text = text.replace(/```[\s\S]*?```/g, " ")
  text = text.replace(/~~~[\s\S]*?~~~/g, " ")
  text = text.replace(/`([^`]+)`/g, "$1")
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, "")
  text = text.replace(/^\s{0,3}>\s?/gm, "")
  text = text.replace(/^\s*[-*+]\s+/gm, "")
  text = text.replace(/^\s*\d+[.)]\s+/gm, "")
  text = text.replace(/^\s*\|.*\|\s*$/gm, " ")
  text = text.replace(/^\s*[-:|\s]+$/gm, " ")
  text = text.replace(/[*_~#]/g, "")
  text = text.replace(/https?:\/\/\S+/g, "liên kết")
  text = text.replace(/\s+/g, " ").trim()
  return text.length > maxChars ? text.slice(0, maxChars) : text
}

const SUMMARY_PROMPT = [
  "Bạn là trợ lý giọng nói. Hãy tóm tắt nội dung dưới đây thành tối đa 2 câu tiếng Việt ngắn gọn, dễ nghe khi đọc to.",
  "Quy tắc:",
  "- Tổng cộng dưới 40 từ. Chỉ nêu kết quả chính và việc cần làm tiếp theo (nếu có).",
  "- Không đọc code, đường dẫn file, tên biến dài, bảng biểu hay markdown.",
  "- Giữ nguyên các thuật ngữ ngắn như API, build, test, commit nếu cần.",
  "- Không mở đầu bằng 'Tóm tắt' hay 'Nội dung này'.",
  "- Nếu có lỗi hoặc việc đang chờ duyệt thì nói rõ.",
  "Chỉ trả về phần tóm tắt.",
].join("\n")

export default Plugin.define({
  id: "voice-tts",
  async setup(ctx) {
    if (process.platform !== "darwin") return

    let settings = normalizeSettings(await ctx.storage.get(SETTINGS_KEY))
    let sayProcess: ChildProcess | null = null
    let daemon: ChildProcess | null = null
    let daemonEngine: "omnivoice" | "vieneu" | null = null
    let daemonReady = false
    let daemonVoices: Array<[string, string]> = []
    let daemonBuffer = ""
    let pendingSpeech: string | null = null

    const save = async () => {
      await ctx.storage.set(SETTINGS_KEY, settings as unknown as Record<string, never>)
    }

    // Nhiều location có thể nạp cùng plugin; mỗi instance phải đọc lại storage
    // trước khi đọc để không dùng setting cũ đè lên daemon dùng chung.
    const refreshSettings = async () => {
      settings = normalizeSettings(await ctx.storage.get(SETTINGS_KEY))
      return settings
    }

    const currentVoice = (): string => {
      if (settings.engine === "omnivoice") return settings.omnivoiceVoice
      if (settings.engine === "vieneu") return settings.vieneuVoice
      return settings.voice
    }

    const setCurrentVoice = (name: string) => {
      if (settings.engine === "omnivoice") settings.omnivoiceVoice = name
      else if (settings.engine === "vieneu") settings.vieneuVoice = name
      else settings.voice = name
    }

    // ---------- engine "say" ----------

    const stopSay = () => {
      if (sayProcess && !sayProcess.killed) sayProcess.kill("SIGTERM")
      sayProcess = null
    }

    const speakWithSay = (text: string) => {
      stopSay()
      const args: string[] = []
      if (settings.voice) args.push("-v", settings.voice)
      if (settings.rate > 0) args.push("-r", String(settings.rate))
      args.push(text.length > 4000 ? text.slice(0, 4000) : text)
      const child = spawn("/usr/bin/say", args, { stdio: "ignore" })
      sayProcess = child
      child.on("error", (error) => {
        log("error", `say failed: ${String(error)}`)
        if (sayProcess === child) sayProcess = null
      })
      child.on("exit", () => {
        if (sayProcess === child) sayProcess = null
      })
    }

    // ---------- engine cục bộ (daemon Python dùng chung giao thức) ----------

    const handleDaemonLine = (line: string) => {
      let event: Record<string, unknown>
      try {
        event = JSON.parse(line)
      } catch {
        return
      }
      if (event["event"] === "ready") {
        daemonReady = true
        const voices = Array.isArray(event["voices"]) ? (event["voices"] as unknown[]) : []
        daemonVoices = voices
          .filter((item): item is [string, string] => Array.isArray(item) && item.length >= 2)
          .map((item) => [String(item[0]), String(item[1])])
        void (async () => {
          await refreshSettings()
          if (!currentVoice() && daemonVoices.length > 0) {
            setCurrentVoice(daemonVoices[0][1])
            await save()
          }
          const child = daemon
          if (!child?.stdin?.writable) return
          if (pendingSpeech) {
            const text = pendingSpeech
            pendingSpeech = null
            for (const line of speechCommands(currentVoice(), String(Date.now()), text)) {
              child.stdin.write(line + "\n")
            }
            return
          }
          if (currentVoice()) {
            child.stdin.write(JSON.stringify({ cmd: "set_voice", voice: currentVoice() }) + "\n")
          }
        })().catch((error) => log("warn", `không đồng bộ giọng: ${String(error)}`))
        log("info", `${daemonEngine} ready — giọng: ${currentVoice() || "(mặc định)"}`)
        return
      }
      if (event["event"] === "voices") {
        const voices = Array.isArray(event["voices"]) ? (event["voices"] as unknown[]) : []
        daemonVoices = voices
          .filter((item): item is [string, string] => Array.isArray(item) && item.length >= 2)
          .map((item) => [String(item[0]), String(item[1])])
        return
      }
      if (event["event"] === "error") {
        log("warn", `${daemonEngine}: ${String(event["message"] ?? "unknown error")}`)
      }
    }

    const stopDaemon = () => {
      pendingSpeech = null
      if (daemon?.stdin?.writable) daemon.stdin.write(JSON.stringify({ cmd: "shutdown" }) + "\n")
      daemon = null
      daemonEngine = null
      daemonReady = false
      daemonVoices = []
    }

    const ensureDaemon = (): ChildProcess | null => {
      if (settings.engine === "say") return null
      if (daemon && daemon.exitCode === null && !daemon.killed && daemonEngine === settings.engine) return daemon
      if (daemon) stopDaemon()
      if (!engineInstalled(settings.engine)) {
        log("warn", `runtime ${settings.engine} chưa cài — dùng /tts-setup để cài`)
        return null
      }
      const runtime = ENGINE_RUNTIME[settings.engine]
      try {
        const child = spawn(runtime.python, [DAEMON_SCRIPT], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            ...runtime.env,
            VOICE_TTS_HOME: RUNTIME_DIR,
            VOICE_TTS_ASSETS: PYTHON_DIR,
          },
        })
        daemon = child
        daemonEngine = settings.engine
        daemonReady = false
        daemonBuffer = ""
        child.stdout?.setEncoding("utf8")
        child.stdout?.on("data", (chunk: string) => {
          daemonBuffer += chunk
          const lines = daemonBuffer.split("\n")
          daemonBuffer = lines.pop() ?? ""
          for (const line of lines) handleDaemonLine(line.trim())
        })
        child.stderr?.setEncoding("utf8")
        child.stderr?.on("data", (chunk: string) => {
          const message = chunk.trim()
          if (message) log("info", `${daemonEngine}: ${message}`)
        })
        child.on("error", (error) => {
          log("error", `không chạy được daemon ${daemonEngine}: ${String(error)}`)
          if (pendingSpeech) {
            const text = pendingSpeech
            pendingSpeech = null
            speakWithSay(text)
          }
        })
        child.on("exit", (code) => {
          if (daemon === child) {
            log("warn", `daemon ${daemonEngine} thoát (code ${code})`)
            daemon = null
            daemonEngine = null
            daemonReady = false
          }
        })
        return child
      } catch (error) {
        log("error", `không tạo được daemon: ${String(error)}`)
        return null
      }
    }

    const speakWithLocalEngine = (text: string): boolean => {
      if (settings.engine === "say") return false
      const child = ensureDaemon()
      if (!child) return false
      if (daemonReady && child.stdin?.writable) {
        for (const line of speechCommands(currentVoice(), String(Date.now()), text)) {
          child.stdin.write(line + "\n")
        }
        return true
      }
      // Daemon đang nạp model: giữ câu mới nhất, đọc ngay khi sẵn sàng.
      pendingSpeech = text
      return true
    }

    const stopLocalEngine = () => {
      pendingSpeech = null
      if (daemon?.stdin?.writable) daemon.stdin.write(JSON.stringify({ cmd: "stop" }) + "\n")
    }

    // ---------- giao diện chung ----------

    const stopSpeaking = () => {
      stopSay()
      stopLocalEngine()
    }

    const speak = (raw: string, options?: { force?: boolean }) => {
      if (!settings.enabled && !options?.force) return
      if (!raw) return
      if (speakWithLocalEngine(raw)) return
      speakWithSay(raw)
    }

    const summarizeForSpeech = async (sessionID: string, text: string): Promise<string> => {
      const cleaned = cleanForSpeech(text, 6000)
      if (!settings.summarize || cleaned.length <= 300) return cleanForSpeech(text, settings.maxChars)
      try {
        const session = await ctx.session.get({ sessionID }).catch(() => undefined)
        const model = session?.model
        const prompt = `${SUMMARY_PROMPT}\n\n---\n${cleaned}`
        const input = model
          ? { prompt, model: { providerID: model.providerID, id: model.id, variant: model.variant } }
          : { prompt }
        const result = await ctx.generate.text(input as Parameters<typeof ctx.generate.text>[0])
        const summary = cleanForSpeech(String(result?.text ?? ""), settings.maxChars)
        if (summary) return summary
      } catch (error) {
        log("warn", `không tóm tắt được: ${String(error)}`)
      }
      return cleanForSpeech(text, settings.maxChars)
    }

    const belongsToThisLocation = (eventLocation: unknown): boolean => {
      if (!isRecord(eventLocation)) return true
      const directory = eventLocation["directory"]
      if (typeof directory !== "string" || !directory) return true
      return directory === ctx.location.directory
    }

    const isRootSession = async (sessionID: string): Promise<boolean> => {
      try {
        const session = await ctx.session.get({ sessionID })
        if (!session) return false
        if (session.parentID) return false
        const location = session.location
        if (location && location.directory !== ctx.location.directory) return false
        return true
      } catch {
        return false
      }
    }

    const lastAssistantText = async (sessionID: string): Promise<string> => {
      try {
        const messages = await ctx.session.context({ sessionID })
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i]
          if (!message || message.type !== "assistant") continue
          if (!("content" in message) || !Array.isArray(message.content)) continue
          const text = message.content
            .filter((part): part is { type: "text"; text: string } =>
              isRecord(part) && part["type"] === "text" && typeof part["text"] === "string",
            )
            .map((part) => part.text)
            .join("\n")
            .trim()
          if (text) return text
        }
      } catch (error) {
        log("warn", `cannot read session context: ${String(error)}`)
      }
      return ""
    }

    const note = async (sessionID: string, text: string) => {
      try {
        await ctx.session.synthetic({ sessionID, text })
      } catch {
        // synthetic không quan trọng, bỏ qua nếu lỗi
      }
    }

    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (!event || typeof event.type !== "string") continue
        if (!belongsToThisLocation(event.location)) continue
        const data = isRecord(event.data) ? event.data : undefined
        const sessionID = typeof data?.["sessionID"] === "string" ? data["sessionID"] : undefined

        if (event.type === "session.execution.succeeded" && sessionID) {
          await refreshSettings()
          if (!settings.enabled) continue
          if (!(await isRootSession(sessionID))) continue
          const answer = await lastAssistantText(sessionID)
          if (!answer) continue
          const summary = await summarizeForSpeech(sessionID, answer)
          if (summary) speak(withPrefix(settings.prefix, summary))
          continue
        }

        if (event.type === "session.execution.failed" && sessionID) {
          await refreshSettings()
          if (!settings.enabled || !settings.announceErrors) continue
          if (!(await isRootSession(sessionID))) continue
          speak("Phiên làm việc gặp lỗi. Mời bạn xem chi tiết trên màn hình.")
          continue
        }

        if (event.type === "permission.asked" && sessionID) {
          await refreshSettings()
          if (!settings.enabled || !settings.announcePermissions) continue
          if (!(await isRootSession(sessionID))) continue
          const action = typeof data?.["action"] === "string" ? data["action"] : "một thao tác"
          speak(`OpenCode đang chờ bạn phê duyệt ${action}.`)
          continue
        }

        if (event.type === "form.created") {
          await refreshSettings()
          if (!settings.enabled || !settings.announcePermissions) continue
          const form = isRecord(data?.["form"]) ? data["form"] : undefined
          const formSessionID = typeof form?.["sessionID"] === "string" ? form["sessionID"] : undefined
          if (!formSessionID || !(await isRootSession(formSessionID))) continue
          const question = firstFormQuestion(form)
          if (!question) continue
          speak(`OpenCode có câu hỏi cần bạn trả lời. ${question}`)
        }
      }
    })().catch((error) => {
      if (!controller.signal.aborted) {
        log("error", `event stream stopped: ${String(error)}`)
      }
    })

    await ctx.command.transform((editor) => {
      editor.add({
        name: "tts",
        description: "Bật/tắt đọc câu trả lời bằng giọng nói (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const argument = (prompt.text ?? "").trim().toLowerCase()
          if (argument === "on" || argument === "bật" || argument === "bat") {
            settings.enabled = true
          } else if (argument === "off" || argument === "tắt" || argument === "tat") {
            settings.enabled = false
            stopSpeaking()
          } else if (argument === "status" || argument === "trangthai" || argument === "trạng thái") {
            const runtimeStatus = [
              `vieneu: ${engineInstalled("vieneu") ? "đã cài" : "chưa cài"}`,
              `omnivoice: ${engineInstalled("omnivoice") ? "đã cài" : "chưa cài"}`,
            ].join(", ")
            await note(
              sessionID,
              `voice-tts: ${settings.enabled ? "đang bật" : "đang tắt"} · engine ${settings.engine} · giọng ${currentVoice() || "(mặc định)"} · tóm tắt ${settings.summarize ? "bật" : "tắt"} · mở đầu ${settings.prefix ? `"${settings.prefix}"` : "tắt"} · runtime: ${runtimeStatus}`,
            )
            return
          } else {
            settings.enabled = !settings.enabled
            if (!settings.enabled) stopSpeaking()
          }
          await save()
          const message = settings.enabled ? "Đã bật đọc câu trả lời." : "Đã tắt đọc câu trả lời."
          await note(sessionID, `voice-tts: ${message}`)
          speak(message, { force: true })
        },
      })

      editor.add({
        name: "tts-stop",
        description: "Dừng câu đang đọc (voice-tts)",
        execute: async ({ sessionID }) => {
          stopSpeaking()
          await note(sessionID, "voice-tts: đã dừng đọc.")
        },
      })

      editor.add({
        name: "tts-summary",
        description: "Bật/tắt tóm tắt ngắn trước khi đọc (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const argument = (prompt.text ?? "").trim().toLowerCase()
          if (argument === "on" || argument === "bật" || argument === "bat") settings.summarize = true
          else if (argument === "off" || argument === "tắt" || argument === "tat") settings.summarize = false
          else settings.summarize = !settings.summarize
          await save()
          await note(sessionID, `voice-tts: tóm tắt ${settings.summarize ? "đã bật" : "đã tắt"}.`)
          speak(`Tóm tắt ${settings.summarize ? "đã bật" : "đã tắt"}.`, { force: true })
        },
      })

      editor.add({
        name: "tts-prefix",
        description: "Đổi câu mở đầu trước phần tóm tắt, hoặc off để tắt (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const raw = (prompt.text ?? "").trim()
          if (!raw) {
            await note(
              sessionID,
              `voice-tts: câu mở đầu ${settings.prefix ? `"${settings.prefix}"` : "đang tắt"}.`,
            )
            return
          }
          const argument = raw.toLowerCase()
          if (argument === "off" || argument === "tắt" || argument === "tat") {
            settings.prefix = ""
            await save()
            await note(sessionID, "voice-tts: đã tắt câu mở đầu.")
            speak("Đã tắt câu mở đầu.", { force: true })
            return
          }
          settings.prefix = raw
          await save()
          await note(sessionID, `voice-tts: câu mở đầu "${raw}".`)
          speak("Đã đặt câu mở đầu mới.", { force: true })
        },
      })

      editor.add({
        name: "tts-engine",
        description: "Chọn engine đọc: omnivoice | vieneu | say (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const argument = (prompt.text ?? "").trim().toLowerCase()
          if (argument !== "omnivoice" && argument !== "vieneu" && argument !== "say") {
            await note(sessionID, "voice-tts: dùng /tts-engine omnivoice | vieneu | say")
            return
          }
          settings.engine = argument
          await save()
          await note(sessionID, `voice-tts: engine ${argument}.`)
          speak(`Đã chọn engine ${argument}.`, { force: true })
        },
      })

      editor.add({
        name: "tts-voice",
        description: "Chọn giọng đọc (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const name = (prompt.text ?? "").trim()
          if (!name) {
            if (settings.engine === "say") {
              await note(sessionID, `voice-tts: giọng macOS hiện tại "${settings.voice}". Ví dụ: /tts-voice Linh`)
              return
            }
            const list = daemonVoices.length
              ? daemonVoices.map(([label, id]) => `${label} (${id})`).join(", ")
              : "chưa nạp danh sách — thử lại sau vài giây"
            await note(sessionID, `voice-tts: engine ${settings.engine}, giọng hiện tại "${currentVoice() || "(mặc định)"}". Có sẵn: ${list}`)
            return
          }

          // Khớp mờ: người dùng có thể nói "nam miền trung" thay vì gõ đúng ID.
          const normalize = (value: string) =>
            value
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
          let chosen = name
          let chosenLabel = name
          if (daemonVoices.length > 0) {
            const tokens = normalize(name)
              .split(/[^a-z0-9:]+/)
              .filter(Boolean)
            let bestScore = 0
            for (const [label, id] of daemonVoices) {
              const haystack = normalize(`${label} ${id}`)
              const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0)
              if (score > bestScore) {
                bestScore = score
                chosen = id
                chosenLabel = label
              }
            }
            const needed = tokens.length > 1 ? Math.ceil(tokens.length / 2) : 1
            if (bestScore < needed) {
              chosen = name
              chosenLabel = name
            }
          }
          setCurrentVoice(chosen)
          await save()
          if (daemon?.stdin?.writable) daemon.stdin.write(JSON.stringify({ cmd: "set_voice", voice: chosen }) + "\n")
          await note(sessionID, `voice-tts: đã đổi giọng sang "${chosenLabel}" (${chosen}).`)
          speak(`Đã đổi giọng đọc sang ${chosenLabel}.`, { force: true })
        },
      })

      editor.add({
        name: "tts-setup",
        description: "Cài runtime giọng đọc trên máy mới: /tts-setup [--with-8bit] [--warm] [--no-handy] (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const flags = (prompt.text ?? "")
            .trim()
            .split(/\s+/)
            .filter((token) => ["--with-8bit", "--warm", "--no-handy"].includes(token))
          await note(sessionID, `voice-tts: bắt đầu cài runtime (${flags.join(" ") || "mặc định"}) — quá trình có thể mất vài phút...`)
          const child = spawn("bash", [SETUP_SCRIPT, ...flags], {
            env: { ...process.env, VOICE_TTS_HOME: RUNTIME_DIR },
          })
          let tail = ""
          const collect = (chunk: unknown) => {
            tail = (tail + String(chunk)).slice(-1200)
          }
          child.stdout?.on("data", collect)
          child.stderr?.on("data", collect)
          child.on("error", async (error) => {
            await note(sessionID, `voice-tts: không chạy được setup: ${String(error)}`)
          })
          child.on("exit", async (code) => {
            const ok = code === 0
            await note(
              sessionID,
              `voice-tts: cài runtime ${ok ? "xong" : `lỗi (code ${code})`}.\n${tail.trim()}`,
            )
            if (ok && settings.enabled && settings.engine !== "say") {
              setTimeout(() => ensureDaemon(), 1000)
            }
          })
        },
      })

      editor.add({
        name: "tts-rate",
        description: "Đổi tốc độ đọc cho engine say (voice-tts)",
        execute: async ({ sessionID, prompt }) => {
          const value = Number.parseInt((prompt.text ?? "").trim(), 10)
          if (!Number.isFinite(value) || value < 80 || value > 400) {
            await note(sessionID, "voice-tts: dùng /tts-rate <80-400>, ví dụ /tts-rate 190")
            return
          }
          settings.rate = value
          await save()
          await note(sessionID, `voice-tts: tốc độ đọc ${value} từ/phút.`)
          speak(`Tốc độ đọc ${value} từ mỗi phút.`, { force: true })
        },
      })
    })

    log("info", `plugin đã nạp (engine ${settings.engine})`)

    // Làm ấm daemon để câu trả lời đầu tiên không phải chờ nạp model.
    if (settings.enabled && settings.engine !== "say" && engineInstalled(settings.engine)) {
      setTimeout(() => ensureDaemon(), 3000)
    }

    return () => {
      controller.abort()
      stopSpeaking()
      stopDaemon()
    }
  },
})
