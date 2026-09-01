CREATE TRIGGER IF NOT EXISTS channels_gateway_binding_no_update
BEFORE UPDATE OF gateway_id ON channels
FOR EACH ROW
WHEN NEW.gateway_id <> OLD.gateway_id
BEGIN
  SELECT RAISE(ABORT, 'channel gateway binding is immutable');
END;

CREATE TRIGGER IF NOT EXISTS sessions_gateway_channel_topology_insert
BEFORE INSERT ON sessions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM channels
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.channel_id
    AND gateway_id = NEW.gateway_id
)
BEGIN
  SELECT RAISE(ABORT, 'session gateway/channel topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS sessions_gateway_channel_topology_update
BEFORE UPDATE OF gateway_id, channel_id ON sessions
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM channels
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.channel_id
    AND gateway_id = NEW.gateway_id
)
BEGIN
  SELECT RAISE(ABORT, 'session gateway/channel topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS sessions_last_message_scope_insert
BEFORE INSERT ON sessions
FOR EACH ROW
WHEN NEW.last_message_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM session_messages
    WHERE workspace_id = NEW.workspace_id
      AND session_id = NEW.id
      AND message_id = NEW.last_message_id
  )
BEGIN
  SELECT RAISE(ABORT, 'session last message does not belong to session');
END;

CREATE TRIGGER IF NOT EXISTS sessions_last_message_scope_update
BEFORE UPDATE OF last_message_id ON sessions
FOR EACH ROW
WHEN NEW.last_message_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM session_messages
    WHERE workspace_id = NEW.workspace_id
      AND session_id = NEW.id
      AND message_id = NEW.last_message_id
  )
BEGIN
  SELECT RAISE(ABORT, 'session last message does not belong to session');
END;

CREATE TRIGGER IF NOT EXISTS session_messages_session_channel_topology_insert
BEFORE INSERT ON session_messages
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM sessions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.session_id
    AND channel_id = NEW.channel_id
)
BEGIN
  SELECT RAISE(ABORT, 'message session/channel topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS session_messages_outbound_allowlist_insert
BEFORE INSERT ON session_messages
FOR EACH ROW
WHEN NEW.direction = 'outbound'
  AND (
    NEW.recipient_ref IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM channel_allowlist
      WHERE workspace_id = NEW.workspace_id
        AND channel_id = NEW.channel_id
        AND subject_type = 'user'
        AND subject_ref = NEW.recipient_ref
        AND decision = 'allow'
        AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'outbound message recipient is not allowlisted');
END;

CREATE TRIGGER IF NOT EXISTS delivery_receipts_message_session_topology_insert
BEFORE INSERT ON delivery_receipts
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM session_messages
  WHERE workspace_id = NEW.workspace_id
    AND session_id = NEW.session_id
    AND message_id = NEW.message_id
)
BEGIN
  SELECT RAISE(ABORT, 'delivery receipt message/session topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS session_cursor_checkpoints_message_cursor_insert
BEFORE INSERT ON session_cursor_checkpoints
FOR EACH ROW
WHEN NEW.message_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM session_messages
    WHERE workspace_id = NEW.workspace_id
      AND session_id = NEW.session_id
      AND message_id = NEW.message_id
      AND cursor = NEW.cursor
  )
BEGIN
  SELECT RAISE(ABORT, 'session cursor checkpoint message cursor mismatch');
END;

CREATE TRIGGER IF NOT EXISTS session_cursor_checkpoints_message_cursor_update
BEFORE UPDATE OF cursor, message_id ON session_cursor_checkpoints
FOR EACH ROW
WHEN NEW.message_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM session_messages
    WHERE workspace_id = NEW.workspace_id
      AND session_id = NEW.session_id
      AND message_id = NEW.message_id
      AND cursor = NEW.cursor
  )
BEGIN
  SELECT RAISE(ABORT, 'session cursor checkpoint message cursor mismatch');
END;

CREATE TRIGGER IF NOT EXISTS session_messages_no_update
BEFORE UPDATE ON session_messages
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session messages are append-only');
END;

CREATE TRIGGER IF NOT EXISTS session_messages_no_delete
BEFORE DELETE ON session_messages
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'session messages are append-only');
END;

CREATE TRIGGER IF NOT EXISTS delivery_receipts_no_update
BEFORE UPDATE ON delivery_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'delivery receipts are append-only');
END;

CREATE TRIGGER IF NOT EXISTS delivery_receipts_no_delete
BEFORE DELETE ON delivery_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'delivery receipts are append-only');
END;
