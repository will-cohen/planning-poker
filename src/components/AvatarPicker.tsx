import React, { useEffect, useId, useRef, useState } from 'react'

import { AVATAR_OPTIONS, getAvatarById } from '../utils/avatars'

interface AvatarPickerProps {
  value: string
  onChange: (avatarId: string) => void
  name: string
  size?: 'compact' | 'seat' | 'profile'
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<AvatarPickerProps['size']>, string> = {
  compact: 'h-7 w-7',
  seat: 'h-14 w-14',
  profile: 'h-16 w-16',
}

/** Clickable avatar button that opens a grid of `src/people` SVGs to choose from. */
export default function AvatarPicker({ value, onChange, name, size = 'profile', className = '' }: AvatarPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = getAvatarById(value)
  const popoverId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`Change avatar for ${name || 'yourself'}`}
        title="Click to change avatar"
        className={`group relative rounded-full border-2 border-slate-300 bg-white overflow-hidden flex items-center justify-center shadow hover:border-primary transition-colors ${SIZE_CLASSES[size]} ${className}`}
      >
        {selected ? (
          <img src={selected.src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-lg font-black text-slate-400">{(name.trim().charAt(0) || '?').toUpperCase()}</span>
        )}
        {size !== 'compact' ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
            Change
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Choose an avatar"
          className="absolute z-40 mt-2 w-64 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl grid grid-cols-5 gap-2"
        >
          {AVATAR_OPTIONS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => {
                onChange(avatar.id)
                setOpen(false)
              }}
              aria-label={`Use ${avatar.label} avatar`}
              aria-pressed={avatar.id === value}
              className={`h-10 w-10 rounded-full border-2 overflow-hidden transition-colors ${avatar.id === value ? 'border-primary ring-2 ring-primary/40' : 'border-slate-200 hover:border-slate-400'}`}
            >
              <img src={avatar.src} alt={avatar.label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
