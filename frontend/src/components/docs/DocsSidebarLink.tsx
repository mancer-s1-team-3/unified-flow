"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DocsSidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
        isActive
          ? "bg-indigo-500/10 text-indigo-400"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/50"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
