import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch the latest ingestion log entries
    const { data: logEntries } = await sb
      .from("ingestion_log")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);

    // Fetch stored insights and recommendations
    const [{ data: insights }, { data: recommendations }] = await Promise.all([
      sb.from("ai_insights").select("*").order("created_at", { ascending: false }),
      sb.from("ai_recommendations").select("*").order("created_at", { ascending: false }),
    ]);

    return new Response(
      JSON.stringify({
        insights: insights ?? [],
        recommendations: recommendations ?? [],
        pipelineLog: logEntries ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
