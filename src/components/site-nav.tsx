"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Asterisk, Menu, X } from "lucide-react";
import clsx from "clsx";

const LINKS = [
  { href: "/wardrobe", label: "Wardrobe", index: "01" },
  { href: "/match", label: "Match studio", index: "02" },
  { href: "/model", label: "My model", index: "03" },
  { href: "/character", label: "Character", index: "04" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-bone/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-1.5">
            <Asterisk
              className="h-5 w-5 text-flame transition-transform duration-500 group-hover:rotate-180"
              strokeWidth={2.4}
            />
            <span className="font-display text-[22px] leading-none tracking-tight">
              fitcheck
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "rounded-full px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
                    active
                      ? "bg-ink text-bone"
                      : "text-ink-soft hover:bg-bone-deep hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/wardrobe?upload=1"
              className="ml-2 hidden items-center gap-1 rounded-full bg-flame px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-bone transition-colors hover:bg-ink md:inline-flex"
            >
              Add a piece
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </Link>
          </nav>

          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line sm:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-30 bg-bone pt-14 sm:hidden"
          >
            <nav className="flex flex-col gap-2 px-6 pt-10">
              {[{ href: "/", label: "Home", index: "00" }, ...LINKS].map(
                (link) => (
                  <motion.div
                    key={link.href}
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.06 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="group flex items-baseline gap-4 border-b border-line py-5"
                    >
                      <span className="font-mono text-xs text-flame">
                        {link.index}
                      </span>
                      <span className="font-display text-4xl tracking-tight transition-transform duration-300 group-hover:translate-x-2">
                        {link.label}
                      </span>
                    </Link>
                  </motion.div>
                ),
              )}
              <Link
                href="/wardrobe?upload=1"
                onClick={() => setOpen(false)}
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-flame px-6 py-4 font-mono text-xs uppercase tracking-[0.2em] text-bone"
              >
                Add a piece
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
