import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";
import { popoverPanelClass } from "./Popover";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;
export const MenuSub = DM.Sub;

const PANEL = cn(popoverPanelClass, "min-w-[176px] p-1");

export function MenuContent({ className, align = "end", sideOffset = 4, ...rest }: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(PANEL, "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto", className)}
        {...rest}
      />
    </DM.Portal>
  );
}

const ITEM =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-fill [&_svg]:h-3.5 [&_svg]:w-3.5";

export function MenuItem({
  icon,
  danger,
  shortcut,
  className,
  children,
  ...rest
}: DM.DropdownMenuItemProps & { icon?: React.ReactNode; danger?: boolean; shortcut?: React.ReactNode }) {
  return (
    <DM.Item className={cn(ITEM, danger && "text-danger data-[highlighted]:bg-danger/10", className)} {...rest}>
      <span className={cn("flex w-4 shrink-0 justify-center", danger ? "text-danger" : "text-sub")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="num ml-3 text-2xs text-faint">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuCheckboxItem({ className, children, ...rest }: DM.DropdownMenuCheckboxItemProps) {
  return (
    <DM.CheckboxItem className={cn(ITEM, className)} {...rest}>
      <span className="flex w-4 shrink-0 justify-center">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-line-strong">
          <DM.ItemIndicator>
            <Check className="!h-3 !w-3 text-ink" strokeWidth={3} />
          </DM.ItemIndicator>
        </span>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.CheckboxItem>
  );
}

export function MenuRadioGroup(props: DM.DropdownMenuRadioGroupProps) {
  return <DM.RadioGroup {...props} />;
}

export function MenuRadioItem({ className, children, ...rest }: DM.DropdownMenuRadioItemProps) {
  return (
    <DM.RadioItem className={cn(ITEM, className)} {...rest}>
      <span className="flex w-4 shrink-0 justify-center">
        <DM.ItemIndicator>
          <Check className="text-ink" />
        </DM.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.RadioItem>
  );
}

export function MenuLabel({ className, ...rest }: DM.DropdownMenuLabelProps) {
  return <DM.Label className={cn("px-2 pb-1 pt-2 text-2xs font-medium text-faint", className)} {...rest} />;
}

export function MenuSeparator({ className, ...rest }: DM.DropdownMenuSeparatorProps) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} {...rest} />;
}

export function MenuSubTrigger({
  icon,
  className,
  children,
  ...rest
}: DM.DropdownMenuSubTriggerProps & { icon?: React.ReactNode }) {
  return (
    <DM.SubTrigger className={cn(ITEM, "data-[state=open]:bg-fill", className)} {...rest}>
      <span className="flex w-4 shrink-0 justify-center text-sub">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight className="text-faint" />
    </DM.SubTrigger>
  );
}

export function MenuSubContent({ className, ...rest }: DM.DropdownMenuSubContentProps) {
  return (
    <DM.Portal>
      <DM.SubContent sideOffset={4} collisionPadding={8} className={cn(PANEL, className)} {...rest} />
    </DM.Portal>
  );
}
