import * as RP from "@radix-ui/react-popover";
import { cn } from "../../lib/cn";

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

export const popoverPanelClass =
  "animate-fade z-popover rounded-md border border-line bg-card text-xs text-ink shadow-pop outline-none";

export function PopoverContent({ className, sideOffset = 6, align = "start", ...rest }: RP.PopoverContentProps) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={10}
        className={cn(
          popoverPanelClass,
          "max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain p-3",
          className,
        )}
        {...rest}
      />
    </RP.Portal>
  );
}
