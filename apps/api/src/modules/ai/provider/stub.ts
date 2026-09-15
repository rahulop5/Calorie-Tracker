import {
  type ChatMessage,
  type ContentBlock,
  type DiaryRow,
  type EstimateNutritionInput,
  type ExtractionResult,
  type NutritionDraft,
  addDays,
  todayDateOnly,
} from '@tracker/shared';
import type { ChatEvent, ChatRequest, ChatResult, ImageUpload, LlmProvider, PdfUpload } from './types';

/**
 * A provider that answers from fixed rules instead of a model.
 *
 * It exists for two reasons beyond tests: the app stays runnable and demoable
 * with no API key, and it is the thing that proves the port is a real seam
 * rather than a wrapper shaped around one vendor.
 *
 * Selected with LLM_PROVIDER=stub. Never reachable in production unless chosen.
 */

/** Rough macro split so the numbers at least hang together. */
function draftFor(foodName: string, quantity: number, unit: NutritionDraft['unit']): NutritionDraft {
  const scale = quantity / 100;

  return {
    foodName,
    quantity,
    unit,
    calories: Math.round(180 * scale),
    proteinG: Math.round(9 * scale),
    carbsG: Math.round(20 * scale),
    fatG: Math.round(7 * scale),
    micros: { fiber_g: Math.round(2 * scale), sodium_mg: Math.round(120 * scale) },
  };
}

function textOf(message: ChatMessage | undefined): string {
  if (!message) {
    return '';
  }

  return message.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .toLowerCase();
}

export function createStubProvider(): LlmProvider {
  return {
    name: 'stub',

    async extractNutrition(image: ImageUpload): Promise<ExtractionResult> {
      // Branch on size only so the two shapes are both reachable in a demo.
      const isPlate = image.data.length % 2 === 1;

      if (isPlate) {
        return {
          kind: 'PLATE',
          drafts: [
            draftFor('Grilled chicken breast', 150, 'G'),
            draftFor('Steamed rice', 180, 'G'),
          ],
          confidence: 0.62,
          warnings: ['Stub provider: portions are illustrative, not measured.'],
        };
      }

      return {
        kind: 'LABEL',
        drafts: [draftFor('Packaged granola', 100, 'G')],
        confidence: 0.88,
        warnings: ['Stub provider: values are illustrative, not read from the label.'],
      };
    },

    async estimateNutrition(input: EstimateNutritionInput) {
      return {
        draft: draftFor(input.foodName, input.quantity, input.unit),
        confidence: 0.55,
        warnings: ['Stub provider: estimate is illustrative.'],
      };
    },

    async parseDiary(pdf: PdfUpload): Promise<DiaryRow[]> {
      const today = todayDateOnly();

      // One valid row, one with an unparseable date, so the review table's
      // flagged-row path is exercised end to end.
      return [
        { ...draftFor('Porridge with banana', 250, 'G'), entryDate: addDays(today, -2), mealType: 'BREAKFAST' },
        { ...draftFor('Chicken wrap', 220, 'G'), entryDate: addDays(today, -2), mealType: 'LUNCH' },
        { ...draftFor('Lentil curry', 300, 'G'), entryDate: addDays(today, -1), mealType: 'DINNER' },
        { ...draftFor(`Row from ${pdf.filename}`, 100, 'G'), entryDate: null, mealType: 'SNACK' },
      ];
    },

    async chat(request: ChatRequest, onEvent: (event: ChatEvent) => void): Promise<ChatResult> {
      const asked = textOf(request.messages.at(-1));
      const reply: ChatMessage[] = [];

      // Pick a tool by keyword, so the full call -> result -> answer path runs.
      const wanted = asked.includes('goal')
        ? 'get_current_goal'
        : asked.includes('week') || asked.includes('summary') || asked.includes('report')
          ? 'get_nutrition_report'
          : asked.includes('ate') || asked.includes('log')
            ? 'estimate_nutrition'
            : null;

      const tool = request.tools.find((candidate) => candidate.name === wanted);

      if (tool) {
        const call = {
          id: `stub_${Date.now()}`,
          name: tool.name,
          input:
            tool.name === 'estimate_nutrition'
              ? { foodName: 'two scrambled eggs', quantity: 2, unit: 'PIECE' }
              : tool.name === 'get_nutrition_report'
                ? { type: 'summary', from: addDays(todayDateOnly(), -6), to: todayDateOnly() }
                : {},
        };

        onEvent({ type: 'tool_call', call });
        const outcome = await request.runTool(call);
        onEvent({ type: 'tool_result', call, output: outcome.output, isError: outcome.isError });

        reply.push({
          role: 'ASSISTANT',
          content: [{ type: 'tool_call', id: call.id, name: call.name, input: call.input }],
        });
        reply.push({
          role: 'USER',
          content: [
            {
              type: 'tool_result',
              toolCallId: call.id,
              output: outcome.output,
              isError: outcome.isError,
            },
          ],
        });
      }

      const answer = tool
        ? `I checked your data with ${tool.name}. (Stub provider: set LLM_PROVIDER=claude with an API key for real answers.)`
        : 'Stub provider: set LLM_PROVIDER=claude with an API key to get real answers.';

      for (const word of answer.split(' ')) {
        onEvent({ type: 'text', text: `${word} ` });
      }

      reply.push({ role: 'ASSISTANT', content: [{ type: 'text', text: answer }] });

      return { reply, tokens: answer.length };
    },
  };
}
