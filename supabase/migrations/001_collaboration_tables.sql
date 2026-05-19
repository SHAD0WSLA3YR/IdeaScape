-- Create collaborative canvases table
CREATE TABLE IF NOT EXISTS collaborative_canvases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  max_participants INTEGER DEFAULT 2 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create canvas participants table
CREATE TABLE IF NOT EXISTS canvas_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id UUID NOT NULL REFERENCES collaborative_canvases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'commenter')),
  last_seen TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  cursor_pos JSONB DEFAULT NULL,
  UNIQUE(canvas_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_canvas_participants_canvas_id ON canvas_participants(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_participants_user_id ON canvas_participants(user_id);
