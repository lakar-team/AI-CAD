/**
 * Units utilities for display and VCB input parsing.
 * All internal values are in meters; these helpers convert to/from display units.
 */

// Meters per display unit (factor = displayUnits / meter)
export const UNIT_DEFS = {
  mm: { factor: 1000,              label: 'mm', precision: 1 },
  cm: { factor: 100,               label: 'cm', precision: 2 },
  m:  { factor: 1,                 label: 'm',  precision: 3 },
  ft: { factor: 1 / 0.3048,       label: 'ft', precision: 3 },
  in: { factor: 1 / 0.0254,       label: 'in', precision: 2 },
};

export const UNIT_KEYS = ['mm', 'cm', 'm', 'ft', 'in'];

/** Format meters into a display string for the given unit. */
export function formatLength(meters, unit = 'm') {
  const def = UNIT_DEFS[unit] || UNIT_DEFS.m;
  return `${(meters * def.factor).toFixed(def.precision)} ${def.label}`;
}

/**
 * Parse a user-typed string into meters.
 * Accepts: plain numbers (→ defaultUnit), "100mm", "25cm", "1.5m",
 *          "4.921ft" / "4'", "5'6\"", "59in" / "59\"".
 * Returns NaN on failure.
 */
export function parseLength(text, defaultUnit = 'm') {
  if (!text && text !== 0) return NaN;
  const s = String(text).trim().replace(',', '.');

  // ft-in compound: 5'6" or 5' 6.5"
  const ftIn = s.match(/^(-?[\d.]+)'\s*([\d.]+)"?$/);
  if (ftIn) {
    const ft = parseFloat(ftIn[1]);
    const inch = parseFloat(ftIn[2]);
    return (Math.abs(ft) * 12 + inch) * 0.0254 * Math.sign(ft || 1);
  }

  // Try suffix-keyed units
  if (/mm$/i.test(s)) return parseFloat(s) * 0.001;
  if (/cm$/i.test(s)) return parseFloat(s) * 0.01;
  if (/(?<![mc])m$/i.test(s)) return parseFloat(s);            // "m" but not "mm"/"cm"
  if (/ft$|'$/i.test(s)) return parseFloat(s) * 0.3048;
  if (/in$|"$/i.test(s)) return parseFloat(s) * 0.0254;

  // Plain number → defaultUnit
  const v = parseFloat(s);
  if (!isFinite(v)) return NaN;
  const def = UNIT_DEFS[defaultUnit] || UNIT_DEFS.m;
  return v / def.factor;
}
