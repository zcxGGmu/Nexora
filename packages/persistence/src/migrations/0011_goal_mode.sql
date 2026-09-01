CREATE TABLE IF NOT EXISTS goal_loops (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  goal_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_loop_id TEXT,
  root_loop_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'waiting_judge', 'succeeded', 'failed', 'cancelled')),
  objective TEXT NOT NULL,
  definition_of_done_json TEXT NOT NULL,
  max_turns INTEGER NOT NULL CHECK (max_turns > 0 AND max_turns <= 1000),
  turn_count INTEGER NOT NULL CHECK (turn_count >= 0 AND turn_count <= max_turns),
  budget_json TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  continuation_cursor TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, goal_id) REFERENCES goals(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id),
  FOREIGN KEY (workspace_id, parent_loop_id) REFERENCES goal_loops(workspace_id, id),
  FOREIGN KEY (workspace_id, root_loop_id) REFERENCES goal_loops(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_goal_loops_workspace_status ON goal_loops(workspace_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_goal_loops_run_session ON goal_loops(workspace_id, run_id, session_id);

CREATE TABLE IF NOT EXISTS goal_continuations (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  goal_loop_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  turn INTEGER NOT NULL CHECK (turn > 0 AND turn <= 1000),
  previous_cursor TEXT,
  cursor TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  recovery_kind TEXT NOT NULL CHECK (recovery_kind IN ('normal', 'orphan_recovery')),
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  UNIQUE (workspace_id, goal_loop_id, idempotency_key),
  FOREIGN KEY (workspace_id, goal_loop_id) REFERENCES goal_loops(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_goal_continuations_loop_turn ON goal_continuations(workspace_id, goal_loop_id, turn);

CREATE TABLE IF NOT EXISTS goal_loop_commands (
  command_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  goal_loop_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pause', 'resume', 'steer', 'subgoal', 'judge')),
  idempotency_key TEXT NOT NULL,
  expected_revision INTEGER CHECK (expected_revision IS NULL OR expected_revision > 0),
  cursor TEXT,
  instruction TEXT,
  subgoal_json TEXT,
  judge_json TEXT,
  descriptor_only INTEGER NOT NULL DEFAULT 1 CHECK (descriptor_only = 1),
  payload_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, command_id),
  UNIQUE (workspace_id, goal_loop_id, idempotency_key),
  FOREIGN KEY (workspace_id, goal_loop_id) REFERENCES goal_loops(workspace_id, id),
  FOREIGN KEY (workspace_id, run_id) REFERENCES runs(workspace_id, id),
  FOREIGN KEY (workspace_id, session_id) REFERENCES sessions(workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_goal_loop_commands_loop_created ON goal_loop_commands(workspace_id, goal_loop_id, created_at, command_id);

CREATE TRIGGER IF NOT EXISTS goal_loops_session_run_topology_insert
BEFORE INSERT ON goal_loops
WHEN NOT EXISTS (
  SELECT 1 FROM sessions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.session_id
    AND run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'goal loop run/session topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_session_run_topology_update
BEFORE UPDATE OF run_id, session_id ON goal_loops
WHEN NOT EXISTS (
  SELECT 1 FROM sessions
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.session_id
    AND run_id = NEW.run_id
)
BEGIN
  SELECT RAISE(ABORT, 'goal loop run/session topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_payload_columns_match_insert
BEFORE INSERT ON goal_loops
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.goal_id') IS NOT NEW.goal_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.parent_loop_id') IS NOT NEW.parent_loop_id
  OR json_extract(NEW.payload_json, '$.root_loop_id') IS NOT NEW.root_loop_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.objective') IS NOT NEW.objective
  OR json_extract(NEW.payload_json, '$.definition_of_done') IS NOT json(NEW.definition_of_done_json)
  OR json_extract(NEW.payload_json, '$.max_turns') IS NOT NEW.max_turns
  OR json_extract(NEW.payload_json, '$.turn_count') IS NOT NEW.turn_count
  OR json_extract(NEW.payload_json, '$.budget.max_tokens') IS NOT json_extract(NEW.budget_json, '$.max_tokens')
  OR json_extract(NEW.payload_json, '$.budget.max_cost_usd') IS NOT json_extract(NEW.budget_json, '$.max_cost_usd')
  OR json_extract(NEW.payload_json, '$.deadline_at') IS NOT NEW.deadline_at
  OR json_extract(NEW.payload_json, '$.continuation_cursor') IS NOT NEW.continuation_cursor
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'goal loop payload must match descriptor columns');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_payload_columns_match_update
BEFORE UPDATE ON goal_loops
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.goal_id') IS NOT NEW.goal_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.parent_loop_id') IS NOT NEW.parent_loop_id
  OR json_extract(NEW.payload_json, '$.root_loop_id') IS NOT NEW.root_loop_id
  OR json_extract(NEW.payload_json, '$.status') IS NOT NEW.status
  OR json_extract(NEW.payload_json, '$.objective') IS NOT NEW.objective
  OR json_extract(NEW.payload_json, '$.definition_of_done') IS NOT json(NEW.definition_of_done_json)
  OR json_extract(NEW.payload_json, '$.max_turns') IS NOT NEW.max_turns
  OR json_extract(NEW.payload_json, '$.turn_count') IS NOT NEW.turn_count
  OR json_extract(NEW.payload_json, '$.budget.max_tokens') IS NOT json_extract(NEW.budget_json, '$.max_tokens')
  OR json_extract(NEW.payload_json, '$.budget.max_cost_usd') IS NOT json_extract(NEW.budget_json, '$.max_cost_usd')
  OR json_extract(NEW.payload_json, '$.deadline_at') IS NOT NEW.deadline_at
  OR json_extract(NEW.payload_json, '$.continuation_cursor') IS NOT NEW.continuation_cursor
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
BEGIN
  SELECT RAISE(ABORT, 'goal loop payload must match descriptor columns');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_scope_immutable
BEFORE UPDATE OF goal_id, run_id, session_id, parent_loop_id, root_loop_id ON goal_loops
WHEN NEW.goal_id <> OLD.goal_id
  OR NEW.run_id <> OLD.run_id
  OR NEW.session_id <> OLD.session_id
  OR NEW.parent_loop_id IS NOT OLD.parent_loop_id
  OR NEW.root_loop_id <> OLD.root_loop_id
BEGIN
  SELECT RAISE(ABORT, 'goal loop scope is immutable');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_terminal_status_immutable
BEFORE UPDATE OF status ON goal_loops
WHEN OLD.status IN ('succeeded', 'failed', 'cancelled')
  AND NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'goal loop terminal status is immutable');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_terminal_status_requires_judge_gate
BEFORE UPDATE OF status ON goal_loops
WHEN NEW.status IN ('succeeded', 'failed')
  AND OLD.status <> 'waiting_judge'
BEGIN
  SELECT RAISE(ABORT, 'goal loop terminal status requires judge gate');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_terminal_status_requires_matching_judge
BEFORE UPDATE OF status, payload_json ON goal_loops
WHEN (NEW.status = 'succeeded' AND json_extract(NEW.payload_json, '$.judge.done') IS NOT 1)
  OR (NEW.status = 'failed' AND json_extract(NEW.payload_json, '$.judge.done') IS NOT 0)
  OR (NEW.status <> 'succeeded' AND json_extract(NEW.payload_json, '$.judge.done') IS 1)
BEGIN
  SELECT RAISE(ABORT, 'goal loop terminal status requires matching judge decision');
END;

CREATE TRIGGER IF NOT EXISTS goal_loops_terminal_status_requires_matching_judge_insert
BEFORE INSERT ON goal_loops
WHEN (NEW.status = 'succeeded' AND json_extract(NEW.payload_json, '$.judge.done') IS NOT 1)
  OR (NEW.status = 'failed' AND json_extract(NEW.payload_json, '$.judge.done') IS NOT 0)
  OR (NEW.status <> 'succeeded' AND json_extract(NEW.payload_json, '$.judge.done') IS 1)
BEGIN
  SELECT RAISE(ABORT, 'goal loop terminal status requires matching judge decision');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_loop_run_session_topology_insert
BEFORE INSERT ON goal_continuations
WHEN NOT EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND run_id = NEW.run_id
    AND session_id = NEW.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'goal continuation run/session topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_terminal_loop_insert
BEFORE INSERT ON goal_continuations
WHEN EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND status IN ('succeeded', 'failed', 'cancelled')
)
BEGIN
  SELECT RAISE(ABORT, 'goal continuation cannot update terminal loop');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_normal_cursor_progress_insert
BEFORE INSERT ON goal_continuations
WHEN NEW.recovery_kind = 'normal'
  AND EXISTS (
    SELECT 1 FROM goal_loops
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.goal_loop_id
      AND continuation_cursor = NEW.cursor
  )
BEGIN
  SELECT RAISE(ABORT, 'goal continuation cursor must make forward progress');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_normal_previous_cursor_insert
BEFORE INSERT ON goal_continuations
WHEN NEW.recovery_kind = 'normal'
  AND EXISTS (
    SELECT 1 FROM goal_loops
    WHERE workspace_id = NEW.workspace_id
      AND id = NEW.goal_loop_id
      AND continuation_cursor IS NOT NEW.previous_cursor
  )
BEGIN
  SELECT RAISE(ABORT, 'goal continuation previous cursor must match current cursor');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_payload_columns_match_insert
BEFORE INSERT ON goal_continuations
WHEN json_extract(NEW.payload_json, '$.id') IS NOT NEW.id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.turn') IS NOT NEW.turn
  OR json_extract(NEW.payload_json, '$.previous_cursor') IS NOT NEW.previous_cursor
  OR json_extract(NEW.payload_json, '$.cursor') IS NOT NEW.cursor
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.recovery_kind') IS NOT NEW.recovery_kind
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
  OR json_extract(NEW.payload_json, '$.updated_at') IS NOT NEW.updated_at
  OR json_type(NEW.payload_json, '$.judge') IS NOT 'object'
BEGIN
  SELECT RAISE(ABORT, 'goal continuation payload must match descriptor columns');
END;

CREATE TRIGGER IF NOT EXISTS goal_loop_commands_loop_run_session_topology_insert
BEFORE INSERT ON goal_loop_commands
WHEN NOT EXISTS (
  SELECT 1 FROM goal_loops
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.goal_loop_id
    AND run_id = NEW.run_id
    AND session_id = NEW.session_id
)
BEGIN
  SELECT RAISE(ABORT, 'goal loop command run/session topology mismatch');
END;

CREATE TRIGGER IF NOT EXISTS goal_loop_commands_kind_shape_insert
BEFORE INSERT ON goal_loop_commands
WHEN (NEW.kind = 'steer' AND NEW.instruction IS NULL)
  OR (NEW.kind = 'subgoal' AND (NEW.instruction IS NULL OR NEW.subgoal_json IS NULL))
  OR (NEW.kind = 'judge' AND NEW.judge_json IS NULL)
  OR (NEW.kind IN ('pause', 'resume') AND NEW.instruction IS NOT NULL)
  OR (NEW.kind <> 'subgoal' AND NEW.subgoal_json IS NOT NULL)
  OR (NEW.kind <> 'judge' AND NEW.judge_json IS NOT NULL)
  OR (NEW.kind = 'judge' AND NEW.instruction IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'goal loop command shape does not match kind');
END;

CREATE TRIGGER IF NOT EXISTS goal_loop_commands_payload_columns_match_insert
BEFORE INSERT ON goal_loop_commands
WHEN json_extract(NEW.payload_json, '$.command_id') IS NOT NEW.command_id
  OR json_extract(NEW.payload_json, '$.workspace_id') IS NOT NEW.workspace_id
  OR json_extract(NEW.payload_json, '$.goal_loop_id') IS NOT NEW.goal_loop_id
  OR json_extract(NEW.payload_json, '$.run_id') IS NOT NEW.run_id
  OR json_extract(NEW.payload_json, '$.session_id') IS NOT NEW.session_id
  OR json_extract(NEW.payload_json, '$.kind') IS NOT NEW.kind
  OR json_extract(NEW.payload_json, '$.idempotency_key') IS NOT NEW.idempotency_key
  OR json_extract(NEW.payload_json, '$.expected_revision') IS NOT NEW.expected_revision
  OR json_extract(NEW.payload_json, '$.cursor') IS NOT NEW.cursor
  OR json_extract(NEW.payload_json, '$.instruction') IS NOT NEW.instruction
  OR json_extract(NEW.payload_json, '$.subgoal') IS NOT json(NEW.subgoal_json)
  OR json_extract(NEW.payload_json, '$.judge') IS NOT json(NEW.judge_json)
  OR json_extract(NEW.payload_json, '$.descriptor_only') IS NOT 1
  OR json_extract(NEW.payload_json, '$.schema_version') IS NOT NEW.schema_version
  OR json_extract(NEW.payload_json, '$.created_at') IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'goal loop command payload must match descriptor columns');
END;

CREATE TRIGGER IF NOT EXISTS goal_loop_commands_no_update
BEFORE UPDATE ON goal_loop_commands
BEGIN
  SELECT RAISE(ABORT, 'goal loop commands are append-only');
END;

CREATE TRIGGER IF NOT EXISTS goal_loop_commands_no_delete
BEFORE DELETE ON goal_loop_commands
BEGIN
  SELECT RAISE(ABORT, 'goal loop commands are append-only');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_no_update
BEFORE UPDATE ON goal_continuations
BEGIN
  SELECT RAISE(ABORT, 'goal continuations are append-only');
END;

CREATE TRIGGER IF NOT EXISTS goal_continuations_no_delete
BEFORE DELETE ON goal_continuations
BEGIN
  SELECT RAISE(ABORT, 'goal continuations are append-only');
END;
