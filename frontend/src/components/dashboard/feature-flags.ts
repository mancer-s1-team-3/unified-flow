export const FEATURE_FLAGS = {
  csvBulkCreate: true,
  csvBulkEdit: true,
  unlockMilestone: true,
  editMilestone: true,
  editLinear: true,
  editCliff: true,
} as const;

export function isWipFeature(flag: keyof typeof FEATURE_FLAGS) {
  return FEATURE_FLAGS[flag];
}

