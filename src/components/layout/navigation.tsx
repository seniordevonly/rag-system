"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Search, Bot, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/search", label: "Search", icon: Search },
  { href: "/dashboard/file-management", label: "Files", icon: FolderOpen },
];

const NAV_LINK_STYLES = {
  base: "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
  active: "bg-primary/10 text-primary",
  inactive: "text-muted-foreground hover:bg-muted hover:text-foreground",
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname?.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        NAV_LINK_STYLES.base,
        active ? NAV_LINK_STYLES.active : NAV_LINK_STYLES.inactive
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold"
          >
            <Bot className="h-6 w-6 text-primary" />
            <span className="text-lg">RAG System</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
