-- -------------------------------------------------------
-- users（ログインユーザー）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              TEXT         PRIMARY KEY,  -- Auth0 sub (e.g., auth0|abc123)
    org_id          TEXT         NOT NULL,
    name            TEXT,
    given_name      TEXT,
    family_name     TEXT,
    email           TEXT,
    email_verified  BOOLEAN      NOT NULL DEFAULT false,
    picture         TEXT,
    last_login_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org_id ON users (org_id);

-- -------------------------------------------------------
-- accounts（顧客企業）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id             TEXT         PRIMARY KEY,
    org_id         TEXT         NOT NULL,
    name           TEXT         NOT NULL,
    industry       TEXT,
    website        TEXT,
    phone          TEXT,
    address        TEXT,
    city           TEXT,
    country        TEXT,
    employee_count INTEGER,
    annual_revenue NUMERIC(15,2),
    owner_id       TEXT         NOT NULL,
    created_by     TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_org_id   ON accounts (org_id);
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts (owner_id);

-- -------------------------------------------------------
-- contacts（連絡先）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
    id         TEXT         PRIMARY KEY,
    org_id     TEXT         NOT NULL,
    account_id TEXT         REFERENCES accounts (id) ON DELETE SET NULL,
    first_name TEXT         NOT NULL,
    last_name  TEXT         NOT NULL,
    email      TEXT,
    phone      TEXT,
    title      TEXT,
    department TEXT,
    created_by TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_id     ON contacts (org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts (account_id);

-- -------------------------------------------------------
-- opportunities（案件）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS opportunities (
    id                  TEXT         PRIMARY KEY,
    org_id              TEXT         NOT NULL,
    account_id          TEXT         REFERENCES accounts (id) ON DELETE SET NULL,
    name                TEXT         NOT NULL,
    stage               TEXT         NOT NULL DEFAULT 'prospect',
    amount              NUMERIC(15,2),
    expected_close_date DATE,
    probability         INTEGER      CHECK (probability BETWEEN 0 AND 100),
    owner_id            TEXT         NOT NULL,
    description         TEXT,
    created_by          TEXT         NOT NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opportunities_org_id     ON opportunities (org_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities (account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_id   ON opportunities (owner_id);

CREATE TABLE IF NOT EXISTS opportunity_history (
    id             TEXT        PRIMARY KEY,
    opportunity_id TEXT        NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    org_id         TEXT        NOT NULL,
    changed_by     TEXT        NOT NULL,
    changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action         TEXT        NOT NULL,
    field_name     TEXT        NOT NULL,
    old_value      TEXT,
    new_value      TEXT
);
CREATE INDEX IF NOT EXISTS idx_opportunity_history_opportunity_id ON opportunity_history (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_history_org_id         ON opportunity_history (org_id);

-- -------------------------------------------------------
-- activities（活動履歴）
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS activities (
    id             TEXT         PRIMARY KEY,
    org_id         TEXT         NOT NULL,
    account_id     TEXT         REFERENCES accounts      (id) ON DELETE CASCADE,
    opportunity_id TEXT         REFERENCES opportunities (id) ON DELETE SET NULL,
    contact_id     TEXT         REFERENCES contacts      (id) ON DELETE SET NULL,
    type           TEXT         NOT NULL,
    subject        TEXT         NOT NULL,
    description    TEXT,
    activity_date  TIMESTAMPTZ,
    created_by     TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_org_id         ON activities (org_id);
CREATE INDEX IF NOT EXISTS idx_activities_account_id     ON activities (account_id);
CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON activities (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact_id     ON activities (contact_id);

CREATE TABLE IF NOT EXISTS activity_contacts (
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    contact_id  TEXT NOT NULL REFERENCES contacts(id)   ON DELETE CASCADE,
    PRIMARY KEY (activity_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_activity_contacts_activity_id ON activity_contacts (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_contacts_contact_id  ON activity_contacts (contact_id);

-- -------------------------------------------------------
-- updated_at 自動更新トリガー
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_users_updated_at         BEFORE UPDATE ON users         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_accounts_updated_at      BEFORE UPDATE ON accounts      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_contacts_updated_at      BEFORE UPDATE ON contacts      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_opportunities_updated_at BEFORE UPDATE ON opportunities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE TRIGGER trg_activities_updated_at    BEFORE UPDATE ON activities    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
