import { CodeSelector } from '@/Components/Common/CodeSelector'
import useHsnList from '@/Hooks/useHsnList'
import { findHsn, searchHsn } from '@/Services/hsnService'

/**
 * The HSN Code field of a Product form.
 *
 *   <HsnSelector id="hsn" label="HSN Code" value={form.hsn} onChange={(code) => ...} />
 *
 * A dropdown whose search box finds a code among the whole HSN list
 * (Services/hsnService, fetched once for the app), listing the codes alone
 * and showing what each describes in a tooltip as it is highlighted.
 *
 * All of that behaviour is CodeSelector's, which the Ledger form's SAC field
 * is as well - this only hands it the HSN list and says what to call a code.
 *
 * Props: id, label, required, error, value, onChange(code), disabled, className
 */
export function HsnSelector(props) {
  const codes = useHsnList()

  return (
    <CodeSelector
      {...props}
      codes={codes}
      find={findHsn}
      search={searchHsn}
      noun="HSN code"
      placeholder="Search HSN code"
      searchPlaceholder="Type HSN code..."
    />
  )
}

export default HsnSelector
