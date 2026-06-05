import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { email, name } = await req.json();
    const normalized = (email || "").trim().toLowerCase();

    if (!normalized || !normalized.includes("@")) {
      return json({ error: "Valid email is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_EMAIL_VERIFY");

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server configuration error", useSupabaseOtp: true }, 500);
    }

    if (!resendApiKey) {
      return json({ error: "Missing Resend key", useSupabaseOtp: true }, 500);
    }

    const from =
      Deno.env.get("RESEND_FROM") || "NexusBank <onboarding@resend.dev>";
    const displayName = name ? `, ${name}` : "";

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: plainCode, error: rpcError } = await admin.rpc(
      "generate_verification_code",
      { p_email: normalized, p_type: "email" },
    );

    if (rpcError || !plainCode) {
      console.error("generate_verification_code:", rpcError);
      return json({ error: "Could not generate code", useSupabaseOtp: true }, 500);
    }

    const html = `
      <div style="font-family:'Sora','Inter',sans-serif;background:#0D0F1A;padding:40px;">
        <div style="max-width:520px;margin:0 auto;background:#1A1E35;border-radius:16px;overflow:hidden;border:1px solid rgba(108,92,231,0.3);">
          <div style="background:linear-gradient(135deg,#6C5CE7,#A463F5);padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;color:#fff;">NexusBank</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);">Verify Your Email</p>
          </div>
          <div style="padding:30px;color:#F0F2FF;">
            <h2 style="margin-top:0;">Welcome${displayName}!</h2>
            <p>Your 8-digit verification code:</p>
            <div style="text-align:center;font-size:40px;font-weight:700;letter-spacing:10px;margin:24px 0;color:#F0F2FF;">
              ${plainCode}
            </div>
            <p style="color:#A8AFCB;font-size:14px;">This code expires in 10 minutes.</p>
          </div>
        </div>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [normalized],
        subject: "Your NexusBank verification code",
        html,
      }),
    });

    const resendBody = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendBody);
      return json({
        success: false,
        useSupabaseOtp: true,
        resendError: resendBody,
      });
    }

    return json({ success: true, delivery: "resend" });
  } catch (err) {
    console.error("email-verification error:", err);
    return json({ error: String(err), useSupabaseOtp: true }, 500);
  }
});
