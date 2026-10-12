-- ==============================================================================
-- Migration: 001_init.sql
-- LiveFlow Real-time Live Chat Database Schema, RLS, Triggers, & Publications
-- ==============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Agents & Admins)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 2. SETTINGS TABLE (Tenant & Widget Configuration)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    company_name TEXT NOT NULL DEFAULT 'LiveFlow',
    logo_url TEXT,
    primary_color TEXT NOT NULL DEFAULT '#10b981',
    welcome_message TEXT NOT NULL DEFAULT 'Hello! How can we help you today?',
    offline_message TEXT NOT NULL DEFAULT 'We are currently away. Leave a message and we will get back to you shortly.',
    working_hours JSONB NOT NULL DEFAULT '{"enabled": true, "start": "09:00", "end": "18:00", "timezone": "UTC"}'::jsonb,
    widget_position TEXT NOT NULL DEFAULT 'bottom-right' CHECK (widget_position IN ('bottom-right', 'bottom-left')),
    prechat_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Insert default settings row if missing
INSERT INTO public.settings (id, company_name, primary_color, welcome_message, offline_message, widget_position, prechat_enabled)
VALUES ('default', 'LiveFlow Support', '#10b981', 'Hello! How can we help you today?', 'Our team is currently away. Please leave a message and we will respond ASAP!', 'bottom-right', true)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. CONVERSATIONS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID NOT NULL, -- references anonymous auth.users.id
    visitor_name TEXT,
    visitor_contact TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_message TEXT,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    unread_for_agent INTEGER NOT NULL DEFAULT 0,
    unread_for_visitor INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    rating_feedback TEXT,
    rated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 4. MESSAGES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('visitor', 'agent', 'system')),
    sender_id UUID, -- anonymous visitor uid OR agent profile id
    content TEXT NOT NULL,
    attachment_url TEXT,
    is_internal_note BOOLEAN NOT NULL DEFAULT false,
    seen BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ------------------------------------------------------------------------------
-- 5. CANNED REPLIES TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canned_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Initial canned replies
INSERT INTO public.canned_replies (title, content)
VALUES 
    ('Greeting', 'Hi there! Thanks for reaching out. How can I assist you today?'),
    ('Working On It', 'I am looking into this for you right now, please give me just a moment.'),
    ('Need More Details', 'Could you please share a screenshot or more details about what you are seeing?'),
    ('Closing Chat', 'Is there anything else I can help you with today? If not, have a wonderful day!'),
    ('Welcome (Arabic)', 'أهلاً بك! كيف يمكنني مساعدتك اليوم؟'),
    ('Hold on (Arabic)', 'لحظات من فضلك، جاري التحقق من طلبك.')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- 6. INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
    ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
    ON public.conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_visitor_id 
    ON public.conversations (visitor_id);

CREATE INDEX IF NOT EXISTS idx_conversations_status 
    ON public.conversations (status);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned 
    ON public.conversations (assigned_to);

-- ------------------------------------------------------------------------------
-- 7. HELPER FUNCTIONS FOR SECURITY & ROLES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agent()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = true
          AND role IN ('agent', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND is_active = true
          AND role = 'admin'
    );
$$;

-- ------------------------------------------------------------------------------
-- 8. TRIGGERS
-- ------------------------------------------------------------------------------

-- Trigger A: Auto-create Profile row when non-anonymous user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if anonymous: Supabase sets is_anonymous = true on auth.users for anonymous logins
    IF NEW.is_anonymous IS NOT TRUE AND (NEW.raw_app_meta_data->>'provider' != 'anonymous' OR NEW.raw_app_meta_data->>'provider' IS NULL) THEN
        INSERT INTO public.profiles (id, full_name, email, role, avatar_url)
        VALUES (
            NEW.id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Staff Member'),
            COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'role', 'agent'),
            COALESCE(NEW.raw_user_meta_data->>'avatar_url', NULL)
        )
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            full_name = EXCLUDED.full_name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger B: Update conversation on message insertion
CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    msg_preview TEXT;
BEGIN
    -- Format preview
    IF NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0 THEN
        msg_preview := LEFT(NEW.content, 120);
    ELSIF NEW.attachment_url IS NOT NULL THEN
        msg_preview := '📎 Attachment';
    ELSE
        msg_preview := 'New message';
    END IF;

    -- Update conversation
    UPDATE public.conversations
    SET 
        last_message = CASE 
            WHEN NEW.is_internal_note THEN last_message 
            ELSE msg_preview 
        END,
        last_message_at = CASE 
            WHEN NEW.is_internal_note THEN last_message_at 
            ELSE NEW.created_at 
        END,
        -- Reopen conversation if visitor sends a message
        status = CASE 
            WHEN NEW.sender_type = 'visitor' AND status = 'closed' THEN 'open' 
            ELSE status 
        END,
        -- Unread counts
        unread_for_agent = CASE 
            WHEN NEW.sender_type = 'visitor' THEN unread_for_agent + 1 
            ELSE unread_for_agent 
        END,
        unread_for_visitor = CASE 
            WHEN NEW.sender_type = 'agent' AND NOT NEW.is_internal_note THEN unread_for_visitor + 1 
            ELSE unread_for_visitor 
        END
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_replies ENABLE ROW LEVEL SECURITY;

-- A. PROFILES POLICIES
-- Anyone authenticated can view active profiles (to see agent names/avatars)
CREATE POLICY "Profiles readable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

-- Also allow public anon to see agent profile (for assigned agent name/avatar)
CREATE POLICY "Public can view active agent profiles"
    ON public.profiles FOR SELECT
    TO anon
    USING (is_active = true);

-- Only admins can insert, update, or delete profiles
CREATE POLICY "Admins can manage profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- B. SETTINGS POLICIES
-- Anyone (anon widget & agents) can read settings
CREATE POLICY "Settings readable by everyone"
    ON public.settings FOR SELECT
    TO public
    USING (true);

-- Only admins can update settings
CREATE POLICY "Only admins can modify settings"
    ON public.settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- C. CONVERSATIONS POLICIES
-- Visitors can read their own conversation
CREATE POLICY "Visitors can select their own conversation"
    ON public.conversations FOR SELECT
    TO public
    USING (visitor_id = auth.uid() OR public.is_agent());

-- Visitors can insert conversation for themselves
CREATE POLICY "Visitors can create their conversation"
    ON public.conversations FOR INSERT
    TO public
    WITH CHECK (visitor_id = auth.uid() OR public.is_agent());

-- Visitors can update their own conversation (e.g. name, contact, unread counter reset)
CREATE POLICY "Visitors can update their conversation"
    ON public.conversations FOR UPDATE
    TO public
    USING (visitor_id = auth.uid() OR public.is_agent())
    WITH CHECK (visitor_id = auth.uid() OR public.is_agent());

-- Agents can manage conversations
CREATE POLICY "Agents can manage all conversations"
    ON public.conversations FOR ALL
    TO authenticated
    USING (public.is_agent())
    WITH CHECK (public.is_agent());

-- D. MESSAGES POLICIES
-- Visitors can view messages in their conversation, EXCEPT internal notes
CREATE POLICY "Visitors can view public messages in their conversation"
    ON public.messages FOR SELECT
    TO public
    USING (
        (EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = messages.conversation_id 
              AND c.visitor_id = auth.uid()
        ) AND is_internal_note = false)
        OR public.is_agent()
    );

-- Visitors can insert visitor messages
CREATE POLICY "Visitors can send messages to their conversation"
    ON public.messages FOR INSERT
    TO public
    WITH CHECK (
        (EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = messages.conversation_id 
              AND c.visitor_id = auth.uid()
        ) AND sender_type = 'visitor' AND is_internal_note = false)
        OR public.is_agent()
    );

-- Agents can update seen status or manage messages
CREATE POLICY "Agents can manage messages"
    ON public.messages FOR ALL
    TO authenticated
    USING (public.is_agent())
    WITH CHECK (public.is_agent());

-- Visitors can mark messages seen in their conversation
CREATE POLICY "Visitors can update seen on their conversation messages"
    ON public.messages FOR UPDATE
    TO public
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = messages.conversation_id 
              AND c.visitor_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.conversations c 
            WHERE c.id = messages.conversation_id 
              AND c.visitor_id = auth.uid()
        )
    );

-- E. CANNED REPLIES POLICIES
-- Agents can read canned replies
CREATE POLICY "Agents can read canned replies"
    ON public.canned_replies FOR SELECT
    TO authenticated
    USING (public.is_agent());

-- Agents can create/edit canned replies
CREATE POLICY "Agents can insert and edit canned replies"
    ON public.canned_replies FOR ALL
    TO authenticated
    USING (public.is_agent())
    WITH CHECK (public.is_agent());

-- ------------------------------------------------------------------------------
-- 10. REALTIME CONFIGURATION
-- ------------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ------------------------------------------------------------------------------
-- 11. STORAGE BUCKET POLICIES (bucket: "attachments")
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Public read for attachments
CREATE POLICY "Public read attachments"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'attachments');

-- Upload attachments allowed for authenticated users and anon visitors
CREATE POLICY "Anyone can upload attachments"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'attachments' AND (length(name) < 255));

-- ------------------------------------------------------------------------------
-- 12. ANALYTICS RPC FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_analytics_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    result JSONB;
    v_total_conversations BIGINT;
    v_open_conversations BIGINT;
    v_closed_conversations BIGINT;
    v_messages_today BIGINT;
    v_avg_response_minutes NUMERIC;
BEGIN
    SELECT COUNT(*) INTO v_total_conversations FROM public.conversations;
    SELECT COUNT(*) INTO v_open_conversations FROM public.conversations WHERE status = 'open';
    SELECT COUNT(*) INTO v_closed_conversations FROM public.conversations WHERE status = 'closed';
    
    SELECT COUNT(*) INTO v_messages_today 
    FROM public.messages 
    WHERE created_at >= date_trunc('day', timezone('utc'::text, now()));

    -- Estimate average first response time (time between conversation created and first agent message)
    SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (m.created_at - c.created_at)) / 60)::numeric, 1), 2.4)
    INTO v_avg_response_minutes
    FROM public.conversations c
    JOIN LATERAL (
        SELECT created_at 
        FROM public.messages 
        WHERE conversation_id = c.id 
          AND sender_type = 'agent' 
          AND is_internal_note = false 
        ORDER BY created_at ASC 
        LIMIT 1
    ) m ON true
    WHERE c.created_at >= timezone('utc'::text, now()) - INTERVAL '30 days';

    result := jsonb_build_object(
        'total_conversations', v_total_conversations,
        'open_conversations', v_open_conversations,
        'closed_conversations', v_closed_conversations,
        'messages_today', v_messages_today,
        'avg_first_response_minutes', COALESCE(v_avg_response_minutes, 2.4)
    );

    RETURN result;
END;
$$;
