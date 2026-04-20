import { IconRoute } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

type AppIconSize = 'sm' | 'md' | 'lg'

interface AppIconProps {
  size?: AppIconSize
  pulse?: boolean
  className?: string
}

const sizeConfig: Record<
  AppIconSize,
  { container: string; icon: string; rounded: string }
> = {
  sm: {
    container: 'h-10 w-10',
    icon: 'h-5 w-5',
    rounded: 'rounded-lg',
  },
  md: {
    container: 'h-14 w-14',
    icon: 'h-7 w-7',
    rounded: 'rounded-2xl',
  },
  lg: {
    container: 'h-16 w-16',
    icon: 'h-8 w-8',
    rounded: 'rounded-2xl',
  },
}

export function AppIcon({
  size = 'md',
  pulse = false,
  className,
}: AppIconProps) {
  const { container, icon, rounded } = sizeConfig[size]

  return (
    <div
      className={cn(
        'bg-primary/10 text-primary border-primary/15 shadow-primary/10 relative flex shrink-0 items-center justify-center border shadow-sm',
        container,
        rounded,
        className,
      )}
    >
      <IconRoute className={cn(icon, pulse && 'animate-pulse')} />
    </div>
  )
}
