import { appDb } from '../db';

const DOCUMENT_FIELDS: Record<string, string> = {
  has_aadhaar: 'aadhaar',
  has_ration_card_document: 'ration_card',
  has_aadhaar_linked_bank_account: 'aadhaar_linked_bank_account',
  has_income_certificate: 'income_certificate',
  has_community_certificate: 'community_certificate',
  has_residence_certificate: 'residence_certificate',
  has_disability_certificate: 'disability_certificate',
  has_business_proof: 'business_proof',
  has_land_ownership_proof: 'land_ownership_proof',
  has_age_proof: 'age_proof',
  has_passport_photo: 'passport_photo',
};

const SPECIAL_STATUS_FIELDS: Record<string, string> = {
  is_pregnant_or_lactating: 'pregnant_or_lactating',
  is_widow_or_widower: 'widow_or_widower',
  has_chronic_illness_family: 'chronic_illness_family',
  is_pvtg: 'pvtg',
  is_orphan_destitute: 'orphan_destitute',
  is_migrant_worker: 'migrant_worker',
  is_armed_forces_family: 'armed_forces_family',
  is_fisherman: 'fisherman',
  is_weaver: 'weaver',
};

function csvNames(value: unknown) {
  return Array.from(new Set(String(value || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)));
}

async function replaceRows(table: string, userId: string, rows: Record<string, any>[]) {
  await appDb.from(table).delete().eq('user_id', userId);
  if (rows.length > 0) {
    const { error } = await appDb.from(table).insert(rows);
    if (error) throw error;
  }
}

export async function getAppUserByAuthId(authId: string) {
  const { data, error } = await appDb
    .from('users')
    .select('id, auth_id, username, profile_locked_until, registration_completed_at')
    .eq('auth_id', authId)
    .single();

  if (error) throw error;
  return data;
}

export async function getProfileByAuthId(authId: string) {
  const { data, error } = await appDb
    .from('user_registration_profiles')
    .select('*')
    .eq('auth_id', authId)
    .single();

  if (error) throw error;
  return data;
}

export async function saveProfileData(userId: string, data: Record<string, any>) {
  const { error: profileError } = await appDb.from('user_profiles').upsert({
    user_id: userId,
    full_name: data.full_name,
    age: Number(data.age),
    gender: data.gender,
    social_category: data.social_category,
    religion: data.religion,
    state_of_residence: data.state_of_residence || 'Tamil Nadu',
    marital_status: data.marital_status,
  });
  if (profileError) throw profileError;

  if (data.minority_status) {
    const { error } = await appDb.from('user_minority_details').upsert({
      user_id: userId,
      denomination: data.minority_denomination,
    });
    if (error) throw error;
  } else {
    const { error } = await appDb.from('user_minority_details').delete().eq('user_id', userId);
    if (error) throw error;
  }

  if (data.is_disabled) {
    const { error } = await appDb.from('user_disabilities').upsert({
      user_id: userId,
      disability_type: data.disability_type || null,
      disability_percent: Number(data.disability_percent || 0),
    });
    if (error) throw error;
  } else {
    const { error } = await appDb.from('user_disabilities').delete().eq('user_id', userId);
    if (error) throw error;
  }

  const { error: economicError } = await appDb.from('user_economic_profiles').upsert({
    user_id: userId,
    income_annual: Number(data.income_annual || 0),
    bpl_status: data.bpl_status,
    ration_card_type: data.ration_card_type,
    house_ownership: data.house_ownership,
    land_ownership: data.land_ownership,
    land_holding_acres: Number(data.land_holding_acres || 0),
    area_type: data.area_type,
  });
  if (economicError) throw economicError;

  await replaceRows(
    'user_existing_scheme_benefits',
    userId,
    data.existing_scheme_benefits
      ? csvNames(data.existing_scheme_names).map(scheme_name => ({ user_id: userId, scheme_name }))
      : []
  );

  const { error: educationError } = await appDb.from('user_education_profiles').upsert({
    user_id: userId,
    education_level: data.education_level,
    first_generation_graduate: !!data.first_generation_graduate,
    course_stream: data.course_stream || null,
  });
  if (educationError) throw educationError;

  const { error: occupationError } = await appDb.from('user_occupation_profiles').upsert({
    user_id: userId,
    employment_status: data.employment_status,
    occupation_sector: data.occupation_sector || null,
    registered_worker: !!data.registered_worker,
    worker_board_name: data.registered_worker ? data.worker_board_name : null,
    has_skill_certificate: !!data.has_skill_certificate,
  });
  if (occupationError) throw occupationError;

  const hasBusiness = data.business_ownership_status && data.business_ownership_status !== 'not_applicable';
  if (hasBusiness) {
    const { error } = await appDb.from('user_business_profiles').upsert({
      user_id: userId,
      has_msme_registration: !!data.has_msme_registration,
      business_ownership_status: data.business_ownership_status,
    });
    if (error) throw error;
  } else {
    const { error } = await appDb.from('user_business_profiles').delete().eq('user_id', userId);
    if (error) throw error;
  }

  const { error: householdError } = await appDb.from('user_household_profiles').upsert({
    user_id: userId,
    number_of_children: Number(data.number_of_children || data.children_below_18 || 0),
    number_of_girl_children: Number(data.number_of_girl_children || 0),
  });
  if (householdError) throw householdError;

  await replaceRows(
    'user_special_statuses',
    userId,
    Object.entries(SPECIAL_STATUS_FIELDS)
      .filter(([field]) => !!data[field])
      .map(([, status_code]) => ({ user_id: userId, status_code }))
  );

  await replaceRows(
    'user_document_possessions',
    userId,
    Object.entries(DOCUMENT_FIELDS)
      .filter(([field]) => !!data[field])
      .map(([, document_type]) => ({ user_id: userId, document_type }))
  );
}

export async function completeRegistration(userId: string, lockedUntil: string) {
  const { error } = await appDb
    .from('users')
    .update({
      registration_completed_at: new Date().toISOString(),
      profile_locked_until: lockedUntil,
    })
    .eq('id', userId);

  if (error) throw error;
}
