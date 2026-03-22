export interface ParsedExp {
  rawExp: number
  percentage: number
}

const EXP_REGEX = /(\d+)\s*\[\s*(\d{1,2}\.\d{1,2})\s*%\s*\]?/

export function parseExpText(text: string): ParsedExp | null {
  const match = text.match(EXP_REGEX)
  if (!match) return null

  const rawExp = parseInt(match[1], 10)
  const percentage = parseFloat(match[2])

  if (isNaN(rawExp) || isNaN(percentage)) return null

  return { rawExp, percentage }
}
