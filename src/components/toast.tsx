"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

export function Toast({ toast }: { toast: string | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 border border-line bg-ink px-5 py-3 text-bone shadow-[8px_8px_0_0_rgba(23,20,14,0.25)]"
        >
          <Check className="h-4 w-4 text-flame" strokeWidth={2.5} />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
            {toast}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
