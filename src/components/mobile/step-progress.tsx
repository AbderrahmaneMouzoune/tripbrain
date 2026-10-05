import { cn } from '@/lib/utils'

/** Barre de parcours en segments : « étape 2 sur 4 ». */
export function StepProgress({
  step,
  total,
  className,
}: {
  step: number
  total: number
  className?: string
}) {
  return (
    <div
      role="progressbar"
      aria-label={`Étape ${step} sur ${total}`}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      className={cn('flex flex-1 gap-1.5', className)}
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-[5px] flex-1 rounded-full transition-colors duration-500',
            index < step ? 'bg-primary' : 'bg-border',
          )}
        />
      ))}
    </div>
  )
}
