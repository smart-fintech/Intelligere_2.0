import { CodeSelector } from '@/Components/Common/CodeSelector'
import useSacList from '@/Hooks/useSacList'
import { findSac, searchSac } from '@/Services/sacService'

/**
 * The SAC Code field of the Ledger form.
 *
 *   <SacSelector id="ledger_sac" label="SAC Code" value={form.ledger_sac}
 *                onChange={(code) => setField('ledger_sac', code)} />
 *
 * The same field as the Product form's HSN Code, on the same list behaviour
 * (CodeSelector): the codes alone in the list, each one's description in a
 * tooltip as it is highlighted, searched by the digits it starts with, over
 * a list fetched once for the whole app (Services/sacService).
 *
 * The value is the code as text - exactly what `ledger_sac` held before and
 * what it still sends, so nothing about the save changes. A ledger saved
 * with a code the list does not have still shows it.
 *
 * Props: id, label, required, error, value, onChange(code), disabled, className
 */
export function SacSelector(props) {
  const codes = useSacList()

  return (
    <CodeSelector
      {...props}
      codes={codes}
      find={findSac}
      search={searchSac}
      noun="SAC code"
      placeholder="Search SAC code"
      searchPlaceholder="Type SAC code..."
    />
  )
}

export default SacSelector
