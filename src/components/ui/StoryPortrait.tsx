import { useEffect, useState, type ReactNode } from 'react'

interface Props {
  name: string
  src: string | null | undefined
  className: string
  fallback: ReactNode
  muted?: boolean
}

/** Square story-character portrait with an honest local fallback. */
export default function StoryPortrait({ name, src, className, fallback, muted = false }: Props) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [src])

  return (
    <div
      className={[
        'relative grid flex-shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--t-line-soft)] bg-[var(--t-surface)]',
        muted ? 'opacity-60 saturate-50' : '',
        className,
      ].join(' ')}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`${name} portrait`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : fallback}
    </div>
  )
}
