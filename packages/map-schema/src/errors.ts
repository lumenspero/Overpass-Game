import type { z } from 'zod';

/** Thrown when a map or save file does not match its schema. `issues` names each bad field. */
export class MapFormatError extends Error {
  readonly issues: string[];

  constructor(what: string, issues: string[]) {
    super(`${what} is invalid: ${issues.join('; ')}`);
    this.name = 'MapFormatError';
    this.issues = issues;
  }
}

export function parseWith<T>(
  schema: z.ZodType<T>,
  data: unknown,
  what: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map(
    (i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`,
  );
  throw new MapFormatError(what, issues);
}
