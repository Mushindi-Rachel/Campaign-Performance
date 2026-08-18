import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// -----------------------------------------------------------------------
// Real natural-language "Ask Campaign AI" assistant, backed by OpenAI.
// Replaces the keyword-matching answerCampaignQuestion() in lib/ai-engine.ts.
//
// Required secret: OPENAI_API_KEY (set via `supabase secrets set OPENAI_API_KEY=...`)
//
// The frontend sends the current campaign summaries + AI insights +
// recommendations already computed client-side, so this function doesn't
// need direct DB access — it just needs to turn that data + the person's
// question into a grounded natural-language answer. This also keeps the
// model from inventing numbers: it's instructed to only use what's in the
// provided context.
// -----------------------------------------------------------------------

interface ChatRequest {
  question: string;
  context: {
    summaries: Array<{
      name: string;
      status: string;
      totalSpend: number;
      totalConversions: number;
      avgCtr: number;
      avgCpl: number;
      conversionRate: number;
      avgEngagementRate: number;
    }>;
    insights: Array<{
      title: string;
      description: string;
      severity: string;
      campaignName?: string;
    }>;
    recommendations: Array<{
      title: string;
      action: string;
      priority: string;
      campaignName?: string;
    }>;
  };
  // Optional short conversation history so the assistant has memory within a session.
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

function buildContextBlock(context: ChatRequest["context"]): string {
  const campaignLines = context.summaries.map((s) =>
    `- ${s.name} [${s.status}]: spend KSh ${Math.round(s.totalSpend).toLocaleString()}, ` +
    `${s.totalConversions} conversions, CTR ${s.avgCtr.toFixed(2)}%, CPL KSh ${Math.round(s.avgCpl).toLocaleString()}, ` +
    `conversion rate ${s.conversionRate.toFixed(1)}%, engagement ${s.avgEngagementRate.toFixed(1)}%`
  ).join("\n");

  const insightLines = context.insights.map((i) =>
    `- [${i.severity.toUpperCase()}] ${i.title}${i.campaignName ? ` (${i.campaignName})` : ""}: ${i.description}`
  ).join("\n");

  const recLines = context.recommendations.map((r) =>
    `- [${r.priority.toUpperCase()}] ${r.title}${r.campaignName ? ` (${r.campaignName})` : ""}: ${r.action}`
  ).join("\n");

  return [
    "CAMPAIGN PERFORMANCE DATA:",
    campaignLines || "(no campaign data yet)",
    "",
    "AI-DETECTED INSIGHTS:",
    insightLines || "(no insights generated yet)",
    "",
    "AI RECOMMENDATIONS:",
    recLines || "(no recommendations generated yet)",
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured on this Supabase project." }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { question, context, history }: ChatRequest = await req.json();
    if (!question || !context) {
      return new Response(
        JSON.stringify({ error: "Missing 'question' or 'context' in request body." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = [
      "You are Campaign AI, an analytics assistant embedded in a marketing dashboard for Pathways.",
      "You answer questions about Meta Ads + GA4 campaign performance using ONLY the data given to you below.",
      "Rules:",
      "- Never invent numbers that aren't in the provided data. If something isn't in the data, say so plainly.",
      "- Be concise: 2-5 sentences for simple questions, short bullet points for multi-part answers.",
      "- When recommending action, ground it in the specific metric that justifies it (e.g. 'CPL is 22% below portfolio average').",
      "- Currency is Kenyan Shillings (KSh).",
      "- If asked something unrelated to these campaigns, politely redirect to campaign performance topics.",
      "",
      buildContextBlock(context),
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history ?? []).slice(-6),
      { role: "user", content: question },
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error (${resp.status}): ${errBody}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const answer = data.choices?.[0]?.message?.content ?? "I couldn't generate a response — please try rephrasing your question.";

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
