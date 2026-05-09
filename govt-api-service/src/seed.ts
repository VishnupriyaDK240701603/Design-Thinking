type SchemeSeed = {
  id: string;
  title_ta: string;
  title_en: string;
  description_ta: string;
  description_en: string;
  category: string;
  benefit_type: string;
  benefit_amount: number;
  benefit_unit: string;
  eligibility: Record<string, any>;
  documents_required: string[];
  application_steps: string[];
  application_url: string;
  launched_date: string | null;
  expiry_date: string | null;
  is_active: boolean;
  source: string;
  benefit_norm: number;
  urgency: number;
  recency: number;
};

function scheme(input: Omit<SchemeSeed, "description_ta" | "benefit_norm" | "urgency" | "recency">): SchemeSeed {
  return {
    ...input,
    description_ta: input.description_en,
    benefit_norm: Math.min(100, input.benefit_amount / 5000),
    urgency: input.expiry_date ? 80 : 30,
    recency: 60
  };
}

const VALIDATED_SCHEMES: SchemeSeed[] = [
  scheme({
    id: "11111111-1111-4111-8111-111111111111",
    title_ta: "PM-KISAN Tamil Nadu",
    title_en: "PM-KISAN Tamil Nadu",
    description_en: "Income support for landholding farmer families, paid by direct benefit transfer.",
    category: "agriculture",
    benefit_type: "cash_transfer",
    benefit_amount: 6000,
    benefit_unit: "per year",
    eligibility: { occupation: ["farmer"], land_holding_min_acres: 0.1, has_aadhaar: true },
    documents_required: ["Aadhaar Card", "Land Records", "Bank Passbook"],
    application_steps: ["Register on PM-KISAN portal", "Submit land and bank details", "Complete eKYC"],
    application_url: "https://pmkisan.gov.in/",
    launched_date: "2018-12-01",
    expiry_date: null,
    is_active: true,
    source: "https://pmkisan.gov.in/"
  }),
  scheme({
    id: "22222222-2222-4222-8222-222222222222",
    title_ta: "PMFBY Crop Insurance Tamil Nadu",
    title_en: "PMFBY Crop Insurance Tamil Nadu",
    description_en: "Crop insurance for notified crops against yield loss and specified risks.",
    category: "agriculture",
    benefit_type: "insurance",
    benefit_amount: 0,
    benefit_unit: "coverage varies",
    eligibility: { occupation: ["farmer"], land_holding_min_acres: 0.1 },
    documents_required: ["Land Records", "Bank Passbook", "Sowing Certificate"],
    application_steps: ["Apply through PMFBY portal/bank/CSC", "Choose notified crop and season", "Pay farmer premium"],
    application_url: "https://pmfby.gov.in/",
    launched_date: "2016-01-13",
    expiry_date: null,
    is_active: true,
    source: "https://pmfby.gov.in/"
  }),
  scheme({
    id: "33333333-3333-4333-8333-333333333333",
    title_ta: "Chief Minister Comprehensive Health Insurance Scheme",
    title_en: "Chief Minister Comprehensive Health Insurance Scheme",
    description_en: "Cashless treatment cover for eligible Tamil Nadu families in empanelled hospitals.",
    category: "health",
    benefit_type: "insurance",
    benefit_amount: 500000,
    benefit_unit: "per family per year",
    eligibility: { income_max: 120000 },
    documents_required: ["Family Card", "Aadhaar Card", "Income Certificate"],
    application_steps: ["Visit enrolment centre", "Submit family and income documents", "Complete biometric enrolment"],
    application_url: "https://www.cmchistn.com/",
    launched_date: "2009-07-23",
    expiry_date: null,
    is_active: true,
    source: "https://www.cmchistn.com/"
  }),
  scheme({
    id: "44444444-4444-4444-8444-444444444444",
    title_ta: "Pudhumai Penn Scholarship Scheme",
    title_en: "Pudhumai Penn Scholarship Scheme",
    description_en: "Monthly support for eligible girl students from government/government-aided schools pursuing higher education.",
    category: "education",
    benefit_type: "cash_transfer",
    benefit_amount: 1000,
    benefit_unit: "per month",
    eligibility: { gender: ["female"], min_age: 17, max_age: 30, education_level: ["higher_secondary", "diploma", "undergraduate"] },
    documents_required: ["Aadhaar Card", "School Certificate", "College Admission Proof", "Bank Passbook"],
    application_steps: ["Apply through Penkalvi portal", "Institution verifies student details", "Benefit paid by DBT"],
    application_url: "https://penkalvi.tn.gov.in/",
    launched_date: "2022-09-05",
    expiry_date: null,
    is_active: true,
    source: "https://penkalvi.tn.gov.in/"
  }),
  scheme({
    id: "55555555-5555-4555-8555-555555555555",
    title_ta: "Tamil Pudhalvan Scholarship for Boys",
    title_en: "Tamil Pudhalvan Scholarship for Boys",
    description_en: "Monthly support for eligible boys from government/government-aided schools pursuing higher education.",
    category: "education",
    benefit_type: "cash_transfer",
    benefit_amount: 1000,
    benefit_unit: "per month",
    eligibility: { gender: ["male"], min_age: 17, max_age: 30, education_level: ["higher_secondary", "diploma", "undergraduate"] },
    documents_required: ["Aadhaar Card", "School Certificate", "College Admission Proof", "Bank Passbook"],
    application_steps: ["Apply through institution/portal", "Institution verifies student details", "Benefit paid by DBT"],
    application_url: "https://www.tn.gov.in/",
    launched_date: "2024-08-09",
    expiry_date: null,
    is_active: true,
    source: "https://www.tn.gov.in/"
  }),
  scheme({
    id: "66666666-6666-4666-8666-666666666666",
    title_ta: "Naan Mudhalvan Skill Training Scheme",
    title_en: "Naan Mudhalvan Skill Training Scheme",
    description_en: "Tamil Nadu skill development initiative with courses, mentorship, internships, and placement support.",
    category: "employment",
    benefit_type: "training",
    benefit_amount: 0,
    benefit_unit: "service",
    eligibility: { min_age: 17, max_age: 35 },
    documents_required: ["Aadhaar Card", "Education Certificate"],
    application_steps: ["Register on Naan Mudhalvan portal", "Choose a course", "Complete training/certification"],
    application_url: "https://www.naanmudhalvan.tn.gov.in/",
    launched_date: "2022-03-01",
    expiry_date: null,
    is_active: true,
    source: "https://www.naanmudhalvan.tn.gov.in/"
  }),
  scheme({
    id: "77777777-7777-4777-8777-777777777777",
    title_ta: "Kalaignar Magalir Urimai Thogai",
    title_en: "Kalaignar Magalir Urimai Thogai",
    description_en: "Monthly entitlement amount for eligible women heads of families in Tamil Nadu.",
    category: "women_empowerment",
    benefit_type: "cash_transfer",
    benefit_amount: 1000,
    benefit_unit: "per month",
    eligibility: { gender: ["female"], min_age: 21, income_max: 250000, land_max_acres: 10, vehicle_ownership_exclude: ["4w"], excluded_occupations: ["government_employee"] },
    documents_required: ["Family Card", "Aadhaar Card", "Bank Passbook"],
    application_steps: ["Apply through official camp/e-Sevai route", "Verify family card and bank details", "Track status on KMUT portal"],
    application_url: "https://kmut.tn.gov.in/",
    launched_date: "2023-09-15",
    expiry_date: null,
    is_active: true,
    source: "https://kmut.tn.gov.in/"
  }),
  scheme({
    id: "88888888-8888-4888-8888-888888888888",
    title_ta: "Vidiyal Payanam Free Bus Travel for Women",
    title_en: "Vidiyal Payanam Free Bus Travel for Women",
    description_en: "Fare-free travel for women and transgender persons in eligible Tamil Nadu government ordinary buses.",
    category: "women_empowerment",
    benefit_type: "service",
    benefit_amount: 0,
    benefit_unit: "free travel",
    eligibility: { gender: ["female", "transgender"] },
    documents_required: ["No application required"],
    application_steps: ["Board eligible government ordinary bus", "Travel under the scheme"],
    application_url: "https://www.tn.gov.in/",
    launched_date: "2021-05-08",
    expiry_date: null,
    is_active: true,
    source: "https://www.tn.gov.in/"
  }),
  scheme({
    id: "99999999-9999-4999-8999-999999999999",
    title_ta: "Tamil Nadu Disability Pension Scheme",
    title_en: "Tamil Nadu Disability Pension Scheme",
    description_en: "Monthly pension for eligible differently abled persons in Tamil Nadu.",
    category: "disability",
    benefit_type: "pension",
    benefit_amount: 1500,
    benefit_unit: "per month",
    eligibility: { is_disabled_required: true, disability_percent_min: 40, min_age: 18 },
    documents_required: ["Disability Certificate", "Aadhaar Card", "Bank Passbook"],
    application_steps: ["Apply through e-Sevai/Revenue route", "Submit disability certificate", "Revenue department verifies eligibility"],
    application_url: "https://www.cra.tn.gov.in/about_schemes.php",
    launched_date: null,
    expiry_date: null,
    is_active: true,
    source: "https://www.cra.tn.gov.in/about_schemes.php"
  }),
  scheme({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title_ta: "Indira Gandhi National Old Age Pension Scheme",
    title_en: "Indira Gandhi National Old Age Pension Scheme",
    description_en: "Old age pension for eligible BPL destitute senior citizens.",
    category: "senior_citizens",
    benefit_type: "pension",
    benefit_amount: 1200,
    benefit_unit: "per month",
    eligibility: { is_bpl_required: true, min_age: 60 },
    documents_required: ["Aadhaar Card", "Age Proof", "BPL/Family Card", "Bank Passbook"],
    application_steps: ["Apply through e-Sevai", "Revenue verification", "Pension sanction and DBT"],
    application_url: "https://www.cra.tn.gov.in/eleg_schemes.php",
    launched_date: null,
    expiry_date: null,
    is_active: true,
    source: "https://www.cra.tn.gov.in/eleg_schemes.php"
  }),
  scheme({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title_ta: "MGNREGS Tamil Nadu",
    title_en: "MGNREGS Tamil Nadu",
    description_en: "Rural wage employment guarantee for adult members willing to do unskilled manual work.",
    category: "employment",
    benefit_type: "wage_employment",
    benefit_amount: 0,
    benefit_unit: "wage as notified",
    eligibility: { area_type: ["rural"], min_age: 18, occupation: ["labourer", "unemployed", "farmer"] },
    documents_required: ["Aadhaar Card", "Family Card", "Bank Passbook"],
    application_steps: ["Apply for job card through local body", "Request work", "Attend allocated work"],
    application_url: "https://nrega.nic.in/",
    launched_date: "2006-02-02",
    expiry_date: null,
    is_active: true,
    source: "https://nrega.nic.in/"
  }),
  scheme({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    title_ta: "PMAY Gramin Tamil Nadu",
    title_en: "PMAY Gramin Tamil Nadu",
    description_en: "Rural housing support for eligible households without a pucca house.",
    category: "housing",
    benefit_type: "housing_assistance",
    benefit_amount: 120000,
    benefit_unit: "assistance varies",
    eligibility: { area_type: ["rural"], income_max: 300000, house_ownership: ["rental", "other"] },
    documents_required: ["Aadhaar Card", "Family Card", "Bank Passbook", "Housing Status Proof"],
    application_steps: ["Verify eligibility with local body", "Geo-tag and approve house", "Receive instalments by DBT"],
    application_url: "https://pmayg.nic.in/",
    launched_date: "2016-04-01",
    expiry_date: null,
    is_active: true,
    source: "https://pmayg.nic.in/"
  })
];

export function generateAllSchemes() {
  return VALIDATED_SCHEMES;
}
