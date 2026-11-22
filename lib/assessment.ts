import { z } from "zod";

// Shape of the AI assessment returned by /api/diagnose.
export const Assessment = z.object({
  triage: z.enum(["emergency", "urgent", "doctor", "selfcare"]),
  triage_reason: z.string(),
  summary: z.string(),
  conditions: z.array(
    z.object({
      name: z.string(),
      likelihood: z.enum(["high", "moderate", "low"]),
      reasoning: z.string(),
      self_care: z.array(z.string()),
      see_doctor_if: z.string(),
    })
  ),
  questions_for_clinician: z.array(z.string()),
  red_flags_to_watch: z.array(z.string()),
});

export type AiAssessment = z.infer<typeof Assessment>;

