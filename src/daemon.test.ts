import { describe, expect, test } from "bun:test"
import { speechCommands } from "./daemon"

describe("speechCommands", () => {
  test("gửi set_voice trước speak để daemon dùng đúng giọng", () => {
    const commands = speechCommands("Adam bựa", "42", "Xin chào")
    expect(commands.map((line) => JSON.parse(line).cmd)).toEqual(["set_voice", "speak"])
    expect(JSON.parse(commands[0]).voice).toBe("Adam bựa")
    expect(JSON.parse(commands[1])).toEqual({ cmd: "speak", id: "42", text: "Xin chào" })
  })

  test("bỏ qua set_voice khi chưa có giọng", () => {
    const commands = speechCommands("", "42", "Xin chào")
    expect(commands.map((line) => JSON.parse(line).cmd)).toEqual(["speak"])
  })

  test("bỏ qua giọng chỉ có khoảng trắng", () => {
    const commands = speechCommands("   ", "42", "Xin chào")
    expect(commands.map((line) => JSON.parse(line).cmd)).toEqual(["speak"])
  })
})
