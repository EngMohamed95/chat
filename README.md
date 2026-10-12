# LiveFlow - Enterprise Real-Time Live Chat Platform

LiveFlow is an enterprise-grade live chat platform built with React, TypeScript, Tailwind CSS, and Supabase (PostgreSQL, Supabase Auth, Realtime, Storage, and Edge Functions).

---

## ⚡ Quick Start & Deployment Guide

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Under **Project Settings > API**, copy your:
   - **Project URL** (`https://xyzcompany.supabase.co`)
   - **anon / public key** (`ey...`)
   - **service_role key** (secret key for the Edge Function)

### 2. Run Database Migration
1. Go to **SQL Editor** in your Supabase Dashboard.
2. Open or paste the full content of `supabase/migrations/001_init.sql`.
3. Click **Run**. This will create:
   - Tables: `profiles`, `settings`, `conversations`, `messages`, `canned_replies`
   - Indexes and automated triggers (message preview update, unread counters, visitor auto-reopen)
   - Realtime publication on `conversations` and `messages`
   - Secure Row-Level Security (RLS) policies protecting visitors and internal notes
   - Public bucket `attachments` for chat images and documents
   - Analytics RPC `get_analytics_summary()`

### 3. Enable Authentication Methods
1. Go to **Authentication > Providers**:
   - Enable **Email / Password**.
   - Enable **Anonymous Sign-Ins** (under Authentication > Providers > Anonymous).
     *This is critical so website visitors get anonymous Supabase sessions that persist and allow secure RLS!*

### 4. Create the First Admin User & Promote
1. In your app or via Supabase Auth, sign up with your email (e.g., `admin@liveflow.io`).
2. Run the snippet in `supabase/seed.sql` to promote yourself to admin:
   ```sql
   UPDATE public.profiles
   SET role = 'admin', is_active = true
   WHERE email = 'admin@liveflow.io';
   ```

### 5. Deploy the Supabase Edge Function (`manage-users`)
To allow admins to create and delete agents securely:
1. Install Supabase CLI: `npm i -g supabase`
2. Link your project: `supabase link --project-ref <your-project-id>`
3. Deploy function:
   ```bash
   supabase functions deploy manage-users --no-verify-jwt
   ```
   *Note: The function verifies caller JWT internally using `getUser(token)` and checks `profiles.role = 'admin'`.*

### 6. Configure Environment Variables
Set these variables in your deployment environment or `.env`:
```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"
```

---

## 🚀 Key Architectural Features

### Part 1: Embeddable Chat Widget
- **Isolated Shadow DOM**: Zero CSS collisions with host websites.
- **Anonymous Supabase Auth**: `supabase.auth.signInAnonymously()` preserves visitor chat thread across page navigations.
- **Bi-Directional RTL/LTR**: Auto-detects Arabic text and formats typography with Google's **Cairo** and **Tajawal** fonts.
- **Visitor Metadata**: Automatically captures current page URL, referrer, browser/OS, device type, and visit timestamp.
- **Realtime**: Listens to `messages` and `conversations` via Supabase Realtime, with typing indicator broadcast channel and audio chimes.
- **Attachment Upload**: Direct upload to Supabase Storage bucket `attachments`.

### Part 2: Agent Dashboard
- **3-Column Inbox**:
  - Column 1: Sidebar with navigation, Agent avatar, Online/Away status toggle with Realtime Presence.
  - Column 2: Conversation list sorted by latest message, unread badges, status filters (All, Open, Mine, Closed) and search.
  - Column 3: Rich chat thread, canned quick replies, private internal notes, agent assignment, and visitor metadata drawer.
- **Realtime Presence & Broadcast**: Agent online/away statuses and visitor typing indicator without database writes.
- **Desktop Notifications**: Web Audio chime and browser push notifications for incoming customer inquiries.
- **Light & Dark Mode**: Seamless theme switching with high contrast emerald/zinc palette.

### Part 3: User Management, Settings & Analytics
- **Role-Based Access Control**: `admin` and `agent` roles with database RLS enforcement.
- **Admin Edge Function**: Safe admin user provisioning via `supabase.auth.admin.createUser` without exposing service role keys.
- **Live Customization**: Live settings update widget position, company name, greeting messages, primary brand color, and pre-chat form.
- **Embed Snippet Generator**: 1-click HTML code snippet for site owners.
- **Interactive Analytics**: Real-time charts powered by Recharts (volume per day, open vs. closed, response time).
