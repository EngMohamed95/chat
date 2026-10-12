// Supabase Edge Function: manage-users
// Securely handles admin user management (create, update, delete, disable)
// Verifies caller's JWT and checks that the caller has 'admin' role in public.profiles.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration on Edge Function" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client with service role for admin operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Invalid token or session expired", details: authError }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verify caller has 'admin' role in public.profiles
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerUser.id)
      .single();

    if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.is_active) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only active administrators can perform this action" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Process Request Body
    const body = await req.json();
    const { action, payload } = body;

    switch (action) {
      case "create_user": {
        const { email, password, full_name, role = "agent" } = payload;
        if (!email || !password || !full_name) {
          return new Response(
            JSON.stringify({ error: "Email, password, and full name are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Create auth user via Supabase Auth Admin
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name,
            role,
          },
        });

        if (createError) {
          return new Response(
            JSON.stringify({ error: createError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Upsert into public.profiles
        const { data: profile, error: upsertError } = await supabaseAdmin
          .from("profiles")
          .upsert({
            id: created.user.id,
            email,
            full_name,
            role,
            is_active: true,
          })
          .select()
          .single();

        if (upsertError) {
          return new Response(
            JSON.stringify({ error: upsertError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, user: profile }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_user": {
        const { userId, full_name, role, is_active, password } = payload;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: "userId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update password if provided
        if (password) {
          const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password,
          });
          if (pwdErr) {
            return new Response(
              JSON.stringify({ error: pwdErr.message }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        // Update profile
        const updateData: Record<string, any> = {};
        if (full_name !== undefined) updateData.full_name = full_name;
        if (role !== undefined) updateData.role = role;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data: updatedProfile, error: updateErr } = await supabaseAdmin
          .from("profiles")
          .update(updateData)
          .eq("id", userId)
          .select()
          .single();

        if (updateErr) {
          return new Response(
            JSON.stringify({ error: updateErr.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, user: updatedProfile }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_user": {
        const { userId } = payload;
        if (!userId) {
          return new Response(
            JSON.stringify({ error: "userId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (userId === callerUser.id) {
          return new Response(
            JSON.stringify({ error: "You cannot delete your own account" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Delete from auth.users (cascades to profiles)
        const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (delError) {
          return new Response(
            JSON.stringify({ error: delError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, deletedUserId: userId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unsupported action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
