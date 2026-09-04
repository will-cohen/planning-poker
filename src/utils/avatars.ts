/**
 * Avatar catalogue built from the SVG character illustrations in `src/people`.
 */

// Keys are the source file paths; values are the bundled asset URLs.
const avatarModules = import.meta.glob('../people/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export interface AvatarOption {
  id: string
  label: string
  src: string
}

function toLabel(id: string): string {
  return id.replace(/\b\w/g, (char) => char.toUpperCase())
}

export const AVATAR_OPTIONS: AvatarOption[] = Object.entries(avatarModules)
  .map(([path, src]) => {
    const fileName = path.split('/').pop() ?? path
    const id = fileName.replace(/\.svg$/i, '')
    return { id, label: toLabel(id), src }
  })
  .sort((a, b) => a.label.localeCompare(b.label))

const avatarsById = new Map(AVATAR_OPTIONS.map((avatar) => [avatar.id, avatar]))

/** Look up an avatar option by id. Returns undefined for unknown/legacy values. */
export function getAvatarById(id: string | undefined): AvatarOption | undefined {
  return id ? avatarsById.get(id) : undefined
}

/** Pick a random avatar id, used as the default before a user chooses one. */
export function getRandomAvatarId(): string {
  if (AVATAR_OPTIONS.length === 0) {
    return ''
  }

  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)].id
}
