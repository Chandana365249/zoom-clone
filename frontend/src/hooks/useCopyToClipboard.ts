"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for non-secure origins (e.g. opening the dev server over a LAN IP).
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Copy failed");
}

/** Returns `copy(text, successMessage)`, which reports the outcome with a toast. */
export function useCopyToClipboard() {
  const toast = useToast();
  return useCallback(
    async (text: string, successMessage = "Copied to clipboard") => {
      try {
        await writeToClipboard(text);
        toast.success(successMessage);
      } catch {
        toast.error("Couldn't copy. Please copy it manually.");
      }
    },
    [toast],
  );
}
