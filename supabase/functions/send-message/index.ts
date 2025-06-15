// supabase edge function to send reddit message



import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import snoowrap from "npm:snoowrap@1.23.0";

serve(async (req) => {
  try {
    const {
      userId,
      recipientUsername,
      accountId,
      message,
      subject,
      delayMs,
    }: {
      userId: string;
      recipientUsername: string;
      accountId: string;
      message: string;
      subject?: string;
      delayMs?: number;
    } = await req.json();

    if (!userId || !recipientUsername || !accountId || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // Initialise Supabase client with service-role key (bypasses RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get Reddit account credentials
    const { data: account, error: accountError } = await supabase
      .from("reddit_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Reddit account not found" }),
        { status: 404 }
      );
    }

    // Check user plan and quota
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("subscription_status, message_count")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404 }
      );
    }

    if (user.subscription_status === "free" && (user.message_count ?? 0) >= 100) {
      return new Response(
        JSON.stringify({
          error:
            "Message limit reached. Please upgrade to Pro for unlimited messages.",
        }),
        { status: 403 }
      );
    }

    // Helper that actually sends the PM and records it
    const executeSend = async () => {
      const reddit = new snoowrap({
        userAgent: "Reddit Bot SaaS",
        clientId: account.client_id,
        clientSecret: account.client_secret,
        username: account.username,
        password: account.password,
      });

      await reddit.composeMessage({
        to: recipientUsername,
        subject: subject || "Message from Reddit Bot SaaS",
        text: message,
      });

      // Update user's message count
      await supabase
        .from("users")
        .update({ message_count: (user.message_count ?? 0) + 1 })
        .eq("id", userId);

      // Record the sent message
      await supabase.from("sent_messages").insert([
        {
          user_id: userId,
          recipient_username: recipientUsername,
          content: message,
          reddit_account_id: accountId,
        },
      ]);
    };

    // If a delay is requested, clamp it to stay within Edge Function free limit (≤145 s)
    const MAX_DELAY_MS = 145 * 1000; // 145 seconds leaves ~5 s before 150 s hard limit
    const effectiveDelayMs =
      delayMs && delayMs > 0 ? Math.min(delayMs, MAX_DELAY_MS) : 0;

    if (effectiveDelayMs > 0) {
      console.log(
        `Queuing message to ${recipientUsername} in ${effectiveDelayMs}ms`
      );
      setTimeout(() => {
        // Fire & forget – log errors but don't reject the original HTTP req
        executeSend().catch((err) => {
          console.error("Error in delayed send", err);
        });
      }, effectiveDelayMs);

      return new Response(
        JSON.stringify({ queued: true, delayMs: effectiveDelayMs }),
        { status: 202 }
      );
    }

    // Otherwise, send immediately and wait for completion
    await executeSend();
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to send message" }),
      { status: 500 }
    );
  }
});
