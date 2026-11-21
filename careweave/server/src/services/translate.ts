import type { Repos } from '../repo/index.js';
import { ask } from '../clinicalSummary.js';
import { readAiConfig } from './aiConfig.js';

const NAMES: Record<string, string> = { 'en-IN': 'English', 'ta-IN': 'Tamil', 'hi-IN': 'Hindi' };
const BUDGET_MS = 7_000;
const ATTEMPT_MS = 3_500; // one slow model must not use up the whole budget // a caption that arrives late is useless, so everything together must fit in this
const PAUSE_MS = 350;     // the model is often briefly "busy" (HTTP 503): a short pause, then every model is tried again

export type Translation = { text?: string; error?: 'ai-off' | 'failed' };

/**
 * Translates one spoken sentence between the languages of a call with the AI key the administrator stored. Only the sentence is sent:
 * no name, no phone, no chart. When there is no key, or the AI is slow or fails, the caller shows the original sentence alone.
 */
export async function translateSentence(repos: Repos, text: string, from: string, to: string): Promise<Translation> {
  if (!NAMES[from] || !NAMES[to] || from === to) return { error: 'failed' };
  const ai = await readAiConfig(repos);
  if (!ai.key || !ai.features.brief) return { error: 'ai-off' };
  const prompt = `Translate this ${NAMES[from]} sentence into ${NAMES[to]}. It was spoken in a medical consultation and typed by speech recognition, so it may contain small mistakes: translate the meaning the speaker intended, faithfully. Do not add or remove information, do not answer it, do not explain. Reply with the translation only, without quotes.\n\n${text}`;
  // Speed matters more than polish for a live caption: the small fast model first, the others as fallbacks. A model the administrator
  // chose for the other AI features comes last here, because it may be a slow one. (Which models answer quickly changes with demand.)
  const models = [...new Set(['gemini-flash-lite-latest', 'gemini-3.6-flash', 'gemma-4-26b-a4b-it', ai.model].filter(Boolean) as string[])];
  const deadline = Date.now() + BUDGET_MS;
  for (let round = 0; round < 3 && Date.now() < deadline; round++) {
    for (const model of models) {
      const left = deadline - Date.now();
      if (left < 500) return { error: 'failed' };
      const out = await ask(model, prompt, ai.key, Math.min(left, ATTEMPT_MS));
      if (out) return { text: out.replace(/^["“”']+|["“”']+$/g, '').trim().slice(0, 1200) };
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return { error: 'failed' };
}
