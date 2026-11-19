"use client";

import { Badge } from "./badge";
import { useTranslation } from '../locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";
import { cn } from "../cn";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock, CodeBlockActions, CodeBlockContent, CodeBlockCopyButton, CodeBlockHeader } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group/tool not-prose w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolPart = {
  state: keyof typeof statusLabels;
  input: unknown;
  output: unknown;
  errorText: string | undefined;
};

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: `tool-${string}`; state: ToolPart["state"]; toolName?: never }
  | {
      type: "dynamic-tool";
      state: ToolPart["state"];
      toolName: string;
    }
);

const statusLabels = {
  "approval-requested": "等待审批",
  "approval-responded": "已响应",
  "input-available": "执行中",
  "input-streaming": "等待中",
  "output-available": "已完成",
  "output-denied": "未执行",
  "output-error": "失败",
} as const;

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-4 text-blue-600" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4 text-green-600" />,
  "output-denied": <XCircleIcon className="size-4 text-orange-600" />,
  "output-error": <XCircleIcon className="size-4 text-red-600" />,
};

function ToolStatusBadge({ status }: { status: ToolPart["state"] }) {
  const t = useTranslation();
  return (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {t(statusLabels[status])}
  </Badge>
  );
}

export const getStatusBadge = (status: ToolPart["state"]) => <ToolStatusBadge status={status} />;

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between gap-4 p-3",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <WrenchIcon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "flex flex-col gap-4 border-t p-3 text-popover-foreground data-[state=closed]:hidden",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const t = useTranslation();
  return (
  <div className={cn("flex flex-col gap-2 overflow-hidden", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {t("参数")}
    </h4>
    <div className="rounded-md bg-muted/50">
      <ToolCode text={typeof input === "string" ? input : JSON.stringify(input, null, 2)} />
    </div>
  </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  const t = useTranslation();
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <ToolCode text={JSON.stringify(output, null, 2)} />
    );
  } else if (typeof output === "string") {
    Output = <ToolCode text={output} />;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? t("错误") : t("结果")}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <ToolCode text={errorText} />}
        {Output}
      </div>
    </div>
  );
};

function ToolCode({ text }: { text: string }) {
  return (
    <CodeBlock size="sm">
      <CodeBlockHeader>
        <CodeBlockActions><CodeBlockCopyButton value={text} /></CodeBlockActions>
      </CodeBlockHeader>
      <CodeBlockContent wrap className="max-h-64">{text}</CodeBlockContent>
    </CodeBlock>
  );
}
