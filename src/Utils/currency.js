/**
 * ONE place for showing money. Every rupee amount on screen goes through
 * formatIndianCurrency, so the whole app groups digits the Indian way:
 *
 *   formatIndianCurrency(9500)        ->  '₹9,500'
 *   formatIndianCurrency('9500.00')   ->  '₹9,500'
 *   formatIndianCurrency(100000)      ->  '₹1,00,000'
 *   formatIndianCurrency(1250000)     ->  '₹12,50,000'
 *   formatIndianCurrency(100000.5)    ->  '₹1,00,000.50'
 *   formatIndianCurrency(-1250)       ->  '-₹1,250'
 *   formatIndianCurrency(0)           ->  '₹0'
 *   formatIndianCurrency(null)        ->  '--'     (nothing to show)
 *
 * Whole rupees show no decimals; an amount with paise shows exactly two.
 *
 * This is for DISPLAY only. An API that takes an amount gets the plain
 * "9500.00" string (toAmountString in Modules/Payment/pricing), never this.
 */

const whole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const exact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Rupees (number or numeric string) -> '₹1,00,000'. '--' when not a number. */
export const formatIndianCurrency = (amount) => {
  if (amount === null || amount === undefined || amount === '' || typeof amount === 'boolean') return '--'
  const number = Number(amount)
  if (!Number.isFinite(number)) return '--'

  // Rounded to whole paise first, so 0.1 + 0.2 shows as ₹0.30, not a tail
  // of float digits, and ₹9,500.00 is recognised as whole rupees.
  const paise = Math.round(number * 100)
  const rupees = paise / 100
  return (paise % 100 === 0 ? whole : exact).format(rupees)
}
