import { parseFiuuResponse } from "../utils/response"

describe("parseFiuuResponse", () => {
  it("parses JSON bodies", () => {
    const parsed = parseFiuuResponse(
      JSON.stringify({ StatCode: "00", TranID: "123", Amount: "10.00" })
    )

    expect(parsed.StatCode).toBe("00")
    expect(parsed.TranID).toBe("123")
  })

  it("parses Fiuu key-value text bodies", () => {
    const parsed = parseFiuuResponse(
      [
        "StatCode: 00",
        "StatName: captured",
        "OrderID: payses_123",
        "Amount: 10.00",
        "TranID: 123456",
        "Domain: littlechampion1_Dev",
      ].join("\n")
    )

    expect(parsed.StatCode).toBe("00")
    expect(parsed.StatName).toBe("captured")
    expect(parsed.OrderID).toBe("payses_123")
    expect(parsed.TranID).toBe("123456")
  })

  it("strips surrounding quotes and ignores malformed lines", () => {
    const parsed = parseFiuuResponse('StatCode: "11"\nnoise line\nTranID: 9')

    expect(parsed.StatCode).toBe("11")
    expect(parsed.TranID).toBe("9")
  })

  it("returns an empty object for unknown payloads", () => {
    expect(parseFiuuResponse("")).toEqual({})
    expect(parseFiuuResponse("just text")).toEqual({})
  })
})
