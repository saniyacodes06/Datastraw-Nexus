"use client";
// Collapsible sidebar. Desktop: full (labels) or rail (icons only), remembered in a cookie so the
// server renders the right width with no flash. Phone: hidden behind a menu button, slides in as a drawer.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Bot, Building2, CalendarDays, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
  PartyPopper, Plane, ShieldAlert, Users, X,
} from "lucide-react";
import { logout } from "@/app/actions";
import { Tour } from "@/components/tour";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, manager: true },
  { href: "/roster", label: "Roster", icon: CalendarDays },
  { href: "/resilience", label: "Stress test", icon: ShieldAlert, manager: true },
  { href: "/assistant", label: "Assistant", icon: Bot, manager: true },
  { href: "/leaves", label: "Leaves", icon: Plane },
  { href: "/employees", label: "Employees", icon: Users, manager: true },
  { href: "/brands", label: "Brands & rules", icon: Building2, manager: true },
  { href: "/holidays", label: "Holidays", icon: PartyPopper, manager: true },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

function Brand({ hideText, href }: { hideText?: boolean; href: string }) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">DN</span>
      <span className={cn("min-w-0 leading-tight", hideText && "md:hidden")}>
        <span className="block truncate text-sm font-semibold text-primary">DataStraw Nexus</span>
        <span className="block truncate text-xs text-muted-foreground">Roster management</span>
      </span>
    </Link>
  );
}

export function SideNav({ manager, unread, name, initialCollapsed }: { manager: boolean; unread: number; name: string; initialCollapsed: boolean }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [open, setOpen] = useState(false); // phone drawer
  const [shownFor, setShownFor] = useState(path);
  if (shownFor !== path) { setShownFor(path); setOpen(false); } // close the drawer after navigating

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `nexus_sidebar=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };

  // The tour points at menu items: make sure they are on screen while it does.
  useEffect(() => {
    const onStep = (e: Event) => {
      const target = (e as CustomEvent<string | null>).detail;
      const inMenu = !!target && (target.startsWith("/") || target === "tour");
      setOpen(inMenu);
      if (inMenu) setCollapsed(false);
    };
    window.addEventListener("nexus-tour-step", onStep);
    return () => window.removeEventListener("nexus-tour-step", onStep);
  }, []);

  const rail = collapsed; // desktop icon-only mode
  const home = manager ? "/dashboard" : "/roster";
  return (
    <>
      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-sidebar/95 px-4 py-2.5 backdrop-blur md:hidden">
        <button onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="rounded-lg p-1.5 hover:bg-sidebar-accent">
          <Menu className="size-5" />
        </button>
        <Brand href={home} />
        {unread > 0 && <Link href="/notifications" className="ml-auto rounded-full bg-red-600 px-2 text-xs text-white" aria-label={`${unread} new notifications`}>{unread}</Link>}
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-sidebar p-3 transition-[transform,width] duration-200",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0 shadow-xl" : "-translate-x-full",
          rail ? "md:w-[4.5rem]" : "md:w-60",
        )}
        aria-label="Main menu"
      >
        <div className={cn("mb-4 flex items-center gap-2", rail && "md:flex-col")}>
          <Brand hideText={rail} href={home} />
          <button onClick={toggle} title={rail ? "Expand menu" : "Collapse menu"} aria-label={rail ? "Expand menu" : "Collapse menu"}
            className={cn("ml-auto hidden rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:block", rail && "md:ml-0")}>
            {rail ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close menu" className="ml-auto rounded-lg p-1.5 hover:bg-sidebar-accent md:hidden"><X className="size-5" /></button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {LINKS.filter((l) => manager || !l.manager).map(({ href, label, icon: Icon }) => {
            const active = path.startsWith(href);
            const badge = href === "/notifications" && unread > 0;
            return (
              <Link key={href} href={href} data-tour={href} title={rail ? label : undefined} aria-current={active ? "page" : undefined}
                className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/70",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm", rail && "md:justify-center md:px-0")}>
                <Icon className="size-[18px] shrink-0" />
                <span className={cn("truncate", rail && "md:sr-only")}>{label}</span>
                {badge && <span className={cn("ml-auto rounded-full bg-red-600 px-1.5 text-xs text-white", rail && "md:absolute md:top-1 md:right-2 md:size-2 md:p-0 md:text-[0px]")}>{unread}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 space-y-2 border-t pt-3">
          <Tour manager={manager} compact={rail} />
          <form action={logout} className={cn("flex items-center gap-2.5 px-1", rail && "md:justify-center md:px-0")}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground" title={name}>
              {name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </span>
            <span className={cn("min-w-0 flex-1 text-xs leading-tight", rail && "md:hidden")}>
              <span className="block truncate font-medium">{name}</span>
              <span className="text-muted-foreground">{manager ? "Manager" : "Employee"}</span>
            </span>
            <button title="Sign out" aria-label="Sign out" className={cn("rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground", rail && "md:hidden")}>
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
