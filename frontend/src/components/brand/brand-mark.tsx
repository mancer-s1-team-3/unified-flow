"use client";

import Image from "next/image";

type BrandMarkProps = {
  size?: number;
  className?: string;
};

export function BrandMark({ size = 40, className = "" }: BrandMarkProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950 shadow-lg shadow-indigo-500/15 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.jpg"
        alt="Unified Flow logo"
        fill
        priority
        sizes={`${size}px`}
        className="object-cover"
      />
    </div>
  );
}
