import { Toaster as Sonner } from "sonner";

/**
 * The box that holds every toast. It is placed once, in App.jsx.
 *
 * There is almost no styling here on purpose: each toast draws itself
 * (see @/Components/Common/Toast), so this only decides where the stack
 * sits and how wide it is.
 */
const Toaster = ({
  ...props
}) => {
  return (
    <Sonner
      position="top-right"
      className="toaster group"
      // Sonner's own close button is off - our toast has its own X.
      closeButton={false}
      // `--width` is the width sonner gives each slot; the toast fills it.
      style={{ '--width': '384px' }}
      {...props}
    />
  );
}

export { Toaster }
