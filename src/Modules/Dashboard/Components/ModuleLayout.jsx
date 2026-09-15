import ModuleNav from '@/Modules/Dashboard/Components/ModuleNav'

/**
 * The frame every dashboard page sits in: the horizontal navigation across
 * the top, the page title under it, then the page.
 *
 *   <ModuleLayout title="Bank Details" actions={<Button>Add New Bank</Button>}>
 *     ...the page...
 *   </ModuleLayout>
 *
 * Written once here so all five pages share it, and so the next one gets the
 * navigation by wrapping itself in this. There is exactly one navigation bar
 * in the dashboard and it lives in ModuleNav - no page draws its own.
 *
 * The company name in the heading is read from the store rather than passed
 * in, because every page is about the same company - the one the header's
 * picker is on - and no page should have to be handed it.
 *
 * Props:
 *   title     the page heading
 *   actions   buttons for the top-right of the heading row. Optional.
 *   children  the page content
 */
export default function ModuleLayout({ title, actions, children }) {

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <ModuleNav />

      {/* ---------------- Page heading ----------------
          The title and which company it is about. Nothing else: a line
          explaining what the page is for would say what the reader can
          already see. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-brand sm:text-2xl">{title}</h1>
        </div>

        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {/* `min-w-0` is what lets a wide table scroll inside the page instead
          of stretching the whole layout. */}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
