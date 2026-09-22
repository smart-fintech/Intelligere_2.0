import { PACKAGE_MODE } from '../pricing'

const MODES = [
  { value: PACKAGE_MODE.PREMIUM, label: 'Premium Package' },
  { value: PACKAGE_MODE.CUSTOM, label: 'Custom Package' },
]

/**
 * Premium or Custom, as the old payment page drew it: two small radios.
 *
 *   lockedMode        on a renewal only the package type already held is
 *                     offered, so only that radio is drawn (as before)
 *   premiumAvailable  false when the backend sends no "All" price
 */
export function PackageModeSwitch({ value, onChange, lockedMode, premiumAvailable }) {
  const modes = MODES.filter(
    (mode) =>
      (!lockedMode || mode.value === lockedMode) && (mode.value !== PACKAGE_MODE.PREMIUM || premiumAvailable),
  )

  return (
    <div role="radiogroup" aria-label="Package type" className="flex flex-wrap justify-center gap-x-16 gap-y-2 lg:justify-end lg:pr-16">
      {modes.map((mode) => {
        const id = `package-mode-${mode.value}`
        return (
          <label key={mode.value} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm font-bold text-foreground">
            <input
              id={id}
              type="radio"
              name="package-mode"
              className="size-3.5 cursor-pointer accent-[var(--brand)]"
              checked={value === mode.value}
              onChange={() => onChange(mode.value)}
            />
            {mode.label}
          </label>
        )
      })}
    </div>
  )
}
