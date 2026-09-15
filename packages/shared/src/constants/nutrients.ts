type Micronutrient = {
  label: string;
  unit: string;
  // Adult reference daily value, used by the micronutrient report.
  // Source: US FDA Daily Values for adults and children 4+ years.
  // null where no official value exists.
  dailyValue: number | null;
};

export const MICRONUTRIENTS = {
  vitamin_a_mcg: { label: 'Vitamin A', unit: 'mcg', dailyValue: 900 },
  vitamin_c_mg: { label: 'Vitamin C', unit: 'mg', dailyValue: 90 },
  vitamin_d_mcg: { label: 'Vitamin D', unit: 'mcg', dailyValue: 20 },
  vitamin_e_mg: { label: 'Vitamin E', unit: 'mg', dailyValue: 15 },
  vitamin_k_mcg: { label: 'Vitamin K', unit: 'mcg', dailyValue: 120 },
  thiamin_mg: { label: 'Thiamin (B1)', unit: 'mg', dailyValue: 1.2 },
  riboflavin_mg: { label: 'Riboflavin (B2)', unit: 'mg', dailyValue: 1.3 },
  niacin_mg: { label: 'Niacin (B3)', unit: 'mg', dailyValue: 16 },
  vitamin_b6_mg: { label: 'Vitamin B6', unit: 'mg', dailyValue: 1.7 },
  folate_mcg: { label: 'Folate', unit: 'mcg', dailyValue: 400 },
  vitamin_b12_mcg: { label: 'Vitamin B12', unit: 'mcg', dailyValue: 2.4 },
  calcium_mg: { label: 'Calcium', unit: 'mg', dailyValue: 1300 },
  iron_mg: { label: 'Iron', unit: 'mg', dailyValue: 18 },
  magnesium_mg: { label: 'Magnesium', unit: 'mg', dailyValue: 420 },
  phosphorus_mg: { label: 'Phosphorus', unit: 'mg', dailyValue: 1250 },
  potassium_mg: { label: 'Potassium', unit: 'mg', dailyValue: 4700 },
  sodium_mg: { label: 'Sodium', unit: 'mg', dailyValue: 2300 },
  zinc_mg: { label: 'Zinc', unit: 'mg', dailyValue: 11 },
  copper_mg: { label: 'Copper', unit: 'mg', dailyValue: 0.9 },
  selenium_mcg: { label: 'Selenium', unit: 'mcg', dailyValue: 55 },
  fiber_g: { label: 'Fiber', unit: 'g', dailyValue: 28 },
  sugar_g: { label: 'Sugars', unit: 'g', dailyValue: 50 },
  saturated_fat_g: { label: 'Saturated fat', unit: 'g', dailyValue: 20 },
  trans_fat_g: { label: 'Trans fat', unit: 'g', dailyValue: null },
  cholesterol_mg: { label: 'Cholesterol', unit: 'mg', dailyValue: 300 },
} as const satisfies Record<string, Micronutrient>;

export type MicronutrientKey = keyof typeof MICRONUTRIENTS;

export const MICRONUTRIENT_KEYS = Object.keys(MICRONUTRIENTS) as MicronutrientKey[];
