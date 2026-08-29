const objectIdPattern = /^[a-f\d]{24}$/i;

export function isValidObjectId(value: string): boolean {
  return objectIdPattern.test(value);
}
