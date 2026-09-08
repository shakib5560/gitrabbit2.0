import slugify from 'slugify';

export function createSlug(text: string): string {
  return slugify(text, {
    lower: true,
    strict: true,
    trim: true,
  });
}

export async function generateUniqueSlug(
  title: string,
  checkExists: (slug: string) => Promise<boolean>,
  customSlug?: string,
): Promise<string> {
  let baseSlug = customSlug ? createSlug(customSlug) : createSlug(title);
  if (!baseSlug) {
    baseSlug = `post-${Date.now()}`;
  }

  let candidateSlug = baseSlug;
  let counter = 1;

  while (await checkExists(candidateSlug)) {
    candidateSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return candidateSlug;
}
