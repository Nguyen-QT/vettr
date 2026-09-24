"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect } from "react"

interface ImageLightboxProps {
  images: string[]
  index: number
  onIndexChange: (index: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  alt?: string
}

const ICON_BUTTON_CLASSES =
  "absolute z-10 rounded-full bg-background/80 p-2 text-foreground outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"

// UI Primitive (CLAUDE.md 19.1.1): a controlled, presentation-only
// click-to-enlarge lightbox for a set of images -- open/index state
// and the image list are owned entirely by the caller. Evolves the
// static full-size grid from AppointmentDetailDialog (CLAUDE.md
// 18.1.2) into a real lightbox: keyboard/on-screen prev-next
// navigation and a Framer Motion crossfade between images, both
// respecting prefers-reduced-motion.
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
  alt = "Design reference",
}: ImageLightboxProps) {
  const prefersReducedMotion = useReducedMotion()
  const hasMultiple = images.length > 1

  const goTo = useCallback(
    (next: number) => {
      if (images.length === 0) return
      onIndexChange(((next % images.length) + images.length) % images.length)
    },
    [images.length, onIndexChange]
  )

  useEffect(() => {
    if (!open || !hasMultiple) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowRight") goTo(index + 1)
      if (event.key === "ArrowLeft") goTo(index - 1)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, hasMultiple, index, goTo])

  const currentUrl = images[index]
  const transitionDuration = prefersReducedMotion ? 0.01 : 0.2

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/80 data-[ending-style]:animate-out data-[ending-style]:fade-out-0 data-[starting-style]:animate-in data-[starting-style]:fade-in-0" />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
          render={<div />}
        >
          <DialogPrimitive.Title className="sr-only">Image preview</DialogPrimitive.Title>

          <DialogPrimitive.Close
            aria-label="Close preview"
            className={cn(ICON_BUTTON_CLASSES, "top-4 right-4")}
          >
            <XIcon className="size-5" />
          </DialogPrimitive.Close>

          {hasMultiple ? (
            <>
              <button
                type="button"
                aria-label="Previous image"
                onClick={() => goTo(index - 1)}
                className={cn(ICON_BUTTON_CLASSES, "left-4")}
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Next image"
                onClick={() => goTo(index + 1)}
                className={cn(ICON_BUTTON_CLASSES, "right-4")}
              >
                <ChevronRightIcon className="size-5" />
              </button>
            </>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            {currentUrl ? (
              <motion.div
                key={currentUrl}
                initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96 }}
                transition={{ duration: transitionDuration }}
                className="relative max-h-[85vh] max-w-[90vw]"
              >
                <Image
                  src={currentUrl}
                  alt={alt}
                  width={1200}
                  height={1200}
                  className="h-auto max-h-[85vh] w-auto max-w-[90vw] rounded-md object-contain"
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
