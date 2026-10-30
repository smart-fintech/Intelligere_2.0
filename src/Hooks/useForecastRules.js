/**
 * Whether the active company has enough data to forecast from - the rules
 * of inventory/forecastRules/:
 *
 *   const rules = useForecastRules(enabled)
 *
 *   status    'idle' | 'loading' | 'ready' | 'failed'
 *   rules     readForecastRules(...) of the reply - null until it is in
 *   error     the message when the request failed
 *   reload()  asks again now - Retry
 *
 * Nothing is asked while `enabled` is false (the tab not open, or the
 * company's plan without Forecasting). Kept in the shared cache
 * (Library/queryCache) under [FORECAST_RULES, companyName] for the whole
 * session: asked the first time the tab is opened for a company, and never
 * again for it - leaving the tab and coming back reuses the answer, and
 * another company asks for its own.
 */

import { QUERY } from '@/Constants/queryKeys'
import { useActiveCompany } from '@/Hooks/useActiveCompany'
import { useQuery } from '@/Library/queryCache'
import { readForecastRules } from '@/Modules/Dashboard/forecasting'
import { getForecastRules } from '@/Services/inventoryService'

export default function useForecastRules(enabled = true) {
  const { activeCompanyName: companyName } = useActiveCompany()

  const query = useQuery({
    key: companyName ? [QUERY.FORECAST_RULES, companyName] : null,
    fetch: () => getForecastRules({ companyName }).then(readForecastRules),
    staleTime: Infinity,
    enabled,
  })

  return {
    status: !enabled || !companyName ? 'idle' : query.status,
    rules: query.data ?? null,
    error: query.status === 'failed' ? query.error : null,
    reload: query.reload,
  }
}
