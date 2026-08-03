import { useState } from 'react'

/** Image that degrades to a clean branded placeholder if the asset is missing
 *  or fails to load — keeps the UI intact with no broken-image icons. */
export function SmartImage({
  src,
  alt,
  label,
  className = '',
}: {
  src?: string
  alt?: string
  label?: string
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  if (!src || errored) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden bg-gradient-to-br from-brand-light to-white ${className}`}
      >
        <span className="line-clamp-2 px-2 text-center text-xs font-bold uppercase tracking-wide text-brand/70">
          {label ?? alt ?? ''}
        </span>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  )
}
