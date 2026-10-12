-- ==============================================================================
-- LiveFlow: Admin Promotion & Seed Data
-- ==============================================================================

-- 1. Promote a user to 'admin' by email:
-- Run this in the Supabase SQL Editor after signing up your first user:
/*
UPDATE public.profiles
SET role = 'admin', is_active = true
WHERE email = 'admin@yourcompany.com';
*/

-- 2. Or promote the first registered user automatically:
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
    SELECT id FROM public.profiles 
    ORDER BY created_at ASC 
    LIMIT 1
);

-- 3. Verify admin role:
SELECT id, full_name, email, role, is_active 
FROM public.profiles 
WHERE role = 'admin';
