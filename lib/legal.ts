// Every fact the Privacy Policy, Terms and Support pages depend on lives
// here, so the pages themselves never need editing to go live. Values marked
// PLACEHOLDER still need a real answer -- while any remain, those pages show
// a "Draft" banner (see LegalPage) so nobody mistakes them for final.
//
// Both app stores require a working privacy policy URL and support URL
// before an app can be submitted.

export const PLACEHOLDER = "__PLACEHOLDER__";

export const LEGAL = {
  appName: "PokePnL",

  // Who runs the app, as it should appear in the policy. For a developer
  // under 18 this is usually the parent/guardian who holds the App Store
  // account, e.g. "Jane Doe".
  operatorName: PLACEHOLDER,

  // Public inbox for support, privacy and deletion requests. Apple and
  // Google both show this to users. A dedicated address is better than a
  // personal one.
  contactEmail: PLACEHOLDER,

  // Where the servers and database physically run.
  dataLocation: "the United States",

  // US state whose law governs the Terms (usually where the operator lives).
  governingLaw: PLACEHOLDER,

  // Bump whenever the text of either policy meaningfully changes.
  effectiveDate: "September 27, 2026",

  // COPPA: services that knowingly collect data from children under 13 need
  // verified parental consent, so the app is 13+.
  minimumAge: 13,
} as const;

export const LEGAL_PLACEHOLDERS_REMAINING = Object.entries(LEGAL)
  .filter(([, v]) => v === PLACEHOLDER)
  .map(([k]) => k);

// Renders a placeholder as visible bracketed text instead of the sentinel,
// so a draft page still reads sensibly.
export function legalValue(key: "operatorName" | "contactEmail" | "governingLaw"): string {
  const v = LEGAL[key];
  if (v !== PLACEHOLDER) return v;
  return { operatorName: "[operator name]", contactEmail: "[contact email]", governingLaw: "[state]" }[key];
}

export const TRADEMARK_DISCLAIMER =
  "PokePnL is an independent fan project and is not affiliated with, endorsed by, or sponsored by Nintendo, Creatures Inc., GAME FREAK inc., or The Pokémon Company. Pokémon and all related names and images are trademarks of their respective owners.";
