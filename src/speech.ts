export const DEFAULT_PREFIX = "Dạ anh Quang, nãy giờ em làm như thế này:"

const MAX_FORM_OPTIONS = 8
const MAX_FORM_SPEECH = 400

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function plain(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

// Ghép câu mở đầu vào tóm tắt; không đọc mỗi câu mở đầu khi tóm tắt rỗng.
export function withPrefix(prefix: string, text: string): string {
  const head = prefix.trim()
  const body = text.trim()
  if (!body) return ""
  return head ? `${head} ${body}` : body
}

// Chỉ lấy câu hỏi đầu tiên (field đầu) kèm các lựa chọn của câu đó.
export function firstFormQuestion(form: unknown): string {
  if (!isRecord(form)) return ""

  const titles: string[] = []
  const addTitle = (value: string) => {
    if (value && !titles.includes(value)) titles.push(value)
  }

  addTitle(plain(form["title"]))
  const fields = Array.isArray(form["fields"]) ? form["fields"] : []
  const first = fields.find(isRecord)
  if (first) addTitle(plain(first["title"]) || plain(first["key"]))

  const options = first && Array.isArray(first["options"]) ? first["options"] : []
  const labels: string[] = []
  for (const option of options) {
    const label = isRecord(option) ? plain(option["label"]) || plain(option["value"]) : plain(option)
    if (label && !labels.includes(label)) labels.push(label)
    if (labels.length >= MAX_FORM_OPTIONS) break
  }

  const parts = [...titles]
  if (labels.length > 0) parts.push(`Các lựa chọn: ${labels.join(", ")}.`)
  const text = parts.join(". ").trim()
  return text.length > MAX_FORM_SPEECH ? text.slice(0, MAX_FORM_SPEECH) : text
}
