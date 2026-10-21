// Lệnh gửi xuống daemon TTS. Luôn đồng bộ giọng trước khi đọc để tránh
// trường hợp nhiều instance plugin gửi set_voice đè lên nhau.
export function speechCommands(voice: string, id: string, text: string): string[] {
  const commands: string[] = []
  const name = voice.trim()
  if (name) commands.push(JSON.stringify({ cmd: "set_voice", voice: name }))
  commands.push(JSON.stringify({ cmd: "speak", id, text }))
  return commands
}
