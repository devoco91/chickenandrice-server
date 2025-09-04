// backend/utils/inventoryName.js

// Normalize any name to a compact, comparable slug
export function normalizeSlug(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "")      // keep only a–z and 0–9
    .trim();
}

// Base slug collapses "extra/half" so both map to same food stock
export function baseFoodSlug(s = "") {
  const raw = normalizeSlug(s);
  return raw.replace(/(?:extra|half)/g, "");
}

/**
 * Heuristics
 * - Moi-moi, Plantain, Pack are FOOD sold in PIECES
 * - Drinks are PIECES
 * - Proteins (chicken/turkey/fish/…) are PIECES
 */
const PIECE_FOOD_TOKENS = /(moimoi|moi|moi-?moi|plantain|dodo|pack|packs)/;
const DRINK_TOKENS =
  /(coke|pepsi|fanta|sprite|water|malt|mirinda|schweppes|soda|drink|juice|bottle|can)/;
const PROTEIN_TOKENS =
  /(chicken|beef|goat|turkey|fish|meat|protein|gizzard|ponmo|shaki|kote|cowleg|egg)/;

// infer "kind" only when the item isn't configured yet
export function inferKind(name = "") {
  const sl = normalizeSlug(name);
  if (PIECE_FOOD_TOKENS.test(sl)) return "food";
  if (PROTEIN_TOKENS.test(sl)) return "protein";
  if (DRINK_TOKENS.test(sl)) return "drink";
  return "food"; // default bucket
}

// decide PIECE vs GRAM for unknown items
export function isPieceByHeuristic(name = "") {
  const sl = normalizeSlug(name);
  return (
    PIECE_FOOD_TOKENS.test(sl) ||
    DRINK_TOKENS.test(sl) ||
    PROTEIN_TOKENS.test(sl)
  );
}

// Plate sizes for foods sold by weight
export function gramsForFoodName(name = "") {
  const sl = normalizeSlug(name);
  // "extra" or "half" => 175g, full plate => 350g
  return /(extra|half)/.test(sl) ? 175 : 350;
}
