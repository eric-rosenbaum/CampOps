/**
 * The forms the product fills in and hands to the camp.
 *
 * A requirement tagged with one of these is a document we produce, not a file the camp happens
 * to hold, and it needs a different story: prepare it here, file it with the county, then keep
 * the filed copy. The distinction matters because the generic "attach a document" path treats
 * any file as proof, and a workers' compensation certificate once turned DOH-367 green.
 */
export const GENERATED_FORMS = new Set(['DOH-367', 'DOH-367a', 'DOH-2040', 'DOH-2271', 'DOH-2286']);

/** The generated form this requirement is, if it is one. */
export function generatedFormFor(formCodes: string[]): string | null {
  return formCodes.find((c) => GENERATED_FORMS.has(c)) ?? null;
}
