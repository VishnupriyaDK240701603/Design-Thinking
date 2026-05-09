"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profilePatchSchema = exports.profileSchema = exports.profileBaseSchema = void 0;
exports.buildProfileData = buildProfileData;
const zod_1 = require("zod");
const optionalText = zod_1.z.string().trim().optional().nullable();
const requiredText = zod_1.z.string().trim().min(1);
const numberFromInput = (schema) => zod_1.z.preprocess((value) => {
    if (typeof value === 'string')
        return value.trim() === '' ? undefined : Number(value);
    return value;
}, schema);
const hasCourseField = (data) => data.employment_status === 'student' ||
    ['higher_secondary', 'diploma_iti', 'undergraduate', 'postgraduate', 'doctorate'].includes(data.education_level);
const hasBusinessFields = (data) => data.employment_status === 'self_employed' || data.occupation_sector === 'business';
const hasWorkerBoardFields = (data) => ['employed', 'self_employed'].includes(data.employment_status) &&
    ['labourer', 'construction', 'fisheries', 'weaving'].includes(data.occupation_sector);
exports.profileBaseSchema = zod_1.z.object({
    full_name: requiredText,
    age: numberFromInput(zod_1.z.number().int().min(0).max(120)),
    gender: zod_1.z.enum(['male', 'female', 'transgender', 'other']),
    social_category: zod_1.z.enum(['OC', 'BC', 'MBC', 'SC', 'ST']),
    religion: requiredText,
    minority_status: zod_1.z.boolean().default(false),
    minority_denomination: optionalText,
    state_of_residence: requiredText,
    marital_status: zod_1.z.enum(['single', 'married', 'widowed', 'divorced', 'separated']),
    is_disabled: zod_1.z.boolean().default(false),
    disability_type: optionalText,
    disability_percent: numberFromInput(zod_1.z.number().int().min(0).max(100)).default(0),
    income_annual: numberFromInput(zod_1.z.number().int().min(0)),
    bpl_status: zod_1.z.enum(['bpl', 'apl', 'unknown']),
    is_bpl: zod_1.z.boolean().optional(),
    ration_card_type: zod_1.z.enum(['PHH', 'NPHH', 'AAY', 'none']),
    has_ration_card: zod_1.z.boolean().optional(),
    house_ownership: zod_1.z.enum(['owned', 'rental', 'government', 'other']),
    land_ownership: zod_1.z.enum(['none', 'owned', 'leased', 'family']),
    land_holding_acres: numberFromInput(zod_1.z.number().min(0)).default(0),
    area_type: zod_1.z.enum(['rural', 'urban', 'semi_urban']),
    existing_scheme_benefits: zod_1.z.boolean().default(false),
    existing_scheme_names: optionalText,
    education_level: zod_1.z.enum(['none', 'primary', 'middle', 'high_school', 'higher_secondary', 'diploma_iti', 'undergraduate', 'postgraduate', 'doctorate']),
    first_generation_graduate: zod_1.z.boolean().default(false),
    course_stream: optionalText,
    employment_status: zod_1.z.enum(['student', 'employed', 'self_employed', 'unemployed', 'homemaker', 'retired']),
    occupation: optionalText,
    occupation_sector: optionalText,
    registered_worker: zod_1.z.boolean().default(false),
    worker_board_name: optionalText,
    has_skill_certificate: zod_1.z.boolean().default(false),
    has_msme_registration: zod_1.z.boolean().default(false),
    business_ownership_status: zod_1.z.enum(['not_applicable', 'sole_owner', 'partnership', 'family_business', 'women_owned']).default('not_applicable'),
    is_fisherman: zod_1.z.boolean().default(false),
    is_weaver: zod_1.z.boolean().default(false),
    is_armed_forces_family: zod_1.z.boolean().default(false),
    number_of_children: numberFromInput(zod_1.z.number().int().min(0).max(30)).default(0),
    children_below_18: numberFromInput(zod_1.z.number().int().min(0).max(30)).optional(),
    is_pregnant_or_lactating: zod_1.z.boolean().default(false),
    number_of_girl_children: numberFromInput(zod_1.z.number().int().min(0).max(30)).default(0),
    is_widow_or_widower: zod_1.z.boolean().default(false),
    is_widow_orphan_single_parent: zod_1.z.boolean().optional(),
    has_chronic_illness_family: zod_1.z.boolean().default(false),
    is_pvtg: zod_1.z.boolean().default(false),
    is_orphan_destitute: zod_1.z.boolean().default(false),
    is_migrant_worker: zod_1.z.boolean().default(false),
    has_aadhaar: zod_1.z.boolean().default(false),
    has_ration_card_document: zod_1.z.boolean().default(false),
    has_aadhaar_linked_bank_account: zod_1.z.boolean().default(false),
    has_jan_dhan_account: zod_1.z.boolean().optional(),
    has_income_certificate: zod_1.z.boolean().default(false),
    has_community_certificate: zod_1.z.boolean().default(false),
    has_residence_certificate: zod_1.z.boolean().default(false),
    has_disability_certificate: zod_1.z.boolean().default(false),
    has_business_proof: zod_1.z.boolean().default(false),
    has_land_ownership_proof: zod_1.z.boolean().default(false),
    has_age_proof: zod_1.z.boolean().default(false),
    has_passport_photo: zod_1.z.boolean().default(false),
});
exports.profileSchema = exports.profileBaseSchema.superRefine((data, ctx) => {
    if (data.minority_status && !data.minority_denomination) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['minority_denomination'], message: 'Minority / denomination is required' });
    }
    if (data.is_disabled && data.disability_percent <= 0) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['disability_percent'], message: 'Disability percentage is required' });
    }
    if (data.existing_scheme_benefits && !data.existing_scheme_names) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['existing_scheme_names'], message: 'Existing scheme names are required' });
    }
    if (hasCourseField(data) && !data.course_stream) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['course_stream'], message: 'Course / stream of study is required' });
    }
    if (['employed', 'self_employed'].includes(data.employment_status) && !data.occupation_sector) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['occupation_sector'], message: 'Occupation / sector is required' });
    }
    if (hasWorkerBoardFields(data) && data.registered_worker && !data.worker_board_name) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['worker_board_name'], message: 'Board / union name is required' });
    }
    if (hasBusinessFields(data) && data.business_ownership_status === 'not_applicable') {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['business_ownership_status'], message: 'Business ownership status is required' });
    }
    if (data.number_of_girl_children > data.number_of_children) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['number_of_girl_children'], message: 'Girl children cannot exceed total children' });
    }
});
function omitUndefined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}
function buildProfileData(data) {
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
exports.profilePatchSchema = exports.profileBaseSchema.partial().passthrough();
