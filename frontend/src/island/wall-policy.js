// Only metadata from a current island answer selects the preview rule; never layout.version.
export function wallPolicy(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const {wallRuleVersion = 0, wallCapacity = 12} = value;
  return (wallRuleVersion === 0 && wallCapacity === 12) || (wallRuleVersion === 1 && wallCapacity === 128)
    ? {wallRuleVersion, wallCapacity} : null;
}
