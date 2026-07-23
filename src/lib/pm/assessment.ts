export type ScoreRow = { weight: number; score: number | null; maxScore: number }

export function computeAssessmentScore(rows: ScoreRow[]): { achieved: number; max: number; pct: number } {
  let achieved = 0
  let max = 0
  for (const r of rows) {
    const w = r.weight > 0 ? r.weight : 0
    max += w * r.maxScore
    if (r.score != null) achieved += w * Math.max(0, Math.min(r.score, r.maxScore))
  }
  return { achieved, max, pct: max > 0 ? (achieved / max) * 100 : 0 }
}
