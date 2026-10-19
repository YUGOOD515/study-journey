import * as RT from "@radix-ui/react-tooltip";

export const TooltipProvider = RT.Provider;

/** 悬停提示（触屏不显示）。children 必须是可接收 ref 的单个元素。 */
export function Tip({
  label,
  side = "bottom",
  children,
}: {
  label: React.ReactNode;
  side?: RT.TooltipContentProps["side"];
  children: React.ReactElement;
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-toast max-w-[260px] rounded-md bg-ink px-2 py-1 text-[11px] leading-snug text-bg shadow-pop animate-pop-in"
        >
          {label}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
