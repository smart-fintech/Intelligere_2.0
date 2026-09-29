import { PACKAGE_MODE } from '../pricing'

const MODES = [
  {
    value: PACKAGE_MODE.PREMIUM,
    label: 'Premium Package',
  },
  {
    value: PACKAGE_MODE.CUSTOM,
    label: 'Custom Package',
  },
]

export function PackageModeSwitch({
  value,
  onChange,
  lockedMode,
  premiumAvailable = true,
}) {
  const modes = MODES.filter(
    (mode) =>
      (!lockedMode || mode.value === lockedMode) &&
      (mode.value !== PACKAGE_MODE.PREMIUM || premiumAvailable),
  )

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Purchase type"
        className="flex justify-center items-center gap-6"
      >
        {modes.map((mode) => {
          const id = `package-mode-${mode.value}`
          const selected = value === mode.value

          return (
            <label
              key={mode.value}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                id={id}
                type="radio"
                name="package-mode"
                value={mode.value}
                checked={selected}
                onChange={() => onChange(mode.value)}
                className="h-4 w-4 cursor-pointer accent-[var(--brand)]"
              />

              <span className="text-sm font-medium text-foreground">
                {mode.label}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}