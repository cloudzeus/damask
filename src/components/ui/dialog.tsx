"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

/** Κλικ έξω από το modal ΔΕΝ το κλείνει (χάνονταν οι τιμές της φόρμας) — κλείνει
 * μόνο με ✕ / «Άκυρο» / Escape. Όπου χρειάζεται, `disablePointerDismissal={false}`. */
function Dialog({ disablePointerDismissal = true, ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" disablePointerDismissal={disablePointerDismissal} {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/45 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Modals με δικό τους layout (flex-col / p-0) κρατούν τη δική τους δομή. */
const CUSTOM_LAYOUT = /(^|\s)(flex-col|p-0)(\s|$)/

function isElementOf(node: React.ReactNode, type: React.ElementType): boolean {
  return React.isValidElement(node) && node.type === type
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  const custom = typeof className === "string" && CUSTOM_LAYOUT.test(className)

  // Τρεις ζώνες: σταθερός τίτλος (DialogHeader) πάνω, σταθερά κουμπιά (DialogFooter)
  // κάτω, και ΜΟΝΟ το σώμα κάνει scroll — το scrollbar δεν φτάνει ποτέ στον τίτλο.
  let header: React.ReactNode[] = []
  let footer: React.ReactNode[] = []
  let body: React.ReactNode[] = []
  if (!custom) {
    const items = React.Children.toArray(children)
    let start = 0
    while (start < items.length && isElementOf(items[start], DialogHeader)) start++
    let end = items.length
    while (end > start && isElementOf(items[end - 1], DialogFooter)) end--
    header = items.slice(0, start)
    body = items.slice(start, end)
    footer = items.slice(end)
  }

  const closeButton = showCloseButton && (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={
        <Button
          variant="ghost"
          className="absolute top-2 right-2 z-10"
          size="icon-sm"
        />
      }
    >
      <XIcon
      />
      <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
  )

  const motion = "fixed top-1/2 left-1/2 z-50 w-full max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

  return (
    <DialogPortal>
      <DialogOverlay />
      {custom ? (
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn("dialog-scroll grid grid-cols-1 gap-4 overflow-y-auto overscroll-contain p-4", motion, className)}
          {...props}
        >
          {children}
          {closeButton}
        </DialogPrimitive.Popup>
      ) : (
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          // overflow-hidden ΜΕΤΑ το className: τυχόν overflow-y-auto των καλούντων δεν
          // ξαναβάζει scroll σε όλο το παράθυρο.
          className={cn("dialog-scroll flex flex-col", motion, className, "gap-0 overflow-hidden p-0")}
          {...props}
        >
          {header.length > 0 && <div className="flex shrink-0 flex-col gap-4 px-4 pt-4 pb-3 pr-11">{header}</div>}
          <div className={cn("dialog-body grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-4", header.length ? "pt-1" : "pt-4")}>
            {body}
          </div>
          {footer.length > 0 && <div className="shrink-0 px-4 pb-4">{footer}</div>}
          {closeButton}
        </DialogPrimitive.Popup>
      )}
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
