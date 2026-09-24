import type { ComponentChildren, JSX } from "preact";

export type BadgeVariant = "accent" | "warn" | "muted" | "fg";

export interface BadgeProps {
  variant?: BadgeVariant;
  class?: string;
  title?: string;
  icon?: ComponentChildren;
  children: ComponentChildren;
  onClick?: JSX.MouseEventHandler<HTMLButtonElement>;
  href?: string;
  target?: string;
  rel?: string;
}

export function Badge({
  variant = "muted",
  class: className = "",
  title,
  icon,
  children,
  onClick,
  href,
  target,
  rel,
}: BadgeProps) {
  const classes = [className, "badge", `badge-${variant}`].filter(Boolean).join(" ");

  if (href) {
    return (
      <a class={classes} href={href} target={target} rel={rel} title={title}>
        {icon}
        <span>{children}</span>
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" class={classes} onClick={onClick} title={title}>
        {icon}
        <span>{children}</span>
      </button>
    );
  }

  return (
    <span class={classes} title={title}>
      {icon}
      <span>{children}</span>
    </span>
  );
}
