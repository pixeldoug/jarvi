/**
 * AI API — typed fetchers for `/api/ai` endpoints other than the chat stream.
 */

import { apiClient } from './apiClient';

export type TextRewriteAction = 'grammar' | 'improve' | 'shorten' | 'expand';

export const aiApi = {
  /** Rewrites a selection (a TipTap doc) and returns the result as Markdown. */
  rewrite(action: TextRewriteAction, doc: { type: 'doc'; content: unknown[] }): Promise<{ markdown: string }> {
    return apiClient.post<{ markdown: string }>('/api/ai/rewrite', { action, doc });
  },
};
