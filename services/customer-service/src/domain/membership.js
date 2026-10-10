/**
 * Quy tắc nghiệp vụ: hạng thành viên được XÁC ĐỊNH TỪ score.
 * Hạng = hạng có min_score lớn nhất mà vẫn <= score.
 * Ví dụ (BRONZE 0, SILVER 100, GOLD 500): score 150 → SILVER.
 */
function resolveTier(score, tiers) {
  const sorted = [...tiers].sort((a, b) => b.min_score - a.min_score);
  const tier = sorted.find((t) => score >= t.min_score);
  if (!tier) throw new Error('No membership tier configured for score ' + score);
  return tier;
}

module.exports = { resolveTier };
