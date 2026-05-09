export type UserProfile = {
  age?: number | null;
  dob?: string | null;
  gender?: string | null;
  social_category?: string | null;
  income_annual?: number | null;
  occupation?: string | null;
  employment_status?: string | null;
  education_level?: string | null;
  area_type?: string | null;
  is_bpl?: boolean | null;
  ration_card_type?: string | null;
  is_disabled?: boolean | null;
  disability_type?: string | null;
  disability_percent?: number | null;
  disability_percentage?: number | null;
  land_holding_acres?: number | null;
  house_ownership?: string | null;
  vehicle_ownership?: string | null;
  is_widow?: boolean | null;
  is_widow_orphan_single_parent?: boolean | null;
  is_armed_forces_family?: boolean | null;
  is_hiv_affected?: boolean | null;
  is_migrant?: boolean | null;
  is_migrant_worker?: boolean | null;
  is_fisherman?: boolean | null;
  is_weaver?: boolean | null;
  is_pvtg?: boolean | null;
  is_orphan_destitute?: boolean | null;
  has_chronic_illness_family?: boolean | null;
  covid_affected?: boolean | null;
  is_covid_affected?: boolean | null;
  has_aadhaar?: boolean | null;
  has_jan_dhan?: boolean | null;
  has_jan_dhan_account?: boolean | null;
  has_voter_id?: boolean | null;
  electricity_units_month?: number | null;
};

export type SchemeEligibilityCriteria = {
  min_age?: number | null;
  max_age?: number | null;
  gender?: string[] | null;
  social_category?: string[] | null;
  income_max?: number | null;
  occupation?: string[] | null;
  education_level?: string[] | null;
  employment_status?: string[] | null;
  area_type?: string[] | null;
  is_bpl_required?: boolean | null;
  ration_card_type?: string[] | null;
  is_disabled_required?: boolean | null;
  is_disabled?: boolean | null;
  disability_type?: string[] | null;
  disability_percent_min?: number | null;
  land_min_acres?: number | null;
  land_holding_min_acres?: number | null;
  land_max_acres?: number | null;
  house_ownership?: string[] | null;
  vehicle_ownership_exclude?: string[] | null;
  excluded_occupations?: string[] | null;
  electricity_units_annual_max?: number | null;
  special_status_required?: string[] | null;
  possession_required?: string[] | null;
  has_aadhaar?: boolean | null;
  has_jan_dhan?: boolean | null;
  has_voter_id?: boolean | null;
};

export type EligibilityResult = {
  score: number;
  is_fully_eligible: boolean;
  is_partially_eligible: boolean;
  reason_ta: string;
};

function calculateAge(dobStr: string | null | undefined): number {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  const diff = Date.now() - dob.getTime();
  const age = new Date(diff).getUTCFullYear() - 1970;
  return age >= 0 ? age : 0;
}

function getProfileAge(profile: UserProfile): number {
  if (profile.age != null && profile.age >= 0) return profile.age;
  return calculateAge(profile.dob);
}

function normalizeValue(value: string | null | undefined, map: Record<string, string>): string | null {
  if (!value) return null;
  return map[value] || value;
}

function normalizeProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    gender: normalizeValue(profile.gender, {
      "ஆண்": "male",
      "பெண்": "female",
      "மற்றவை": "transgender"
    }),
    area_type: normalizeValue(profile.area_type, {
      "கிராமம்": "rural",
      "நகரம்": "urban",
      "நகர்ப்புறம்": "semi_urban"
    }),
    occupation: normalizeValue(profile.occupation, {
      "விவசாயி": "farmer",
      "தொழிலாளி": "labourer",
      "அரசு ஊழியர்": "government_employee",
      "தனியார் ஊழியர்": "private_employee",
      "வணிகர்": "business",
      "வேலையில்லாதவர்": "unemployed",
      "மற்றவை": "other"
    }),
    house_ownership: normalizeValue(profile.house_ownership, {
      "சொந்தம்": "owned",
      "வாடகை": "rental",
      "வேறு": "other",
      "ownership": "owned",
      "rented": "rental"
    }),
    vehicle_ownership: normalizeValue(profile.vehicle_ownership, {
      "2 சக்கரம்": "2w",
      "4 சக்கரம்": "4w",
      "இல்லை": "none"
    }),
    disability_percentage: profile.disability_percentage ?? profile.disability_percent ?? null,
    has_jan_dhan: profile.has_jan_dhan ?? profile.has_jan_dhan_account ?? null,
    is_widow: profile.is_widow ?? profile.is_widow_orphan_single_parent ?? null,
    is_migrant: profile.is_migrant ?? profile.is_migrant_worker ?? null,
    covid_affected: profile.covid_affected ?? profile.is_covid_affected ?? null
  };
}

function hasRules(criteria: SchemeEligibilityCriteria): boolean {
  return Object.values(criteria || {}).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value === false) return false;
    return value !== null && value !== undefined;
  });
}

function normalizeCriteria(criteria: SchemeEligibilityCriteria): SchemeEligibilityCriteria {
  const normalized = { ...(criteria || {}) };
  if (normalized.is_disabled === true && normalized.is_disabled_required == null) {
    normalized.is_disabled_required = true;
  }
  if ((normalized as any).is_migrant_worker === true) {
    normalized.special_status_required = Array.from(new Set([...(normalized.special_status_required || []), "migrant", "migrant_worker"]));
  }
  if (normalized.land_holding_min_acres != null && normalized.land_min_acres == null) {
    normalized.land_min_acres = normalized.land_holding_min_acres;
  }
  if ((normalized as any).is_bpl === true && normalized.is_bpl_required == null) {
    normalized.is_bpl_required = true;
  }

  const possession = new Set(normalized.possession_required || []);
  if (normalized.has_aadhaar === true) possession.add("aadhaar");
  if (normalized.has_jan_dhan === true) possession.add("jan_dhan");
  if (normalized.has_voter_id === true) possession.add("voter_id");
  if (possession.size > 0) normalized.possession_required = Array.from(possession);

  return normalized;
}

function capScore(score: number, cap: number) {
  return Math.min(score, cap);
}

export function scoreScheme(
  rawProfile: UserProfile,
  rawCriteria: SchemeEligibilityCriteria
): EligibilityResult {
  const profile = normalizeProfile(rawProfile);
  const criteria = normalizeCriteria(rawCriteria);
  if (!hasRules(criteria)) {
    return {
      score: 0,
      is_fully_eligible: false,
      is_partially_eligible: false,
      reason_ta: "இந்த திட்டத்திற்கான தகுதி விதிகள் தரவுத்தளத்தில் இல்லை. சரிபார்த்த பிறகு மட்டும் பரிந்துரைக்கப்படும்."
    };
  }

  let score = 0;
  let hardMismatch = false;
  let missingRequired = false;
  const mismatchReasons: string[] = [];

  // 1. age_match: 15 points
  if (criteria.min_age == null && criteria.max_age == null) {
    score += 15;
  } else {
    const age = getProfileAge(profile);
    if (age > 0) {
      let ageValid = true;
      if (criteria.min_age != null && age < criteria.min_age) ageValid = false;
      if (criteria.max_age != null && age > criteria.max_age) ageValid = false;
      if (ageValid) score += 15;
      else {
        hardMismatch = true;
        mismatchReasons.push("வயது பொருந்தவில்லை");
      }
    } else {
      missingRequired = true;
      mismatchReasons.push("வயது தகவல் தேவை");
    }
  }

  // 2. gender_match: 8 points
  if (!criteria.gender || criteria.gender.length === 0) {
    score += 8;
  } else if (profile.gender && criteria.gender.includes(profile.gender)) {
    score += 8;
  } else {
    hardMismatch = true;
    mismatchReasons.push("பாலினம் பொருந்தவில்லை");
  }

  // 3. social_category: 12 points
  if (!criteria.social_category || criteria.social_category.length === 0) {
    score += 12;
  } else if (profile.social_category && criteria.social_category.includes(profile.social_category)) {
    score += 12;
  } else {
    hardMismatch = true;
    mismatchReasons.push("சமூகப் பிரிவு பொருந்தவில்லை");
  }

  // 4. income_threshold: 15 points
  if (criteria.income_max == null) {
    score += 15;
  } else if (profile.income_annual != null && profile.income_annual <= criteria.income_max) {
    score += 15;
  } else if (profile.income_annual == null) {
    missingRequired = true;
    mismatchReasons.push("வருமான தகவல் தேவை");
  } else {
    hardMismatch = true;
    mismatchReasons.push("வருமான வரம்பை மீறுகிறது");
  }

  // 5. occupation_match: 10 points
  if (!criteria.occupation || criteria.occupation.length === 0) {
    score += 10;
  } else if (profile.occupation && criteria.occupation.includes(profile.occupation)) {
    score += 10;
  } else {
    hardMismatch = true;
    mismatchReasons.push("தொழில் பொருந்தவில்லை");
  }

  if (criteria.excluded_occupations?.length && profile.occupation && criteria.excluded_occupations.includes(profile.occupation)) {
    hardMismatch = true;
    mismatchReasons.push("இந்த தொழில் பிரிவு விலக்கப்பட்டுள்ளது");
  }

  // 6. education_match: 5 points
  if (!criteria.education_level || criteria.education_level.length === 0) {
    score += 5;
  } else if (profile.education_level && criteria.education_level.includes(profile.education_level)) {
    score += 5;
  } else {
    hardMismatch = true;
    mismatchReasons.push("கல்வித் தகுதி பொருந்தவில்லை");
  }

  if (criteria.employment_status && criteria.employment_status.length > 0) {
    if (!profile.employment_status || !criteria.employment_status.includes(profile.employment_status)) {
      hardMismatch = true;
      mismatchReasons.push("வேலை நிலை பொருந்தவில்லை");
    }
  }

  // 7. area_type_match: 5 points
  if (!criteria.area_type || criteria.area_type.length === 0) {
    score += 5;
  } else if (profile.area_type && criteria.area_type.includes(profile.area_type)) {
    score += 5;
  } else {
    hardMismatch = true;
    mismatchReasons.push("பகுதி வகை பொருந்தவில்லை");
  }

  // 8. bpl_ration_match: 8 points
  if (criteria.is_bpl_required == null && (!criteria.ration_card_type || criteria.ration_card_type.length === 0)) {
    score += 8;
  } else {
    let bplMatch = true;
    if (criteria.is_bpl_required === true && profile.is_bpl !== true) bplMatch = false;
    if (criteria.ration_card_type && criteria.ration_card_type.length > 0) {
      if (!profile.ration_card_type || !criteria.ration_card_type.includes(profile.ration_card_type)) {
        bplMatch = false;
      }
    }
    if (bplMatch) score += 8;
    else {
      hardMismatch = true;
      mismatchReasons.push("BPL/ரேஷன் அட்டை நிபந்தனை பொருந்தவில்லை");
    }
  }

  // 9. disability_match: 5 points
  if (criteria.is_disabled_required == null && criteria.disability_percent_min == null) {
    score += 5;
  } else {
    let disabilityMatch = true;
    if (criteria.is_disabled_required === true && profile.is_disabled !== true) disabilityMatch = false;
    if (criteria.disability_percent_min != null) {
      if (profile.disability_percentage == null || profile.disability_percentage < criteria.disability_percent_min) {
        disabilityMatch = false;
      }
    }
    if (criteria.disability_type && criteria.disability_type.length > 0) {
      if (!profile.disability_type || !criteria.disability_type.includes(profile.disability_type)) {
        disabilityMatch = false;
      }
    }
    if (disabilityMatch) score += 5;
    else {
      hardMismatch = true;
      mismatchReasons.push("மாற்றுத்திறன் நிபந்தனை பொருந்தவில்லை");
    }
  }

  // 10. land_match: 4 points
  if (criteria.land_min_acres == null && criteria.land_max_acres == null) {
    score += 4;
  } else {
    const land = profile.land_holding_acres;
    let landMatch = land != null;
    if (landMatch && criteria.land_min_acres != null && land! < criteria.land_min_acres) landMatch = false;
    if (landMatch && criteria.land_max_acres != null && land! > criteria.land_max_acres) landMatch = false;
    if (landMatch) score += 4;
    else {
      hardMismatch = true;
      mismatchReasons.push("நில அளவு நிபந்தனை பொருந்தவில்லை");
    }
  }

  // 11. house_match: 3 points
  if (!criteria.house_ownership || criteria.house_ownership.length === 0) {
    score += 3;
  } else if (profile.house_ownership && criteria.house_ownership.includes(profile.house_ownership)) {
    score += 3;
  } else {
    hardMismatch = true;
    mismatchReasons.push("வீட்டு நிலை பொருந்தவில்லை");
  }

  if (criteria.vehicle_ownership_exclude?.length && profile.vehicle_ownership && criteria.vehicle_ownership_exclude.includes(profile.vehicle_ownership)) {
    hardMismatch = true;
    mismatchReasons.push("வாகன நிபந்தனை பொருந்தவில்லை");
  }

  if (criteria.electricity_units_annual_max != null && profile.electricity_units_month != null) {
    if (profile.electricity_units_month * 12 > criteria.electricity_units_annual_max) {
      hardMismatch = true;
      mismatchReasons.push("மின்சார பயன்பாட்டு வரம்பை மீறுகிறது");
    }
  }

  // 12. special_status: 7 points
  if (!criteria.special_status_required || criteria.special_status_required.length === 0) {
    score += 7;
  } else {
    let specialMatch = false;
    if (criteria.special_status_required.includes("widow") && profile.is_widow) specialMatch = true;
    if (criteria.special_status_required.includes("armed_forces") && profile.is_armed_forces_family) specialMatch = true;
    if (criteria.special_status_required.includes("hiv_affected") && profile.is_hiv_affected) specialMatch = true;
    if ((criteria.special_status_required.includes("migrant") || criteria.special_status_required.includes("migrant_worker")) && profile.is_migrant) specialMatch = true;
    if (criteria.special_status_required.includes("fisherman") && profile.is_fisherman) specialMatch = true;
    if (criteria.special_status_required.includes("weaver") && profile.is_weaver) specialMatch = true;
    if (criteria.special_status_required.includes("pvtg") && profile.is_pvtg) specialMatch = true;
    if (criteria.special_status_required.includes("orphan_destitute") && profile.is_orphan_destitute) specialMatch = true;
    if (criteria.special_status_required.includes("chronic_illness_family") && profile.has_chronic_illness_family) specialMatch = true;
    if (criteria.special_status_required.includes("covid_affected") && profile.covid_affected) specialMatch = true;
    if (specialMatch) score += 7;
    else {
      hardMismatch = true;
      mismatchReasons.push("சிறப்பு நிலை நிபந்தனை பொருந்தவில்லை");
    }
  }

  // 13. possession_flags: 3 points
  if (!criteria.possession_required || criteria.possession_required.length === 0) {
    score += 3;
  } else {
    let possessionMatch = true;
    if (criteria.possession_required.includes("aadhaar") && !profile.has_aadhaar) possessionMatch = false;
    if ((criteria.possession_required.includes("jan_dhan") || criteria.possession_required.includes("aadhaar_linked_bank_account")) && !profile.has_jan_dhan) possessionMatch = false;
    if (criteria.possession_required.includes("voter_id") && !profile.has_voter_id) possessionMatch = false;
    if (possessionMatch) score += 3;
    else {
      missingRequired = true;
      mismatchReasons.push("தேவையான ஆவணம் இல்லை");
    }
  }

  if (hardMismatch) score = capScore(score, 49);
  else if (missingRequired) score = capScore(score, 64);

  const is_fully_eligible = score >= 90;
  const is_partially_eligible = score >= 65;

  const socialStr = profile.social_category || "பொது";
  const incomeStr = profile.income_annual != null ? profile.income_annual.toString() : "தெரியவில்லை";
  const occStr = profile.occupation || "வேலைவாய்ப்பற்றோர்";

  const reason_ta = mismatchReasons.length > 0
    ? `பொருந்தாத காரணங்கள்: ${mismatchReasons.slice(0, 3).join(", ")}.`
    : `நீங்கள் ${socialStr} பிரிவைச் சேர்ந்தவர், ஆண்டு வருமானம் ₹${incomeStr} மற்றும் ${occStr} என்பதால் தகுதியானவர்.`;

  return {
    score,
    is_fully_eligible,
    is_partially_eligible,
    reason_ta
  };
}
