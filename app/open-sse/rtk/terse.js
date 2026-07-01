import { injectSystemPrompt } from "./systemInject.js";
import { TERSE_PROMPTS } from "./tersePrompts.js";

export function injectTerse(body, format, level) {
  injectSystemPrompt(body, format, TERSE_PROMPTS[level]);
}
