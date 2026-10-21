import { describe, expect, test } from "bun:test"
import { DEFAULT_PREFIX, firstFormQuestion, withPrefix } from "./speech"

describe("withPrefix", () => {
  test("gắn câu mở đầu trước phần tóm tắt", () => {
    expect(withPrefix(DEFAULT_PREFIX, "Đã sửa xong plugin.")).toBe(`${DEFAULT_PREFIX} Đã sửa xong plugin.`)
  })

  test("giữ nguyên tóm tắt khi câu mở đầu bị tắt", () => {
    expect(withPrefix("", "Đã sửa xong.")).toBe("Đã sửa xong.")
    expect(withPrefix("   ", "Đã sửa xong.")).toBe("Đã sửa xong.")
  })

  test("không đọc mỗi câu mở đầu khi không có tóm tắt", () => {
    expect(withPrefix(DEFAULT_PREFIX, "")).toBe("")
  })
})

describe("firstFormQuestion", () => {
  test("chỉ đọc câu hỏi đầu tiên kèm các lựa chọn", () => {
    const form = {
      title: "Tạo dự án",
      fields: [
        {
          key: "framework",
          title: "Chọn framework",
          type: "string",
          options: [
            { value: "react", label: "React" },
            { value: "vue", label: "Vue" },
          ],
        },
        {
          key: "database",
          title: "Chọn database",
          type: "string",
          options: [{ value: "postgres", label: "PostgreSQL" }],
        },
      ],
    }

    expect(firstFormQuestion(form)).toBe("Tạo dự án. Chọn framework. Các lựa chọn: React, Vue.")
  })

  test("chỉ đọc câu hỏi khi không có lựa chọn", () => {
    const form = {
      title: "Xác nhận",
      fields: [{ key: "confirm", title: "Tiếp tục?", type: "boolean" }],
    }

    expect(firstFormQuestion(form)).toBe("Xác nhận. Tiếp tục?")
  })

  test("dùng key khi câu hỏi không có title", () => {
    const form = {
      fields: [{ key: "apiKey", type: "string" }],
    }

    expect(firstFormQuestion(form)).toBe("apiKey")
  })

  test("không lặp lại tiêu đề form và tiêu đề câu hỏi", () => {
    const form = {
      title: "Chọn framework",
      fields: [{ key: "framework", title: "Chọn framework", type: "string" }],
    }

    expect(firstFormQuestion(form)).toBe("Chọn framework")
  })

  test("giới hạn tối đa 8 lựa chọn", () => {
    const form = {
      title: "Chọn môi trường",
      fields: [
        {
          key: "env",
          type: "string",
          options: Array.from({ length: 10 }, (_, index) => ({
            value: `env-${index}`,
            label: `Môi trường ${index + 1}`,
          })),
        },
      ],
    }

    const result = firstFormQuestion(form)
    expect(result).toContain("Môi trường 8")
    expect(result).not.toContain("Môi trường 9")
    expect(result).not.toContain("Môi trường 10")
  })

  test("cắt câu quá dài ở 400 ký tự", () => {
    const form = {
      title: "Chọn",
      fields: [
        {
          key: "long",
          type: "string",
          options: Array.from({ length: 8 }, (_, index) => ({
            value: `v${index}`,
            label: "Lựa chọn rất dài ".repeat(10),
          })),
        },
      ],
    }

    expect(firstFormQuestion(form).length).toBeLessThanOrEqual(400)
  })

  test("trả về chuỗi rỗng khi form không hợp lệ", () => {
    expect(firstFormQuestion(undefined)).toBe("")
    expect(firstFormQuestion({})).toBe("")
    expect(firstFormQuestion({ fields: "không phải mảng" })).toBe("")
  })
})
