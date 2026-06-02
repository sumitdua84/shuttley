-- Run this in Supabase SQL Editor to enable super admin read access
-- Go to: supabase.com → your project → SQL Editor → New query → paste → Run

-- 1. Add is_super_admin flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 2. Set yourself as super admin (replace with your actual user ID from Supabase Auth)
-- Find your user ID: Supabase → Authentication → Users → copy your UUID
UPDATE profiles SET is_super_admin = true WHERE email IN ('sumit@shuttley.club', 'sumitdua84@gmail.com');

-- 3. Allow super admins to read ALL clubs
CREATE POLICY "super_admin_read_clubs" ON clubs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 4. Allow super admins to read ALL profiles
CREATE POLICY "super_admin_read_profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 5. Allow super admins to read ALL memberships
CREATE POLICY "super_admin_read_memberships" ON memberships
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 6. Allow super admins to read ALL sessions
CREATE POLICY "super_admin_read_sessions" ON sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- 7. Allow super admins to read ALL matches
CREATE POLICY "super_admin_read_matches" ON matches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true)
  );
