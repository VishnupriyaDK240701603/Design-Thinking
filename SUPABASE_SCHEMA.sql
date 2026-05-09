-- NAMMA THITTAM - CLEAN SUPABASE SCHEMA
-- Ground-up destructive rebuild. Run only after backing up data you still need.
--
-- Design goals:
-- 1. One authenticated account per person.
-- 2. No family_members table for account/profile control.
-- 3. Registration data is separated by concern instead of being stored on users.
-- 4. Conditional fields live in conditional tables or sparse row tables.
-- 5. Derived/redundant flags are exposed through views, not duplicated as columns.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 0. DROP THE OLD STRUCTURE COMPLETELY
-- ============================================================================

DROP VIEW IF EXISTS user_registration_profiles CASCADE;
DROP VIEW IF EXISTS user_scheme_profile_inputs CASCADE;

DROP TABLE IF EXISTS user_scheme_status CASCADE;
DROP TABLE IF EXISTS user_schemes CASCADE;
DROP TABLE IF EXISTS user_documents CASCADE;
DROP TABLE IF EXISTS family_members CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS csc_centres CASCADE;
DROP TABLE IF EXISTS schemes CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TABLE IF EXISTS scheme_application_steps CASCADE;
DROP TABLE IF EXISTS scheme_required_documents CASCADE;
DROP TABLE IF EXISTS user_document_possessions CASCADE;
DROP TABLE IF EXISTS user_special_statuses CASCADE;
DROP TABLE IF EXISTS user_household_profiles CASCADE;
DROP TABLE IF EXISTS user_business_profiles CASCADE;
DROP TABLE IF EXISTS user_occupation_profiles CASCADE;
DROP TABLE IF EXISTS user_education_profiles CASCADE;
DROP TABLE IF EXISTS user_existing_scheme_benefits CASCADE;
DROP TABLE IF EXISTS user_economic_profiles CASCADE;
DROP TABLE IF EXISTS user_disabilities CASCADE;
DROP TABLE IF EXISTS user_minority_details CASCADE;
DROP TABLE IF EXISTS user_security_questions CASCADE;

DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- ============================================================================
-- 1. SHARED UPDATED_AT TRIGGER
-- ============================================================================

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. ACCOUNT AND RECOVERY
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(80) NOT NULL UNIQUE,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'ta',
  registration_completed_at TIMESTAMPTZ,
  profile_locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_username_format_check
    CHECK (username ~ '^[A-Za-z0-9_]{4,80}$'),
  CONSTRAINT users_preferred_language_check
    CHECK (preferred_language IN ('ta', 'en'))
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_username ON users(username);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_security_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_no SMALLINT NOT NULL,
  question_text TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_security_questions_question_no_check
    CHECK (question_no BETWEEN 1 AND 4),
  CONSTRAINT user_security_questions_unique_no
    UNIQUE (user_id, question_no)
);

CREATE INDEX idx_user_security_questions_user_id ON user_security_questions(user_id);

CREATE TRIGGER trg_user_security_questions_updated_at
BEFORE UPDATE ON user_security_questions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. REGISTRATION PROFILE - CORE AND CONDITIONAL DETAILS
-- ============================================================================

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  age SMALLINT NOT NULL,
  gender VARCHAR(20) NOT NULL,
  social_category VARCHAR(10) NOT NULL,
  religion VARCHAR(100) NOT NULL,
  state_of_residence VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
  marital_status VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_profiles_age_check
    CHECK (age BETWEEN 0 AND 120),
  CONSTRAINT user_profiles_gender_check
    CHECK (gender IN ('male', 'female', 'transgender', 'other')),
  CONSTRAINT user_profiles_social_category_check
    CHECK (social_category IN ('OC', 'BC', 'MBC', 'SC', 'ST')),
  CONSTRAINT user_profiles_marital_status_check
    CHECK (marital_status IN ('single', 'married', 'widowed', 'divorced', 'separated'))
);

CREATE INDEX idx_user_profiles_gender ON user_profiles(gender);
CREATE INDEX idx_user_profiles_social_category ON user_profiles(social_category);
CREATE INDEX idx_user_profiles_state ON user_profiles(state_of_residence);

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_minority_details (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  denomination VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_user_minority_details_updated_at
BEFORE UPDATE ON user_minority_details
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_disabilities (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  disability_type VARCHAR(100),
  disability_percent SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_disabilities_percent_check
    CHECK (disability_percent BETWEEN 1 AND 100)
);

CREATE TRIGGER trg_user_disabilities_updated_at
BEFORE UPDATE ON user_disabilities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. ECONOMIC PROFILE
-- ============================================================================

CREATE TABLE user_economic_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  income_annual INTEGER NOT NULL,
  bpl_status VARCHAR(20) NOT NULL,
  ration_card_type VARCHAR(20) NOT NULL,
  house_ownership VARCHAR(20) NOT NULL,
  land_ownership VARCHAR(20) NOT NULL,
  land_holding_acres NUMERIC(10, 2) NOT NULL DEFAULT 0,
  area_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_economic_profiles_income_check
    CHECK (income_annual >= 0),
  CONSTRAINT user_economic_profiles_bpl_status_check
    CHECK (bpl_status IN ('bpl', 'apl', 'unknown')),
  CONSTRAINT user_economic_profiles_ration_card_type_check
    CHECK (ration_card_type IN ('PHH', 'NPHH', 'AAY', 'none')),
  CONSTRAINT user_economic_profiles_house_ownership_check
    CHECK (house_ownership IN ('owned', 'rental', 'government', 'other')),
  CONSTRAINT user_economic_profiles_land_ownership_check
    CHECK (land_ownership IN ('none', 'owned', 'leased', 'family')),
  CONSTRAINT user_economic_profiles_land_holding_check
    CHECK (
      land_holding_acres >= 0
      AND ((land_ownership = 'none' AND land_holding_acres = 0) OR land_ownership <> 'none')
    ),
  CONSTRAINT user_economic_profiles_area_type_check
    CHECK (area_type IN ('rural', 'urban', 'semi_urban'))
);

CREATE INDEX idx_user_economic_profiles_bpl ON user_economic_profiles(bpl_status);
CREATE INDEX idx_user_economic_profiles_income ON user_economic_profiles(income_annual);
CREATE INDEX idx_user_economic_profiles_area ON user_economic_profiles(area_type);

CREATE TRIGGER trg_user_economic_profiles_updated_at
BEFORE UPDATE ON user_economic_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_existing_scheme_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_existing_scheme_benefits_unique_name
    UNIQUE (user_id, scheme_name)
);

CREATE INDEX idx_user_existing_scheme_benefits_user_id
  ON user_existing_scheme_benefits(user_id);

-- ============================================================================
-- 5. EDUCATION PROFILE
-- ============================================================================

CREATE TABLE user_education_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  education_level VARCHAR(40) NOT NULL,
  first_generation_graduate BOOLEAN NOT NULL DEFAULT FALSE,
  course_stream VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_education_profiles_level_check
    CHECK (
      education_level IN (
        'none', 'primary', 'middle', 'high_school', 'higher_secondary',
        'diploma_iti', 'undergraduate', 'postgraduate', 'doctorate'
      )
    )
);

CREATE INDEX idx_user_education_profiles_level ON user_education_profiles(education_level);

CREATE TRIGGER trg_user_education_profiles_updated_at
BEFORE UPDATE ON user_education_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. EMPLOYMENT, OCCUPATION, AND BUSINESS PROFILE
-- ============================================================================

CREATE TABLE user_occupation_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employment_status VARCHAR(30) NOT NULL,
  occupation_sector VARCHAR(50),
  registered_worker BOOLEAN NOT NULL DEFAULT FALSE,
  worker_board_name VARCHAR(150),
  has_skill_certificate BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_occupation_profiles_employment_check
    CHECK (employment_status IN ('student', 'employed', 'self_employed', 'unemployed', 'homemaker', 'retired')),
  CONSTRAINT user_occupation_profiles_sector_check
    CHECK (
      occupation_sector IS NULL
      OR occupation_sector IN (
        'farmer', 'labourer', 'construction', 'government_employee',
        'private_employee', 'business', 'fisheries', 'weaving', 'other'
      )
    ),
  CONSTRAINT user_occupation_profiles_sector_required_check
    CHECK (
      (employment_status IN ('employed', 'self_employed') AND occupation_sector IS NOT NULL)
      OR employment_status NOT IN ('employed', 'self_employed')
    ),
  CONSTRAINT user_occupation_profiles_worker_board_check
    CHECK (
      (registered_worker = TRUE AND worker_board_name IS NOT NULL)
      OR registered_worker = FALSE
    )
);

CREATE INDEX idx_user_occupation_profiles_employment
  ON user_occupation_profiles(employment_status);
CREATE INDEX idx_user_occupation_profiles_sector
  ON user_occupation_profiles(occupation_sector);

CREATE TRIGGER trg_user_occupation_profiles_updated_at
BEFORE UPDATE ON user_occupation_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_business_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  has_msme_registration BOOLEAN NOT NULL DEFAULT FALSE,
  business_ownership_status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_business_profiles_ownership_check
    CHECK (business_ownership_status IN ('sole_owner', 'partnership', 'family_business', 'women_owned'))
);

CREATE TRIGGER trg_user_business_profiles_updated_at
BEFORE UPDATE ON user_business_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 7. HOUSEHOLD AND SPECIAL STATUS PROFILE
-- ============================================================================

CREATE TABLE user_household_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  number_of_children SMALLINT NOT NULL DEFAULT 0,
  number_of_girl_children SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_household_profiles_children_check
    CHECK (
      number_of_children BETWEEN 0 AND 30
      AND number_of_girl_children BETWEEN 0 AND 30
      AND number_of_girl_children <= number_of_children
    )
);

CREATE TRIGGER trg_user_household_profiles_updated_at
BEFORE UPDATE ON user_household_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_special_statuses (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, status_code),
  CONSTRAINT user_special_statuses_code_check
    CHECK (
      status_code IN (
        'pregnant_or_lactating',
        'widow_or_widower',
        'chronic_illness_family',
        'pvtg',
        'orphan_destitute',
        'migrant_worker',
        'armed_forces_family',
        'fisherman',
        'weaver'
      )
    )
);

CREATE INDEX idx_user_special_statuses_status_code
  ON user_special_statuses(status_code);

-- ============================================================================
-- 8. DOCUMENT POSSESSION
-- ============================================================================

CREATE TABLE user_document_possessions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, document_type),
  CONSTRAINT user_document_possessions_type_check
    CHECK (
      document_type IN (
        'aadhaar',
        'ration_card',
        'aadhaar_linked_bank_account',
        'income_certificate',
        'community_certificate',
        'residence_certificate',
        'disability_certificate',
        'business_proof',
        'land_ownership_proof',
        'age_proof',
        'passport_photo'
      )
    )
);

CREATE INDEX idx_user_document_possessions_document_type
  ON user_document_possessions(document_type);

-- ============================================================================
-- 9. SCHEME CATALOG
-- ============================================================================

CREATE TABLE schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  government_scheme_id VARCHAR(255) UNIQUE,
  source VARCHAR(120),
  title_ta VARCHAR(500) NOT NULL,
  title_en VARCHAR(500),
  description_ta TEXT,
  description_en TEXT,
  category VARCHAR(100) NOT NULL,
  authority VARCHAR(255),
  benefit_amount NUMERIC(14, 2),
  benefit_type VARCHAR(100),
  benefit_unit VARCHAR(100),
  application_url TEXT,
  application_deadline DATE,
  eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  benefit_norm NUMERIC(8, 4) NOT NULL DEFAULT 0,
  urgency NUMERIC(8, 4) NOT NULL DEFAULT 0,
  recency NUMERIC(8, 4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT schemes_benefit_amount_check
    CHECK (benefit_amount IS NULL OR benefit_amount >= 0),
  CONSTRAINT schemes_scores_check
    CHECK (
      benefit_norm BETWEEN 0 AND 100
      AND urgency BETWEEN 0 AND 100
      AND recency BETWEEN 0 AND 100
    )
);

CREATE INDEX idx_schemes_category ON schemes(category);
CREATE INDEX idx_schemes_is_active ON schemes(is_active);
CREATE INDEX idx_schemes_deadline ON schemes(application_deadline);
CREATE INDEX idx_schemes_government_scheme_id ON schemes(government_scheme_id);
CREATE INDEX idx_schemes_eligibility_rules_gin ON schemes USING GIN (eligibility_rules);

CREATE TRIGGER trg_schemes_updated_at
BEFORE UPDATE ON schemes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE scheme_required_documents (
  scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  document_type VARCHAR(60) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (scheme_id, document_type),
  CONSTRAINT scheme_required_documents_type_check
    CHECK (
      document_type IN (
        'aadhaar',
        'ration_card',
        'income_certificate',
        'community_certificate',
        'residence_certificate',
        'disability_certificate',
        'business_proof',
        'land_ownership_proof',
        'age_proof',
        'passport_photo',
        'bank_account',
        'other'
      )
    )
);

CREATE INDEX idx_scheme_required_documents_document_type
  ON scheme_required_documents(document_type);

CREATE TABLE scheme_application_steps (
  scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  step_no SMALLINT NOT NULL,
  instruction_ta TEXT NOT NULL,
  instruction_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (scheme_id, step_no),
  CONSTRAINT scheme_application_steps_step_no_check
    CHECK (step_no > 0)
);

-- ============================================================================
-- 10. USER SCHEME TRACKING
-- ============================================================================

CREATE TABLE user_scheme_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES schemes(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'not_applied',
  saved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  decision_at TIMESTAMPTZ,
  notes_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_scheme_status_status_check
    CHECK (status IN ('not_applied', 'saved', 'bookmarked', 'applied', 'under_review', 'in_progress', 'approved', 'rejected', 'withdrawn')),
  CONSTRAINT user_scheme_status_unique_user_scheme
    UNIQUE (user_id, scheme_id)
);

CREATE INDEX idx_user_scheme_status_user_id ON user_scheme_status(user_id);
CREATE INDEX idx_user_scheme_status_scheme_id ON user_scheme_status(scheme_id);
CREATE INDEX idx_user_scheme_status_status ON user_scheme_status(status);

CREATE TRIGGER trg_user_scheme_status_updated_at
BEFORE UPDATE ON user_scheme_status
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 11. NOTIFICATIONS, SYNC LOGS, AND CSC CENTRES
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES schemes(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL,
  title_ta VARCHAR(255) NOT NULL,
  title_en VARCHAR(255),
  message_ta TEXT,
  message_en TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_type_check
    CHECK (type IN ('scheme_match', 'deadline', 'status_update', 'document', 'system'))
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_scheme_id ON notifications(scheme_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at) WHERE read_at IS NULL;

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(120) NOT NULL,
  entity VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT sync_logs_status_check
    CHECK (status IN ('started', 'success', 'failed', 'partial')),
  CONSTRAINT sync_logs_counts_check
    CHECK (records_seen >= 0 AND records_inserted >= 0 AND records_updated >= 0)
);

CREATE INDEX idx_sync_logs_source_entity ON sync_logs(source, entity);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);

CREATE TABLE csc_centres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  district VARCHAR(100) NOT NULL,
  address TEXT,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  phone VARCHAR(20),
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT csc_centres_latitude_check
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT csc_centres_longitude_check
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX idx_csc_centres_district ON csc_centres(district);
CREATE INDEX idx_csc_centres_is_active ON csc_centres(is_active);

CREATE TRIGGER trg_csc_centres_updated_at
BEFORE UPDATE ON csc_centres
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 12. READ VIEWS FOR APP/API CONVENIENCE
-- ============================================================================
-- These views keep storage normalized but give the API a single read model for
-- scheme scoring and profile display. Values such as is_bpl, has_ration_card,
-- and document booleans are derived instead of stored twice.

CREATE VIEW user_registration_profiles AS
SELECT
  u.id,
  u.auth_id,
  u.username,
  u.preferred_language,
  (u.registration_completed_at IS NOT NULL) AS registration_complete,
  u.profile_locked_until AS profile_locked_at,

  p.full_name,
  p.age,
  p.gender,
  p.social_category,
  p.religion,
  (md.user_id IS NOT NULL) AS minority_status,
  md.denomination AS minority_denomination,
  p.state_of_residence,
  p.marital_status,

  (d.user_id IS NOT NULL) AS is_disabled,
  d.disability_type,
  COALESCE(d.disability_percent, 0) AS disability_percent,

  e.income_annual,
  e.bpl_status,
  (e.bpl_status = 'bpl') AS is_bpl,
  e.ration_card_type,
  (e.ration_card_type <> 'none') AS has_ration_card,
  e.house_ownership,
  e.land_ownership,
  e.land_holding_acres,
  e.area_type,
  EXISTS (
    SELECT 1
    FROM user_existing_scheme_benefits esb
    WHERE esb.user_id = u.id
  ) AS existing_scheme_benefits,
  (
    SELECT STRING_AGG(esb.scheme_name, ', ' ORDER BY esb.scheme_name)
    FROM user_existing_scheme_benefits esb
    WHERE esb.user_id = u.id
  ) AS existing_scheme_names,

  edu.education_level,
  edu.first_generation_graduate,
  edu.course_stream,

  occ.employment_status,
  occ.occupation_sector AS occupation,
  occ.occupation_sector,
  occ.registered_worker,
  occ.worker_board_name,
  occ.has_skill_certificate,
  COALESCE(bp.has_msme_registration, FALSE) AS has_msme_registration,
  COALESCE(bp.business_ownership_status, 'not_applicable') AS business_ownership_status,

  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'fisherman') AS is_fisherman,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'weaver') AS is_weaver,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'armed_forces_family') AS is_armed_forces_family,

  h.number_of_children,
  h.number_of_children AS children_below_18,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'pregnant_or_lactating') AS is_pregnant_or_lactating,
  h.number_of_girl_children,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'widow_or_widower') AS is_widow_or_widower,
  (
    EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'widow_or_widower')
    OR EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'orphan_destitute')
  ) AS is_widow_orphan_single_parent,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'chronic_illness_family') AS has_chronic_illness_family,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'pvtg') AS is_pvtg,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'orphan_destitute') AS is_orphan_destitute,
  EXISTS (SELECT 1 FROM user_special_statuses ss WHERE ss.user_id = u.id AND ss.status_code = 'migrant_worker') AS is_migrant_worker,

  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'aadhaar') AS has_aadhaar,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'ration_card') AS has_ration_card_document,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'aadhaar_linked_bank_account') AS has_aadhaar_linked_bank_account,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'aadhaar_linked_bank_account') AS has_jan_dhan_account,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'income_certificate') AS has_income_certificate,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'community_certificate') AS has_community_certificate,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'residence_certificate') AS has_residence_certificate,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'disability_certificate') AS has_disability_certificate,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'business_proof') AS has_business_proof,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'land_ownership_proof') AS has_land_ownership_proof,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'age_proof') AS has_age_proof,
  EXISTS (SELECT 1 FROM user_document_possessions dp WHERE dp.user_id = u.id AND dp.document_type = 'passport_photo') AS has_passport_photo,

  u.created_at,
  u.updated_at
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id
LEFT JOIN user_minority_details md ON md.user_id = u.id
LEFT JOIN user_disabilities d ON d.user_id = u.id
LEFT JOIN user_economic_profiles e ON e.user_id = u.id
LEFT JOIN user_education_profiles edu ON edu.user_id = u.id
LEFT JOIN user_occupation_profiles occ ON occ.user_id = u.id
LEFT JOIN user_business_profiles bp ON bp.user_id = u.id
LEFT JOIN user_household_profiles h ON h.user_id = u.id;

CREATE VIEW user_scheme_profile_inputs AS
SELECT *
FROM user_registration_profiles
WHERE registration_complete = TRUE;

-- ============================================================================
-- 13. ROW LEVEL SECURITY STARTING POINT
-- ============================================================================
-- Enable these policies when the client accesses Supabase directly. The current
-- backend can also use service-role access and enforce auth in API middleware.
--
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_minority_details ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_disabilities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_economic_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_existing_scheme_benefits ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_education_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_occupation_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_business_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_household_profiles ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_special_statuses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_document_possessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_scheme_status ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 14. TABLE USAGE SUMMARY
-- ============================================================================
-- users:
--   Account ownership only. Links one app account to auth.users and stores
--   username, language, and registration/lock metadata.
--
-- user_security_questions:
--   Four account recovery prompts and hashed answers. Kept out of profile data.
--
-- user_profiles:
--   Required identity and demographic registration fields.
--
-- user_minority_details:
--   Exists only if minority_status is true. No row means false.
--
-- user_disabilities:
--   Exists only if the user declared a disability. No row means not disabled.
--
-- user_economic_profiles:
--   Income, BPL/APL, ration, housing, land, and residence-area fields.
--
-- user_existing_scheme_benefits:
--   One row per already-received scheme, avoiding comma-separated storage.
--
-- user_education_profiles:
--   Education level, first-generation graduate flag, and conditional course data.
--
-- user_occupation_profiles:
--   Employment status, sector, worker board registration, and skill certificate.
--
-- user_business_profiles:
--   Exists only for self-employed/business users.
--
-- user_household_profiles:
--   Child counts. Derived children_below_18 comes from number_of_children.
--
-- user_special_statuses:
--   Sparse true-only status rows such as pregnant_or_lactating, pvtg, migrant,
--   armed_forces_family, fisherman, and weaver.
--
-- user_document_possessions:
--   True-only document possession rows used for eligibility matching.
--
-- schemes:
--   Government scheme catalog with flexible JSON eligibility rules.
--
-- scheme_required_documents:
--   Normalized document requirements per scheme.
--
-- scheme_application_steps:
--   Ordered application instructions per scheme.
--
-- user_scheme_status:
--   Per-user tracking for saved/applied/approved/rejected scheme state.
--   notes_encrypted stores private per-scheme application notes such as portal
--   login ID, application ID, password, and follow-up reminders.
--
-- notifications:
--   User-facing messages, optionally related to a scheme.
--
-- sync_logs:
--   Import/sync audit trail for external scheme and CSC data.
--
-- csc_centres:
--   Service centre directory with location and service metadata.
--
-- user_registration_profiles:
--   Flattened read model for the app/API. It derives compatibility fields instead
--   of storing duplicate booleans in the base tables.

COMMIT;
