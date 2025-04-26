import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { OpenAI } from "https://deno.land/x/openai@v4.47.1/mod.ts"; // Use a compatible version

// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Adjust in production!
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

console.log("OpenAI Realtime Session handler initializing.");

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Ensure it's a POST request
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405
    });
  }

  // Get OpenAI API key from environment variables
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("Server config error: OPENAI_API_KEY not found");
    return new Response(JSON.stringify({ error: "Server configuration error: API key missing" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }

  // Initialize OpenAI client
  const openai = new OpenAI({ apiKey });

  try {
    console.log("Requesting new realtime session from OpenAI...");

    // Call the OpenAI API to create a realtime session
    // Note: The actual endpoint call might differ slightly based on the library version
    // or if direct fetch is needed. Assuming the library supports it directly:
    const sessionResponse = await openai.realtime.sessions.create(); // Adjust if method name differs

    // Check if the response contains the expected data
    if (!sessionResponse || !sessionResponse.ephemeral_key || !sessionResponse.session_id) {
        console.error("Invalid response from OpenAI realtime session creation:", sessionResponse);
        throw new Error("Failed to retrieve session details from OpenAI.");
    }

    const { ephemeral_key, session_id } = sessionResponse;
    console.log(`Realtime session created successfully. Session ID: ${session_id}`);

    // Return the ephemeral key and session ID to the client
    return new Response(JSON.stringify({ ephemeral_key, session_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (err) {
    console.error("Error creating OpenAI realtime session:", err);
    let errorMessage = err.message || "Unknown API error";
    let statusCode = 500;

    // Attempt to extract more specific error details if available
    if (err.response && err.response.data && err.response.data.error) {
        errorMessage = err.response.data.error.message || errorMessage;
    }
    if (err.status) {
        statusCode = err.status;
    }

    return new Response(JSON.stringify({ error: `Failed to create realtime session: ${errorMessage}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: statusCode
    });
  }
});

console.log("OpenAI Realtime Session handler ready.");
