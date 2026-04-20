/**
 * Shared icon JSX for ImageResponse usage (next/og).
 * NOT a React component for the browser — only used server-side in route handlers / metadata routes.
 */

interface AppIconImageProps {
  size: number
  /** icon-to-container ratio, defaults to 0.56 */
  iconRatio?: number
  /** shadow under the container */
  shadow?: string
}

export function AppIconImage({
  size,
  iconRatio = 0.56,
  shadow,
}: AppIconImageProps) {
  const iconSize = Math.round(size * iconRatio)
  const radius = Math.round(size * 0.25)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'linear-gradient(135deg, #1a5fd6 0%, #2268c7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(shadow ? { boxShadow: shadow } : {}),
      }}
    >
      {/* IconRoute — Tabler Icons */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M12 19h4.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h3.5" />
      </svg>
    </div>
  )
}
