import { z } from 'zod';

// PDF import is stateless: the server parses the upload and returns candidates
// without saving anything. The browser holds them for review and then submits
// the corrected rows to POST /entries/bulk.
//
// A candidate is untrusted model output, so the raw draft is kept as a loose
// object with the result of validating it beside it. That way the review table
// can flag a bad row instead of dropping it.
export const importCandidateSchema = z.object({
  row: z.number().int().nonnegative(),
  draft: z.record(z.string(), z.unknown()),
  issues: z.array(z.string()),
  valid: z.boolean(),
});
export type ImportCandidate = z.infer<typeof importCandidateSchema>;

export const importCandidatesSchema = z.array(importCandidateSchema);
