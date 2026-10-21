import { FiuuStatusQueryResponse } from "../types"

/**
 * Fiuu's requery endpoints answer either JSON or a `Key: value` text body
 * depending on the endpoint and account configuration.
 */
export function parseFiuuResponse(text: string): FiuuStatusQueryResponse {
  const trimmed = text.trim()

  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as FiuuStatusQueryResponse
    } catch {
      // Fall through to the line parser.
    }
  }

  const result: Record<string, string> = {}

  for (const line of trimmed.split(/\r?\n/)) {
    const separator = line.indexOf(":")

    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^"|"$/g, "")

    if (key) {
      result[key] = value
    }
  }

  return result as FiuuStatusQueryResponse
}
