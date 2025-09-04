// backend/utils/inventoryName.js
export function normalizeSlug(s = "") {
  // lower-case, remove spaces/underscores/hyphens/punctuation
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9]+/g, "")      // keep only a-z0-9
    .trim();
}

// base slug removes "extra" and "half" so they collapse into the same stock
export function baseFoodSlug(s = "") {
  const raw = normalizeSlug(s);
  return raw.replace(/(?:extra|half)/g, ""); // friedriceextra -> friedrice
}

export function isPieceByHeuristic(name = "") {
  const sl = normalizeSlug(name);
  // treat moi-moi/moimoi/moi and plantain/dodo as pieces (not grams)
  return /(moimoi|moimo|moi|moimo|moimois|plantain|dodo)/.test(sl);
}

export function gramsForFoodName(name = "") {
  const sl = normalizeSlug(name);
  // any "extra" or "half" gets 175 g, otherwise a full plate 350 g
  return /(extra|half)/.test(sl) ? 175 : 350;
}
