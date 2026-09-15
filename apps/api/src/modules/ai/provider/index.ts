import { env } from '../../../config/env';
import { createClaudeProvider } from './claude';
import { createStubProvider } from './stub';
import type { LlmProvider } from './types';

let provider: LlmProvider | null = null;

/**
 * Built once, lazily: constructing the Claude client reads credentials, and a
 * deployment running with the stub should never need them.
 */
export function getProvider(): LlmProvider {
  provider ??= env.LLM_PROVIDER === 'claude' ? createClaudeProvider() : createStubProvider();

  return provider;
}

export type * from './types';
