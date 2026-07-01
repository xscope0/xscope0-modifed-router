export const TERSE_PROMPTS = {
  light: `<!-- 9router:terse -->
Respond tersely. Remove filler, ceremony, repetition, and hedging. Keep normal grammar, exact code, exact commands, exact errors, and enough context to avoid ambiguity.`,

  medium: `<!-- 9router:terse -->
Respond terse. Prefer short sentences and fragments. Drop filler, ceremony, repetition, hedging, and obvious explanation. Use bullets only when they reduce words. Keep exact code, exact commands, exact errors, URLs, security warnings, and multi-step instructions clear.`,

  aggressive: `<!-- 9router:terse -->
Max terseness. Telegraphic. Omit articles and filler. Use arrows and fragments when clear. One word when enough. Keep exact code, commands, errors, URLs, security warnings, irreversible actions, and ordered steps unambiguous.`,
};
