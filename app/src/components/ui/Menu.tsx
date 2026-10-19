import * as DM from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export const MenuGroup = DM.Group;
export const MenuSub = DM.Sub;

const PANEL =
  "z-popover min-w-[168px] overflow-hidden rounded-lg border border-sub/15 bg-card p-1 text-xs text-ink shadow-pop animate-pop-in outline-none";

export function MenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...rest
}: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          PANEL,
          "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto",
          className,
        )}
        {...rest}
      />
    </DM.Portal>
  );
}

const ITEM =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-sub/10";

export function MenuItem({
  icon,
  danger,
  shortcut,
  className,
  children,
  ...rest
}: DM.DropdownMenuItemProps & {
  icon?: React.ReactNode;
  danger?: boolean;
  shortcut?: React.ReactNode;
}) {
  return (
    <DM.Item
      className={cn(ITEM, danger && "text-danger data-[highlighted]:bg-danger/10", className)}
      {...rest}
    >
      {icon && (
        <span className={cn("flex w-4 justify-center", danger ? "text-danger" : "text-sub")}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="ml-3 text-[10px] text-faint">{shortcut}</span>}
    </DM.Item>
  );
}

export function MenuCheckboxItem({
  className,
  children,
  ...rest
}: DM.DropdownMenuCheckboxItemProps) {
  return (
    <DM.CheckboxItem className={cn(ITEM, "pr-7", className)} {...rest}>
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border border-sub/30 data-[state=checked]:border-brand data-[state=checked]:bg-brand">
        <DM.ItemIndicator>
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </DM.ItemIndicator>
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
    <DM.RadioItem className={cn(ITEM, "pr-7", className)} {...rest}>
      <span className="flex w-4 justify-center">
        <DM.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-brand" />
        </DM.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DM.RadioItem>
  );
}

export function MenuLabel({ className, ...rest }: DM.DropdownMenuLabelProps) {
  return (
    <DM.Label className={cn("px-2 pb-1 pt-1.5 text-[10px] text-faint", className)} {...rest} />
  );
}

export function MenuSeparator({ className, ...rest }: DM.DropdownMenuSeparatorProps) {
  return <DM.Separator className={cn("-mx-1 my-1 h-px bg-sub/10", className)} {...rest} />;
}

export function MenuSubTrigger({
  icon,
  className,
  children,
  ...rest
}: DM.DropdownMenuSubTriggerProps & { icon?: React.ReactNode }) {
  return (
    <DM.SubTrigger className={cn(ITEM, "data-[state=open]:bg-sub/10", className)} {...rest}>
      {icon && <span className="flex w-4 justify-center text-sub">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight className="h-3.5 w-3.5 text-faint" />
    </DM.SubTrigger>
  );
}

export function MenuSubContent({ className, ...rest }: DM.DropdownMenuSubContentProps) {
  return (
    <DM.Portal>
      <DM.SubContent
        sideOffset={4}
        collisionPadding={8}
        className={cn(PANEL, className)}
        {...rest}
      />
    </DM.Portal>
  );
}
