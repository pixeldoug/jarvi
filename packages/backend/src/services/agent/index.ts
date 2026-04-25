/**
 * Public entry point for the unified agent.
 *
 * Both adapters (`runWhatsappAgent`, `streamChat`) preserve the exact public
 * API of the legacy `whatsappAgentService` and `aiChatService` so call sites
 * (`whatsappQueue`, `aiController`) only need an import path swap.
 */

export { runWhatsappAgent, type RunWhatsappAgentOptions } from './channels/whatsapp';
export { streamChat, type SSEEvent, type ChatMessage } from './channels/web';
