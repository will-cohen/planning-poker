import React from 'react'

import { getAvatarById } from '../utils/avatars'

interface AvatarProps {
  avatarId: string
  name: string
  className?: string
}

/** Read-only avatar image, falling back to an initial for legacy/unknown icons. */
export default function Avatar({ avatarId, name, className = '' }: AvatarProps): React.ReactElement {
  const avatar = getAvatarById(avatarId)

  if (avatar) {
    return <img src={avatar.src} alt="" className={`object-cover ${className}`} />
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?'
  return <span className={`flex items-center justify-center font-black ${className}`}>{initial}</span>
}
