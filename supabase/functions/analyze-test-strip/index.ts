import Anthropic from "npm:@anthropic-ai/sdk@0.30.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let imageBase64: string;
  let stripBrand: string;
  try {
    ({ imageBase64, stripBrand } = await req.json());
  } catch {
    return json({ readable: false, error: "Invalid request body." }, 400);
  }

  if (!imageBase64) {
    return json({ readable: false, error: "imageBase64 is required." }, 400);
  }

  const brandContext =
    stripBrand && stripBrand !== "Other"
      ? `The test strip is a ${stripBrand} brand strip.`
      : "The test strip brand is unknown or unspecified.";

  const prompt = `You are analyzing a photo of a pool or lake chemical test strip. ${brandContext}

Your job is to read the actual colors you see on each pad — not to guess or assume typical values.

CRITICAL RULES — read carefully:
- Do NOT default to common pool targets (e.g. pH 7.2, chlorine 1.0, alkalinity 100). Only return a value if the pad color in the image literally matches that point on the scale.
- If you are uncertain what a pad's color is, return a LOW confidence score (below 0.6) and your best guess — do not substitute a plausible-sounding value.
- A confident-looking "normal" reading that you did not actually observe is worse than an uncertain one.
- In the "notes" field, briefly describe the actual color you saw for each pad (e.g. "chlorine: pale yellow → ~0.5 ppm; pH: olive-green → ~7.4; alk: medium tan → ~100"). This is required and helps the user verify.

Pads to identify:
- free_chlorine: Free chlorine in ppm (scale: 0, 0.5, 1, 2, 3, 5, 10). Color typically shifts from colorless/pale yellow → dark pink/magenta as chlorine increases.
- ph: pH value (scale: 6.2, 6.8, 7.2, 7.4, 7.8, 8.4). Color typically shifts yellow → orange → red/pink as pH increases.
- alkalinity: Total alkalinity in ppm (scale: 0, 40, 80, 120, 180, 240). Color varies by brand.
- cyanuric_acid: Cyanuric acid / stabilizer in ppm (scale: 0, 30, 40, 50, 100+). Color varies by brand.
- calcium_hardness: Calcium hardness in ppm if that pad exists on this strip (scale: 0, 100, 250, 500+), or null if not present.

Confidence scores:
- 0.85–1.0: color is clear and unambiguous
- 0.65–0.84: reasonable read, minor lighting or angle uncertainty
- 0.40–0.64: uncertain — poor lighting, wet strip, or color between two scale points
- below 0.40: too uncertain; return null for the value

Return ONLY valid JSON in exactly this format:
{
  "readable": true,
  "free_chlorine": { "value": 2.0, "confidence": 0.9 },
  "ph": { "value": 7.4, "confidence": 0.85 },
  "alkalinity": { "value": 100, "confidence": 0.8 },
  "cyanuric_acid": { "value": 40, "confidence": 0.75 },
  "calcium_hardness": { "value": null, "confidence": 0.0 },
  "notes": "chlorine: pale pink → ~2 ppm; pH: yellow-green → ~7.4; alk: light tan → ~100; CYA: faint purple → ~40"
}

If the image is not a test strip, or is too blurry/dark/angled to read at all, return:
{
  "readable": false,
  "error": "brief description of why it cannot be read"
}

Do not include markdown, code fences, or any text outside the JSON object.`;

  try {
    const client = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
    });

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return json({ readable: false, error: "Unexpected response from AI." });
    }

    // Strip accidental markdown fences
    const raw = content.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    let result: unknown;
    try {
      result = JSON.parse(raw);
    } catch {
      return json({ readable: false, error: "Could not parse AI response." });
    }

    return json(result);
  } catch (err) {
    console.error("Edge function error:", err instanceof Error ? err.message : err);
    return json({ readable: false, error: "Analysis failed. Please try again." }, 500);
  }
});
