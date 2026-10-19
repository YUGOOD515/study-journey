import * as RP from "@radix-ui/react-popover";
import { cn } from "../../lib/cn";

export const Popover = RP.Root;
export const PopoverTrigger = RP.Trigger;
export const PopoverAnchor = RP.Anchor;
export const PopoverClose = RP.Close;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = "start",
  ...rest
}: RP.PopoverContentProps) {
  return (
    <RP.Portal>
      <RP.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={10}
        className={cn(
          "z-popover max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-lg border border-sub/15 bg-card p-3 text-xs text-ink shadow-pop animate-pop-in outline-none",
          className,
        )}
        {...rest}
      />
    </RP.Portal>
  );
}
