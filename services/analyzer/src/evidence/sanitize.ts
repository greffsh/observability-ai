const redactions: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]"],
  [/(\b(?:api[_-]?key|password|passwd|secret|token)\b\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]"],
  [/(https?:\/\/[^:/\s]+:)[^@/\s]+@/gi, "$1[REDACTED]@"]
]

export const sanitizeString = (value: string, maxLength: number): string => {
  const redacted = redactions.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  )

  return redacted.length <= maxLength
    ? redacted
    : `${redacted.slice(0, maxLength)}…[TRUNCATED]`
}

export const sanitizeUnknown = (value: unknown, maxStringLength: number): unknown => {
  if (typeof value === "string") {
    return sanitizeString(value, maxStringLength)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, maxStringLength))
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sanitizeUnknown(item, maxStringLength)
      ])
    )
  }

  return value
}
