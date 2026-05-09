import { z } from 'zod';

const optionalText = z.string().trim().optional().nullable();
const requiredText = z.string().trim().min(1);
const numberFromInput = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value === 'string') return value.trim() === '' ? undefined : Number(value);
    return value;
  }, schema);

const hasCourseField = (data: any) =>
  data.employment_status === 'student' ||
  ['higher_secondary', 'diploma_iti', 'undergraduate', 'postgraduate', 'doctorate'].includes(data.education_level);

const hasBusinessFields = (data: any) =>
  data.employment_status === 'self_employed' || data.occupation_sector === 'business';

const hasWorkerBoardFields = (data: any) =>
  ['employed', 'self_employed'].includes(data.employment_status) &&
  ['labourer', 'construction', 'fisheries', 'weaving'].includes(data.occupation_sector);

export const profileBaseSchema = z.object({
  full_name: requiredText,
  age: numberFromInput(z.number().int().min(0).max(120)),
  gender: z.enum(['male', 'female', 'transgender', 'other']),
  social_category: z.enum(['OC', 'BC', 'MBC', 'SC', 'ST']),
  religion: requiredText,
  minority_status: z.boolean().default(false),
  minority_denomination: optionalText,
  state_of_residence: requiredText,
  marital_status: z.enum(['single', 'married', 'widowed', 'divorced', 'separated']),

  is_disabled: z.boolean().default(false),
  disability_type: optionalText,
  disability_percent: numberFromInput(z.number().int().min(0).max(100)).default(0),

  income_annual: numberFromInput(z.number().int().min(0)),
  bpl_status: z.enum(['bpl', 'apl', 'unknown']),
  is_bpl: z.boolean().optional(),
  ration_card_type: z.enum(['PHH', 'NPHH', 'AAY', 'none']),
  has_ration_card: z.boolean().optional(),
  house_ownership: z.enum(['owned', 'rental', 'government', 'other']),
  land_ownership: z.enum(['none', 'owned', 'leased', 'family']),
  land_holding_acres: numberFromInput(z.number().min(0)).default(0),
  area_type: z.enum(['rural', 'urban', 'semi_urban']),
  existing_scheme_benefits: z.boolean().default(false),
  existing_scheme_names: optionalText,

  education_level: z.enum(['none', 'primary', 'middle', 'high_school', 'higher_secondary', 'diploma_iti', 'undergraduate', 'postgraduate', 'doctorate']),
  first_generation_graduate: z.boolean().default(false),
  course_stream: optionalText,

  employment_status: z.enum(['student', 'employed', 'self_employed', 'unemployed', 'homemaker', 'retired']),
  occupation: optionalText,
  occupation_sector: optionalText,
  registered_worker: z.boolean().default(false),
  worker_board_name: optionalText,
  has_skill_certificate: z.boolean().default(false),
  has_msme_registration: z.boolean().default(false),
  business_ownership_status: z.enum(['not_applicable', 'sole_owner', 'partnership', 'family_business', 'women_owned']).default('not_applicable'),
  is_fisherman: z.boolean().default(false),
  is_weaver: z.boolean().default(false),
  is_armed_forces_family: z.boolean().default(false),

  number_of_children: numberFromInput(z.number().int().min(0).max(30)).default(0),
  children_below_18: numberFromInput(z.number().int().min(0).max(30)).optional(),
  is_pregnant_or_lactating: z.boolean().default(false),
  number_of_girl_children: numberFromInput(z.number().int().min(0).max(30)).default(0),
  is_widow_or_widower: z.boolean().default(false),
  is_widow_orphan_single_parent: z.boolean().optional(),
  has_chronic_illness_family: z.boolean().default(false),
  is_pvtg: z.boolean().default(false),
  is_orphan_destitute: z.boolean().default(false),
  is_migrant_worker: z.boolean().default(false),

  has_aadhaar: z.boolean().default(false),
  has_ration_card_document: z.boolean().default(false),
  has_aadhaar_linked_bank_account: z.boolean().default(false),
  has_jan_dhan_account: z.boolean().optional(),
  has_income_certificate: z.boolean().default(false),
  has_community_certificate: z.boolean().default(false),
  has_residence_certificate: z.boolean().default(false),
  has_disability_certificate: z.boolean().default(false),
  has_business_proof: z.boolean().default(false),
  has_land_ownership_proof: z.boolean().default(false),
  has_age_proof: z.boolean().default(false),
  has_passport_photo: z.boolean().default(false),
});

export const profileSchema = profileBaseSchema.superRefine((data, ctx) => {
  if (data.minority_status && !data.minority_denomination) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minority_denomination'], message: 'Minority / denomination is required' });
  }
  if (data.is_disabled && data.disability_percent <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['disability_percent'], message: 'Disability percentage is required' });
  }
  if (data.existing_scheme_benefits && !data.existing_scheme_names) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['existing_scheme_names'], message: 'Existing scheme names are required' });
  }
  if (hasCourseField(data) && !data.course_stream) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['course_stream'], message: 'Course / stream of study is required' });
  }
  if (['employed', 'self_employed'].includes(data.employment_status) && !data.occupation_sector) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['occupation_sector'], message: 'Occupation / sector is required' });
  }
  if (hasWorkerBoardFields(data) && data.registered_worker && !data.worker_board_name) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['worker_board_name'], message: 'Board / union name is required' });
  }
  if (hasBusinessFields(data) && data.business_ownership_status === 'not_applicable') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['business_ownership_status'], message: 'Business ownership status is required' });
  }
  if (data.number_of_girl_children > data.number_of_children) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['number_of_girl_children'], message: 'Girl children cannot exceed total children' });
  }
});

export type ProfileInput = z.infer<typeof profileSchema>;

function omitUndefined<T extends Record<string, any>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

export function buildProfileData(data: ProfileInput) {
  const occupation = data.occupation_sector || data.occupation || data.employment_status;
  const hasRationCard = data.ration_card_type !== 'none';
  const isWidowOrOrphan = data.marital_status === 'widowed' || data.is_widow_or_widower || data.is_orphan_destitute;

  return omitUndefined({
    ...data,
    is_bpl: data.bpl_status === 'bpl',
    has_ration_card: hasRationCard,
    occupation,
    occupation_sector: data.occupation_sector || null,
    land_holding_acres: data.land_ownership === 'none' ? 0 : data.land_holding_acres,
    children_below_18: data.children_below_18 ?? data.number_of_children,
    is_pregnant_or_lactating: data.gender === 'female' ? data.is_pregnant_or_lactating : false,
    is_widow_or_widower: data.marital_status === 'widowed' || data.is_widow_or_widower,
    is_widow_orphan_single_parent: isWidowOrOrphan,
    has_jan_dhan_account: data.has_aadhaar_linked_bank_account,
    has_ration_card_document: hasRationCard ? data.has_ration_card_document : false,
    has_disability_certificate: data.is_disabled ? data.has_disability_certificate : false,
    has_business_proof: hasBusinessFields(data) ? data.has_business_proof : false,
    has_land_ownership_proof: data.land_ownership !== 'none' ? data.has_land_ownership_proof : false,
    minority_denomination: data.minority_status ? data.minority_denomination : null,
    existing_scheme_names: data.existing_scheme_benefits ? data.existing_scheme_names : null,
    course_stream: hasCourseField(data) ? data.course_stream : null,
    worker_board_name: data.registered_worker ? data.worker_board_name : null,
    has_msme_registration: hasBusinessFields(data) ? data.has_msme_registration : false,
    business_ownership_status: hasBusinessFields(data) ? data.business_ownership_status : 'not_applicable',
    is_fisherman: data.occupation_sector === 'fisheries' ? data.is_fisherman : false,
    is_weaver: data.occupation_sector === 'weaving' ? data.is_weaver : false,
  });
}

export const profilePatchSchema = profileBaseSchema.partial().passthrough();
