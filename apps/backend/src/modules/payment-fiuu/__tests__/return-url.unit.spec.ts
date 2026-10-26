import { resolveReturnUrl } from "../utils/return-url"

const allowedOrigin = "https://lcaweb.lca-app.com"

describe("resolveReturnUrl", () => {
  it("uses the session URL when its origin is allowlisted", () => {
    expect(
      resolveReturnUrl({
        fallback: "https://default.example/return",
        requested: "https://lcaweb.lca-app.com/checkout/return",
        allowedOrigins: [allowedOrigin],
      })
    ).toBe("https://lcaweb.lca-app.com/checkout/return")
  })

  it("keeps the global default when no URL is requested", () => {
    expect(
      resolveReturnUrl({ fallback: "https://default.example/return", allowedOrigins: [] })
    ).toBe("https://default.example/return")
  })

  it("rejects an origin that is not allowlisted", () => {
    expect(
      resolveReturnUrl({
        fallback: "https://default.example/return",
        requested: "https://evil.example/checkout/return",
        allowedOrigins: [allowedOrigin],
      })
    ).toBe("https://default.example/return")
  })

  it("rejects malformed, credentialed, and non-https URLs", () => {
    const fallback = "https://default.example/return"
    for (const requested of [
      "not a url",
      "https://user:pass@lcaweb.lca-app.com/checkout/return",
      "https://lcaweb.lca-app.com/checkout/return#fragment",
      "http://lcaweb.lca-app.com/checkout/return",
      "",
      null,
      undefined,
    ]) {
      expect(resolveReturnUrl({ fallback, requested, allowedOrigins: [allowedOrigin] })).toBe(fallback)
    }
  })

  it("allows http only for loopback development origins", () => {
    expect(
      resolveReturnUrl({
        fallback: undefined,
        requested: "http://localhost:3000/checkout/return",
        allowedOrigins: ["http://localhost:3000"],
      })
    ).toBe("http://localhost:3000/checkout/return")

    expect(
      resolveReturnUrl({
        fallback: undefined,
        requested: "http://localhost:3000/checkout/return",
        allowedOrigins: [],
      })
    ).toBeUndefined()
  })
})
