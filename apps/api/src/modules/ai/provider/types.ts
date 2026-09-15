import type {
  ChatMessage,
  DiaryRow,
  EstimateNutritionInput,
  ExtractionResult,
  NutritionDraft,
} from '@tracker/shared';

export type ImageUpload = {
  data: Buffer;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
};

export type PdfUpload = {
  data: Buffer;
  filename: string;
};

/** A tool the assistant may call. `run` is supplied by the tools module. */
export type ChatTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

/** What the provider emits while answering. Mirrors the SSE contract. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; call: ToolCall; output: unknown; isError: boolean }
  | { type: 'usage'; tokens: number };

export type ChatRequest = {
  system: string;
  messages: ChatMessage[];
  tools: ChatTool[];
  /** Executes a tool call and returns what to send back to the model. */
  runTool: (call: ToolCall) => Promise<{ output: unknown; isError: boolean }>;
};

export type ChatResult = {
  /** Provider-neutral blocks to append to the transcript. */
  reply: ChatMessage[];
  tokens: number;
};

/**
 * The only surface the rest of the app sees. Swapping vendors, or dropping in
 * the stub, never reaches a service.
 */
export type LlmProvider = {
  readonly name: string;
  extractNutrition(image: ImageUpload): Promise<ExtractionResult>;
  estimateNutrition(input: EstimateNutritionInput): Promise<{
    draft: NutritionDraft;
    confidence: number;
    warnings: string[];
  }>;
  parseDiary(pdf: PdfUpload): Promise<DiaryRow[]>;
  chat(request: ChatRequest, onEvent: (event: ChatEvent) => void): Promise<ChatResult>;
};
