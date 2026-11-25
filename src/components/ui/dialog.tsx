"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 flex flex-col w-[calc(100vw-2rem)] max-w-lg max-h-[88dvh] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-2xl duration-200 overflow-y-auto overscroll-contain focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl max-sm:!left-0 max-sm:!right-0 max-sm:!top-auto max-sm:!bottom-0 max-sm:!w-full max-sm:!max-w-full max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!max-h-[92dvh] max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:data-[state=open]:!slide-in-from-left-0 max-sm:data-[state=open]:!slide-in-from-bottom-full max-sm:data-[state=open]:!zoom-in-100 max-sm:data-[state=closed]:!slide-out-to-left-0 max-sm:data-[state=closed]:!slide-out-to-bottom-full max-sm:data-[state=closed]:!zoom-out-100 max-sm:duration-300",
        className
      )}
      {...props}
    >
      <DialogPrimitive.Title className="sr-only">Boîte de dialogue</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">Contenu informatif ou formulaire d'action.</DialogPrimitive.Description>
      {/* Poignée de « bottom sheet » sur téléphone */}
      <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden" aria-hidden="true" />
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-20">
        <X className="h-4 w-4" />
        <span className="sr-only">Fermer</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
