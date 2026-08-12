// 実在のAuth0 Organization ID（org_...形式）とは絶対に衝突しない予約値。
// user.created時点ではまだ所属orgが分からないため、この値を仮のorg_idとして使う。
export const UNASSIGNED_ORG_ID = '__unassigned__';
