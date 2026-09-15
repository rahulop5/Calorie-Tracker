import type {
  AuthResponse,
  ChatMessageRecord,
  Conversation,
  CreateConversationInput,
  EstimateNutritionInput,
  EstimateResult,
  ExtractionResult,
  ImportCandidate,
  BulkEntryInput,
  BulkEntryResult,
  CaloriePoint,
  Entry,
  EntryInput,
  EntryListQuery,
  EntryUpdate,
  Goal,
  GoalUpdate,
  GoalVsActualPoint,
  LoginInput,
  MacroPoint,
  MealBreakdownReport,
  MicrosReport,
  PageMeta,
  PublicUser,
  RegisterInput,
  SummaryReport,
  WeightLog,
  WeightLogInput,
  WeightPoint,
} from '@tracker/shared';
import { apiRequest, apiUpload } from './client';

export type Page<T> = { data: T[]; meta: PageMeta };

export type ReportRange = { from: string; to: string };
export type BucketedRange = ReportRange & { groupBy?: 'day' | 'week'; page?: number; pageSize?: number };

export const authApi = {
  register(input: RegisterInput) {
    return apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: input });
  },
  login(input: LoginInput) {
    return apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: input });
  },
  logout() {
    return apiRequest<void>('/auth/logout', { method: 'POST' });
  },
  me() {
    return apiRequest<PublicUser>('/auth/me');
  },
};

export const goalsApi = {
  current(on?: string) {
    return apiRequest<Goal>('/goals/current', { query: { on } });
  },
  history(page: number, pageSize = 10) {
    return apiRequest<Page<Goal>>('/goals', { query: { page, pageSize } });
  },
  save(input: GoalUpdate) {
    return apiRequest<Goal>('/goals', { method: 'POST', body: input });
  },
};

export const weightsApi = {
  list(query: { from?: string; to?: string; page?: number; pageSize?: number }) {
    return apiRequest<Page<WeightLog>>('/weights', { query });
  },
  latest() {
    return apiRequest<WeightLog>('/weights/latest');
  },
  save(input: WeightLogInput) {
    return apiRequest<WeightLog>('/weights', { method: 'PUT', body: input });
  },
  remove(id: string) {
    return apiRequest<void>(`/weights/${id}`, { method: 'DELETE' });
  },
};

export const entriesApi = {
  list(query: Partial<EntryListQuery>) {
    return apiRequest<Page<Entry>>('/entries', { query });
  },
  get(id: string) {
    return apiRequest<Entry>(`/entries/${id}`);
  },
  create(input: EntryInput) {
    return apiRequest<Entry>('/entries', { method: 'POST', body: input });
  },
  createBulk(input: BulkEntryInput) {
    return apiRequest<BulkEntryResult>('/entries/bulk', { method: 'POST', body: input });
  },
  update(id: string, input: EntryUpdate) {
    return apiRequest<Entry>(`/entries/${id}`, { method: 'PATCH', body: input });
  },
  remove(id: string) {
    return apiRequest<void>(`/entries/${id}`, { method: 'DELETE' });
  },
};

export const reportsApi = {
  summary(range: ReportRange) {
    return apiRequest<SummaryReport>('/reports/summary', { query: range });
  },
  calories(range: BucketedRange) {
    return apiRequest<Page<CaloriePoint>>('/reports/calories', { query: range });
  },
  macros(range: BucketedRange) {
    return apiRequest<Page<MacroPoint>>('/reports/macros', { query: range });
  },
  micros(range: ReportRange) {
    return apiRequest<MicrosReport>('/reports/micros', { query: range });
  },
  goalVsActual(range: BucketedRange) {
    return apiRequest<Page<GoalVsActualPoint>>('/reports/goal-vs-actual', { query: range });
  },
  mealBreakdown(range: ReportRange) {
    return apiRequest<MealBreakdownReport>('/reports/meal-breakdown', { query: range });
  },
  weight(range: BucketedRange) {
    return apiRequest<Page<WeightPoint>>('/reports/weight', { query: range });
  },
};

export const aiApi = {
  extractFromPhoto(file: File) {
    return apiUpload<ExtractionResult>('/ai/extract-nutrition', 'image', file);
  },
  estimate(input: EstimateNutritionInput) {
    return apiRequest<EstimateResult>('/ai/estimate-nutrition', { method: 'POST', body: input });
  },
  parsePdf(file: File) {
    return apiUpload<{ candidates: ImportCandidate[] }>('/ai/import-pdf', 'file', file);
  },
};

export const chatApi = {
  createConversation(input: CreateConversationInput = {}) {
    return apiRequest<Conversation>('/chat/conversations', { method: 'POST', body: input });
  },
  listConversations(page: number, pageSize = 20) {
    return apiRequest<Page<Conversation>>('/chat/conversations', { query: { page, pageSize } });
  },
  listMessages(conversationId: string, page: number, pageSize = 100) {
    return apiRequest<Page<ChatMessageRecord>>(
      `/chat/conversations/${conversationId}/messages`,
      { query: { page, pageSize } },
    );
  },
  removeConversation(id: string) {
    return apiRequest<void>(`/chat/conversations/${id}`, { method: 'DELETE' });
  },
};
