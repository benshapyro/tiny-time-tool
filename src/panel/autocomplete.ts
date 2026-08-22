// BUILD_SPEC S4: "autocomplete over recent task names after 2 chars." Pure
// filter over an already-fetched candidate list (recency/dedup ordering is
// `TimerEngine.recentTaskNames`'s job — see `timerEngine.ts`); this module
// only decides which of those candidates match what's currently typed.

export const MIN_AUTOCOMPLETE_CHARS = 2;

/** Case-insensitive prefix match against `candidates`, preserving their
 * given order (caller controls recency ordering). Returns no suggestions
 * below `MIN_AUTOCOMPLETE_CHARS`. */
export function filterAutocomplete(candidates: readonly string[], typed: string): string[] {
  if (typed.length < MIN_AUTOCOMPLETE_CHARS) return [];
  const needle = typed.toLowerCase();
  return candidates.filter((candidate) => candidate.toLowerCase().startsWith(needle));
}
