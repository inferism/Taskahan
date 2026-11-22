import { useLayoutEffect, useRef, useState } from 'react'
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

/**
 * Single-choice segmented control. The selected segment uses the primary action colors, drawn
 * by one thumb that slides to the new choice.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)

  // Segments size to their labels, so the thumb measures the selected one.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => {
      const item = root.querySelector<HTMLElement>('[data-state="on"]')
      setThumb(item?.offsetWidth ? { left: item.offsetLeft, width: item.offsetWidth } : null)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [value, options.length])

  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      aria-label={label}
      value={value}
      disabled={disabled}
      // Radix emits '' when the active item is pressed again; keep the selection.
      onValueChange={(v) => v && onValueChange(v as T)}
      className="relative inline-flex rounded-md border border-line bg-sunken p-1"
    >
      {thumb && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-0 rounded-sm bg-yellow shadow-card motion-safe:transition-[transform,width] motion-safe:duration-[240ms] motion-safe:ease-(--ease-out)"
          style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
        />
      )}
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'relative h-9 flex-1 rounded-sm px-3 text-body font-medium text-muted transition-[color,background-color,transform] duration-[140ms] active:scale-[0.97] sm:h-8',
            'hover:text-ink data-[state=on]:text-on-yellow data-[state=on]:hover:text-on-yellow',
            // Until the thumb is measured (first paint, tests) the item fills itself.
            !thumb && 'data-[state=on]:bg-yellow',
            'disabled:opacity-45',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
