import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { Assessment } from "@/lib/assessment";

// Optional AI assessment. Enabled only when ANTHROPIC_API_KEY is set on the
// server. If ACCESS_CODE is also set, callers must send it, so a public
// deployment can't be used to spend your API credit.

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  findings: z
    .array(
      z.object({
        label: z.string().max(160),
        intensity: z.number().min(1).max(10),
        types: z.array(z.string().max(40)).max(12),
        source: z.enum(["map", "movement"]),
      })
    )
    .min(1)
    .max(40),
  notes: z.array(z.string().max(400)).max(20),
  intake: z.object({
    duration: z.string().nullable(),
    onset: z.string().nullable(),
    age: z.string().nullable(),
    sex: z.string().nullable(),
    flags: z.array(z.string().max(80)).max(30),
  }),
  ruleBased: z.array(z.string().max(120)).max(8),
  accessCode: z.string().max(200).optional(),
});

const SYSTEM = `You are a careful, experienced musculoskeletal and general-practice clinician helping a member of the public understand their pain before they see a professional. You receive a structured description of where it hurts (from a body map and a posable mannequin), how it feels, intensity, onset, duration, age band, sex and red-flag answers.

Reason like a good GP doing remote triage:
- Decide the safest triage level first. Use "emergency" for possible heart attack, stroke, cauda equina, pulmonary embolism, meningitis or brain bleed; "urgent" (seen today) for things like suspected appendicitis, kidney stone/infection, DVT, fracture, septic joint or any new chest pain; "doctor" for things needing assessment within days to weeks; "selfcare" only when nothing suggests more. When in doubt, choose the more cautious level.
- List 3 to 5 plausible explanations, most likely first, with honest likelihoods. Base reasoning only on what was reported, and say which reported details support or argue against each one. Include an important "must not miss" cause if the picture allows it, labelled as such, even if less likely.
- Self-care advice must be practical, specific and safe. Mention medication only in general terms (e.g. "an anti-inflammatory like ibuprofen if it's safe for you").
- Questions for a clinician should help the person get the most from an appointment.
- Red flags to watch: specific symptoms that should make them seek help urgently.
- Write in plain, warm, non-alarming English. Never claim certainty: these are possibilities, not a diagnosis. Keep each field concise; the reader is on a phone.
- Left/right always refer to the person's own body.`;

function describe(b: z.infer<typeof Body>): string {
  const lines: string[] = ["Reported pain:"];
  for (const f of b.findings) {
    const t = f.types.length ? `; feels: ${f.types.join(", ")}` : "";
    lines.push(`- ${f.label} — ${f.intensity}/10${t}${f.source === "movement" ? " (painful movement)" : ""}`);
  }
  if (b.notes.length) lines.push("", "Their notes:", ...b.notes.map((n) => `- ${n}`));
  const q = b.intake;
  lines.push(
    "",
    `How long: ${q.duration ?? "not given"}`,
    `How it started: ${q.onset ?? "not given"}`,
    `Age band: ${q.age ?? "not given"}`,
    `Sex: ${q.sex ?? "not given"}`,
    `Red flags and other symptoms reported: ${q.flags.length ? q.flags.join("; ") : "none"}`
  );
  if (b.ruleBased.length) lines.push("", `A simple rules-based checker suggested: ${b.ruleBased.join("; ")}. Use your own judgement.`);
  return lines.join("\n");
}

export async function GET() {
  return Response.json({
    enabled: Boolean(process.env.ANTHROPIC_API_KEY),
    needsCode: Boolean(process.env.ACCESS_CODE),
  });
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI assessment isn't set up on this server." }, { status: 503 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (process.env.ACCESS_CODE && body.accessCode !== process.env.ACCESS_CODE) {
    return Response.json({ error: "Wrong access code." }, { status: 401 });
  }

  const client = new Anthropic();
  try {
    const message = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(Assessment) },
      messages: [{ role: "user", content: describe(body) }],
    });
    if (message.stop_reason === "refusal") {
      return Response.json({ error: "The AI declined to assess this. Please use the built-in assessment or see a clinician." }, { status: 422 });
    }
    if (!message.parsed_output) {
      return Response.json({ error: "The AI response couldn't be read. Please try again." }, { status: 502 });
    }
    return Response.json({ assessment: message.parsed_output });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "The AI is busy right now — try again in a minute." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "The server's AI key is invalid." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json({ error: `AI service error (${err.status ?? "network"}).` }, { status: 502 });
    }
    return Response.json({ error: "Something went wrong reaching the AI." }, { status: 500 });
  }
}
