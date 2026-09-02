// Small inline icon set shared by the dashboard cards and navigation.

export type IconName =
  | "home"
  | "store"
  | "users"
  | "list"
  | "inbox"
  | "shield"
  | "book"
  | "plug"
  | "plus"
  | "help";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const props = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 11l9-7 9 7M5 10v10h14V10" />
        </svg>
      );
    case "store":
      return (
        <svg {...props}>
          <path d="M3 8l1.5-4h15L21 8M3 8v11h18V8M3 8h18M9 12h6" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4.5-6.2" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <path d="M3 13l2.5-8h13L21 13M3 13v6h18v-6M3 13h5l1.5 3h5L16 13h5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 002 2h13M8 7h7" />
        </svg>
      );
    case "plug":
      return (
        <svg {...props}>
          <path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0V8zM12 17v4" />
        </svg>
      );
    case "help":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
  }
}
