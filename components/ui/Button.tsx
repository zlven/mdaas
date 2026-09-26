/**
 * Button — docs/03_UI_UX_SPEC.md §2, §11.
 *
 * `buttonClass` is exported alongside the component because some actions are
 * links rather than buttons ("浏览专家" navigates, it does not act), and a link
 * styled as a button must not become a `<button>` with an onClick that pushes a
 * route: that breaks middle-click, keyboard activation, and the status bar.
 *
 * Sizes use the spacing scale from §2 (4 · 8 · 12 · 16 · 24 …). Nothing here
 * invents a value.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  // --accent is the primary action on a screen and the active state of
  // anything. One per screen, not one per card.
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-ink hover:border-line-strong",
  ghost: "text-ink-muted hover:text-ink",
  danger: "border border-line bg-surface text-danger hover:border-danger",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-small",
  md: "px-4 py-2 text-small",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={`${buttonClass(variant, size)} ${className ?? ""}`} {...props} />;
}
