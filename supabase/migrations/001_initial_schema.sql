-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Proposals: Ideas submitted by agents or triggers
CREATE TABLE IF NOT EXISTS ops_mission_proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('api', 'trigger', 'reaction', 'agent')),
  proposer_agent TEXT,
  step_kind TEXT NOT NULL,
  step_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Missions: Approved proposals become missions
CREATE TABLE IF NOT EXISTS ops_missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID REFERENCES ops_mission_proposals(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'running', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Mission Steps: Individual executable steps
CREATE TABLE IF NOT EXISTS ops_mission_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES ops_missions(id) ON DELETE CASCADE,
  step_kind TEXT NOT NULL,
  step_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  reserved_at TIMESTAMPTZ,
  reserved_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result JSONB,
  last_error TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events: All agent actions logged here
CREATE TABLE IF NOT EXISTS ops_agent_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  agent_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Policies: Configurable behavior toggles
CREATE TABLE IF NOT EXISTS ops_policy (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger Rules: Condition → proposal templates
CREATE TABLE IF NOT EXISTS ops_trigger_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  condition JSONB NOT NULL,
  proposal_template JSONB NOT NULL,
  cooldown_minutes INT DEFAULT 120,
  last_fired_at TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true
);

-- Reaction Queue: Inter-agent responses
CREATE TABLE IF NOT EXISTS ops_agent_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_agent TEXT NOT NULL,
  target_agent TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Action Runs: Execution logs
CREATE TABLE IF NOT EXISTS ops_action_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID REFERENCES ops_mission_steps(id),
  agent_name TEXT,
  action TEXT NOT NULL,
  input JSONB,
  output JSONB,
  error TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposals_status ON ops_mission_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON ops_mission_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missions_status ON ops_missions(status);
CREATE INDEX IF NOT EXISTS idx_missions_created ON ops_missions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_steps_status ON ops_mission_steps(status, reserved_at);
CREATE INDEX IF NOT EXISTS idx_steps_mission ON ops_mission_steps(mission_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON ops_agent_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON ops_agent_events(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_status ON ops_agent_reactions(status);
CREATE INDEX IF NOT EXISTS idx_action_runs_step ON ops_action_runs(step_id);

-- Seed default policies
INSERT INTO ops_policy (key, value, description) VALUES
('auto_approve', '{"enabled": true, "allowed_step_kinds": ["draft_tweet", "crawl", "analyze", "write_content", "post_tweet"]}', 'Auto-approval settings'),
('x_autopost', '{"enabled": true}', 'Twitter autopost toggle'),
('x_daily_quota', '{"limit": 10}', 'Daily tweet limit'),
('worker_policy', '{"enabled": false}', 'Whether Vercel executes steps (false = VPS only)'),
('reaction_matrix', '{"patterns": [
  {"source": "twitter-alt", "tags": ["tweet", "posted"], "target": "growth", "type": "analyze", "probability": 0.3, "cooldown": 120},
  {"source": "*", "tags": ["mission:failed"], "target": "brain", "type": "diagnose", "probability": 1.0, "cooldown": 60}
]}', 'Inter-agent reaction rules'),
('daily_proposal_limit', '{"limit": 100}', 'Maximum proposals per day')
ON CONFLICT (key) DO NOTHING;

-- Seed default trigger rules
INSERT INTO ops_trigger_rules (name, condition, proposal_template, cooldown_minutes) VALUES
('viral_tweet_analysis', '{"type": "tweet_engagement", "threshold": 5, "metric": "engagement_rate"}', '{"title": "Analyze viral tweet", "step_kind": "analyze", "step_payload": {"focus": "engagement"}}', 120),
('mission_failure_diagnosis', '{"type": "mission_status", "status": "failed"}', '{"title": "Diagnose mission failure", "step_kind": "analyze", "step_payload": {"focus": "root_cause"}}', 60),
('content_quality_review', '{"type": "content_published"}', '{"title": "Review content quality", "step_kind": "analyze", "step_payload": {"focus": "quality"}}', 120),
('insight_promotion', '{"type": "insight_upvotes", "threshold": 3}', '{"title": "Promote insight to memory", "step_kind": "write_content", "step_payload": {"type": "memory"}}', 240)
ON CONFLICT DO NOTHING;