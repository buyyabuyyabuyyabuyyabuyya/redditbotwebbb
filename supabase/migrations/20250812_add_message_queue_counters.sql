-- Message queue counters per user and hour window
CREATE TABLE IF NOT EXISTS message_queue_counters (
  user_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT message_queue_counters_pkey PRIMARY KEY (user_id, window_start)
);

-- Atomic increment function
CREATE OR REPLACE FUNCTION increment_message_counter(p_user_id TEXT, p_window_start TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE new_count INTEGER;
BEGIN
  INSERT INTO message_queue_counters(user_id, window_start, counter)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET counter = message_queue_counters.counter + 1
  RETURNING counter INTO new_count;
  RETURN new_count;
END;
$$; 