import { ToggleGroup } from 'radix-ui'
import { cn } from './cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  options: SegmentOption<T>[]
  value: T
  onValueChange: (value: T) => void
  disabled?: boolean
}

/** Single-choice segmented control. Selected segment is yellow with ink text. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      disabled={disabled}
      // Radix emits '' when the active item is pressed again; keep the selection.
      onValueChange={(v) => v && onValueChange(v as T)}
      className="inline-flex overflow-hidden rounded-md border border-ink bg-surface"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'h-11 px-3 text-body font-semibold text-ink transition-colors duration-[120ms] sm:h-10',
            'not-first:border-l not-first:border-ink',
            'hover:bg-sunken data-[state=on]:bg-yellow data-[state=on]:hover:bg-yellow-hover',
            'disabled:opacity-45',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
