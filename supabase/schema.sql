-- ==========================================================================
-- VehicleService Forum - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================================================
-- Custom Types
-- ==========================================================================

CREATE TYPE user_role AS ENUM ('seeker', 'provider');
CREATE TYPE post_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE bid_status AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE urgency_level AS ENUM ('normal', 'urgent', 'emergency');
CREATE TYPE preferred_location_type AS ENUM ('my_location', 'provider_location', 'other');

-- ==========================================================================
-- User Profiles Table
-- ==========================================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'seeker',
  full_name TEXT,
  phone TEXT,
  line_id TEXT,
  province TEXT,
  district TEXT,
  subdistrict TEXT,
  avatar_url TEXT,
  bio TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON user_profiles FOR SELECT
  USING (TRUE);

CREATE POLICY "Users can insert their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================================
-- Posts Table
-- ==========================================================================

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  service_type TEXT NOT NULL,
  urgency urgency_level NOT NULL DEFAULT 'normal',
  brand TEXT,
  year INTEGER,
  mileage INTEGER,
  license_plate TEXT,
  budget_min INTEGER,
  budget_max INTEGER,
  preferred_location preferred_location_type NOT NULL DEFAULT 'my_location',
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  subdistrict TEXT,
  images TEXT[] DEFAULT '{}',
  status post_status NOT NULL DEFAULT 'open',
  accepted_bid_id UUID,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT
  USING (TRUE);

CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON posts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_vehicle_type ON posts(vehicle_type);
CREATE INDEX idx_posts_service_type ON posts(service_type);
CREATE INDEX idx_posts_province ON posts(province);
CREATE INDEX idx_posts_district ON posts(district);
CREATE INDEX idx_posts_urgency ON posts(urgency);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_budget_min ON posts(budget_min);
CREATE INDEX idx_posts_budget_max ON posts(budget_max);

-- Full-text search index
CREATE INDEX idx_posts_search ON posts
  USING GIN (to_tsvector('thai', title || ' ' || description));

-- ==========================================================================
-- Bids Table
-- ==========================================================================

CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price INTEGER NOT NULL CHECK (price > 0),
  message TEXT NOT NULL,
  timeline INTEGER CHECK (timeline > 0 AND timeline <= 365),
  status bid_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id) -- One bid per user per post
);

-- Enable RLS
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Bids are viewable by post owner and bidder"
  ON bids FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT user_id FROM posts WHERE id = post_id)
  );

CREATE POLICY "Providers can create bids on open posts"
  ON bids FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = post_id
        AND status = 'open'
        AND user_id != auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'provider'
    )
  );

CREATE POLICY "Bidders can update their own bids (withdraw)"
  ON bids FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_bids_updated_at
  BEFORE UPDATE ON bids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_bids_post_id ON bids(post_id);
CREATE INDEX idx_bids_user_id ON bids(user_id);
CREATE INDEX idx_bids_status ON bids(status);
CREATE INDEX idx_bids_created_at ON bids(created_at);

-- ==========================================================================
-- Notifications Table
-- ==========================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'new_bid', 'bid_accepted', 'bid_rejected', 'post_completed', etc.
  title TEXT NOT NULL,
  message TEXT,
  related_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  related_bid_id UUID REFERENCES bids(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Users can update their own notifications (mark read)"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- ==========================================================================
-- Chat/Messages Table (for post-bid acceptance chat)
-- ==========================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  seeker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, bid_id)
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = seeker_id OR auth.uid() = provider_id);

CREATE INDEX idx_conversations_post_id ON conversations(post_id);
CREATE INDEX idx_conversations_seeker_id ON conversations(seeker_id);
CREATE INDEX idx_conversations_provider_id ON conversations(provider_id);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- 'text', 'image', 'location', 'contact'
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view messages in their conversations"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
        AND (seeker_id = auth.uid() OR provider_id = auth.uid())
    )
  );

CREATE POLICY "Participants can send messages"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id = conversation_id
        AND (seeker_id = auth.uid() OR provider_id = auth.uid())
    )
  );

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ==========================================================================
-- Reviews Table
-- ==========================================================================

CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bid_id, reviewer_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are viewable by everyone"
  ON reviews FOR SELECT
  USING (TRUE);

CREATE POLICY "Reviewers can create reviews for completed posts"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id AND
    EXISTS (
      SELECT 1 FROM posts
      WHERE id = post_id
        AND status = 'completed'
    ) AND
    EXISTS (
      SELECT 1 FROM bids
      WHERE id = bid_id
        AND status = 'accepted'
    )
  );

CREATE INDEX idx_reviews_post_id ON reviews(post_id);
CREATE INDEX idx_reviews_reviewee_id ON reviews(reviewee_id);
CREATE INDEX idx_reviews_bid_id ON reviews(bid_id);

-- ==========================================================================
-- Favorites/Bookmarks Table
-- ==========================================================================

CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites"
  ON favorites FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_post_id ON favorites(post_id);

-- ==========================================================================
-- Helper Functions
-- ==========================================================================

-- Function to accept a bid (transactional)
CREATE OR REPLACE FUNCTION accept_bid(
  p_bid_id UUID,
  p_post_id UUID,
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_post_user_id UUID;
  v_bid_user_id UUID;
  v_post_status post_status;
BEGIN
  -- Verify post ownership and status
  SELECT user_id, status INTO v_post_user_id, v_post_status
  FROM posts WHERE id = p_post_id;

  IF v_post_user_id != p_user_id THEN
    RAISE EXCEPTION 'Not authorized: not post owner';
  END IF;

  IF v_post_status != 'open' THEN
    RAISE EXCEPTION 'Post is not open for bids';
  END IF;

  -- Verify bid exists and is pending
  SELECT user_id INTO v_bid_user_id
  FROM bids WHERE id = p_bid_id AND post_id = p_post_id AND status = 'pending';

  IF v_bid_user_id IS NULL THEN
    RAISE EXCEPTION 'Bid not found or not pending';
  END IF;

  -- Start transaction
  -- 1. Accept the selected bid
  UPDATE bids SET status = 'accepted', updated_at = NOW() WHERE id = p_bid_id;

  -- 2. Reject all other pending bids on this post
  UPDATE bids SET status = 'rejected', updated_at = NOW()
  WHERE post_id = p_post_id AND id != p_bid_id AND status = 'pending';

  -- 3. Update post status and link accepted bid
  UPDATE posts SET status = 'in_progress', accepted_bid_id = p_bid_id, updated_at = NOW()
  WHERE id = p_post_id;

  -- 4. Create conversation for chat
  INSERT INTO conversations (post_id, seeker_id, provider_id, bid_id)
  VALUES (p_post_id, p_user_id, v_bid_user_id, p_bid_id)
  ON CONFLICT (post_id, bid_id) DO NOTHING;

  -- 5. Create notifications
  INSERT INTO notifications (user_id, type, title, message, related_post_id, related_bid_id)
  VALUES
    (v_bid_user_id, 'bid_accepted', 'ใบเสนอราคาถูกยอมรับ!', 'ผู้ใช้ยอมรับใบเสนอราคาของคุณ กรุณาติดต่อเพื่อดำเนินการต่อ', p_post_id, p_bid_id),
    (p_user_id, 'bid_accepted', 'ยืนยันราคาสำเร็จ', 'คุณได้ยืนยันราคาแล้ว สามารถแชทกับผู้ให้บริการได้', p_post_id, p_bid_id);

  -- Notify other bidders
  INSERT INTO notifications (user_id, type, title, message, related_post_id, related_bid_id)
  SELECT user_id, 'bid_rejected', 'ใบเสนอราคาถูกปฏิเสธ', 'ผู้ใช้อีกท่านได้ยอมรับใบเสนอราคาอื่น', p_post_id, id
  FROM bids
  WHERE post_id = p_post_id AND id != p_bid_id AND status = 'rejected';
END;
$$;

-- Function to update user rating
CREATE OR REPLACE FUNCTION update_user_rating(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_profiles
  SET
    rating_avg = (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM reviews WHERE reviewee_id = p_user_id
    ),
    rating_count = (
      SELECT COUNT(*) FROM reviews WHERE reviewee_id = p_user_id
    ),
    completed_jobs = (
      SELECT COUNT(*) FROM posts
      WHERE user_id = p_user_id AND status = 'completed'
    )
  WHERE id = p_user_id;
END;
$$;

-- Trigger to update rating after review insert
CREATE OR REPLACE FUNCTION trigger_update_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM update_user_rating(NEW.reviewee_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_rating_after_review
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION trigger_update_rating();

-- ==========================================================================
-- Storage Buckets (run in Supabase Dashboard > Storage)
-- ==========================================================================

/*
-- Create these buckets in Supabase Storage:

1. avatars (public)
   - Public: true
   - File size limit: 2MB
   - Allowed MIME types: image/*

2. post-images (public)
   - Public: true
   - File size limit: 5MB
   - Allowed MIME types: image/*

3. chat-attachments (private)
   - Public: false
   - File size limit: 10MB
   - Allowed MIME types: image/*, application/pdf

Storage Policies:

-- Avatars: users can upload/update their own avatar
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars are publicly viewable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- Post images: authenticated users can upload
CREATE POLICY "Authenticated users can upload post images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'post-images');

CREATE POLICY "Post images are publicly viewable" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'post-images');

-- Chat attachments: conversation participants only
CREATE POLICY "Participants can upload chat attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id::text = (storage.foldername(name))[1]
        AND (seeker_id = auth.uid() OR provider_id = auth.uid())
    )
  );

CREATE POLICY "Participants can view chat attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments' AND
    EXISTS (
      SELECT 1 FROM conversations
      WHERE id::text = (storage.foldername(name))[1]
        AND (seeker_id = auth.uid() OR provider_id = auth.uid())
    )
  );
*/

-- ==========================================================================
-- Realtime Publications
-- ==========================================================================

-- Enable realtime for posts, bids, messages
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
ALTER PUBLICATION supabase_realtime ADD TABLE bids;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ==========================================================================
-- Seed Data (Optional)
-- ==========================================================================

/*
-- Insert sample vehicle types (for reference)
-- These are used in frontend constants, not stored in DB

-- Insert sample service types
-- These are used in frontend constants, not stored in DB
*/

-- ==========================================================================
-- Helper Views
-- ==========================================================================

-- View for post with bid count and author info
CREATE VIEW posts_with_details AS
SELECT
  p.*,
  up.full_name AS author_name,
  up.avatar_url AS author_avatar,
  up.role AS author_role,
  up.province AS author_province,
  up.district AS author_district,
  COALESCE(bid_stats.bid_count, 0) AS bid_count,
  COALESCE(bid_stats.min_price, 0) AS min_bid_price,
  COALESCE(bid_stats.max_price, 0) AS max_bid_price
FROM posts p
JOIN user_profiles up ON p.user_id = up.id
LEFT JOIN (
  SELECT
    post_id,
    COUNT(*) AS bid_count,
    MIN(price) AS min_price,
    MAX(price) AS max_price
  FROM bids
  WHERE status IN ('pending', 'accepted')
  GROUP BY post_id
) bid_stats ON p.id = bid_stats.post_id;

-- View for bid with bidder info
CREATE VIEW bids_with_bidder AS
SELECT
  b.*,
  up.full_name AS bidder_name,
  up.avatar_url AS bidder_avatar,
  up.phone AS bidder_phone,
  up.line_id AS bidder_line_id,
  up.rating_avg AS bidder_rating,
  up.completed_jobs AS bidder_jobs
FROM bids b
JOIN user_profiles up ON b.user_id = up.id;