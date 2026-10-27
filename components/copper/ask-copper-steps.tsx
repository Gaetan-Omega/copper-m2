"use client";

// Ask Copper's "show your work" view: one answer drawn as stations on a
// vertical rail (the tools on offer, the thinking, each tool call, and what's
// happening now), then Copper's reply. Layout is described in
// specs/module-2/spec.md, section 5.
import {
  BrainIcon,
  ListChecksIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { formatUsd, getProducts } from "@/lib/copper/catalog";
import {
  type Progress,
  type ThinkingStep,
  type ToolStep,
  TOOL_LABELS,
  toolCallsOf,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

const TOOL_NAMES = Object.keys(TOOL_LABELS);

const LABEL =
  "text-xs font-semibold tracking-widest text-muted-foreground uppercase";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function productName(id: unknown): string {
  const found = getProducts().find((product) => product.id === id);
  return found ? found.name : String(id);
}

function planName(id: unknown): string {
  return id === "copper-plus"
    ? "Copper Plus"
    : id === "free"
      ? "Free"
      : String(id);
}

function dateLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Renders the **bold** and `code` marks in a thought summary. */
export function Markdown({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((piece, i) => {
        if (piece.startsWith("**") && piece.endsWith("**") && piece.length > 4)
          return <strong key={i}>{piece.slice(2, -2)}</strong>;
        if (piece.startsWith("`") && piece.endsWith("`") && piece.length > 2)
          return (
            <code key={i} className="font-mono text-[0.85em]">
              {piece.slice(1, -1)}
            </code>
          );
        return <span key={i}>{piece}</span>;
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// The rail and its stations
// ---------------------------------------------------------------------------

function Station({
  icon,
  nodeClass,
  label,
  children,
}: {
  icon: ReactNode;
  nodeClass: string;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative pb-4 pl-9 last:pb-0">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-6 items-center justify-center rounded-full text-white ring-4",
          nodeClass,
        )}
      >
        {icon}
      </span>
      {label && <p className={cn(LABEL, "leading-6")}>{label}</p>}
      {children}
    </li>
  );
}

function ToolsStation({
  used,
  withTools,
}: {
  used: Set<string>;
  withTools: boolean;
}) {
  if (!withTools) {
    return (
      <Station
        icon={<ListChecksIcon className="size-3.5" />}
        nodeClass="bg-chart-3"
        label="Tools given to Copper: none"
      >
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TOOL_NAMES.map((name) => (
            <span
              key={name}
              className="text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-xs line-through"
            >
              {name}
            </span>
          ))}
        </div>
        <p className="text-muted-foreground mt-1.5 text-xs">
          Copper has to answer from memory alone.
        </p>
      </Station>
    );
  }
  return (
    <Station
      icon={<ListChecksIcon className="size-3.5" />}
      nodeClass="bg-chart-5"
      label="Tools Copper can use"
    >
      <div className="mt-1 flex flex-wrap gap-1.5">
        {TOOL_NAMES.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-xs",
              used.has(name)
                ? "bg-accent text-accent-foreground font-bold"
                : "bg-muted text-muted-foreground",
            )}
          >
            {name}
          </span>
        ))}
      </div>
    </Station>
  );
}

function ThinkingStation({
  step,
  withTools,
}: {
  step: ThinkingStep;
  withTools: boolean;
}) {
  return (
    <Station
      icon={<BrainIcon className="size-3.5" />}
      nodeClass={withTools ? "bg-primary" : "bg-chart-3"}
      label="Copper is thinking"
    >
      <p
        data-testid="thinking"
        className="text-muted-foreground mt-1 border-l-2 pl-3 text-sm whitespace-pre-wrap italic"
      >
        <Markdown text={step.text} />
      </p>
    </Station>
  );
}

// ---------------------------------------------------------------------------
// The tool card: what Copper sent, and what came back
// ---------------------------------------------------------------------------

type Record_ = Record<string, unknown>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="text-muted-foreground w-16 shrink-0">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function SentList({ step }: { step: ToolStep }) {
  if (step.name === "get_prices")
    return <p className="text-sm">Nothing, it just asked for the price list</p>;
  if (step.name === "get_products")
    return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
  if (step.input === undefined)
    return (
      <p className="text-muted-foreground text-sm">filling in the details…</p>
    );
  const input = step.input as Record_;
  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products) ? input.products : [];
    return (
      <dl className="space-y-0.5">
        <Row label="Products">
          {products.length ? products.map(productName).join(", ") : "None"}
        </Row>
        <Row label="Plan">{planName(input.plan)}</Row>
        <Row label="Billing">{String(input.billing)}</Row>
        <Row label="Years">{String(input.years)}</Row>
      </dl>
    );
  }
  return (
    <dl className="space-y-0.5">
      <Row label="Product">{productName(input.product)}</Row>
      {input.color !== undefined && (
        <Row label="Color">{String(input.color)}</Row>
      )}
    </dl>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

function BackList({ step }: { step: ToolStep }) {
  const out = step.output as Record_;
  if (step.state === "error" || typeof step.output === "string")
    return (
      <p className="text-destructive text-sm">
        {typeof step.output === "string" ? step.output : "The tool failed."}
      </p>
    );

  if (step.name === "calculate_cost") {
    const lines = (out.lines as { item: string; usd: number }[]) ?? [];
    return (
      <div className="space-y-1 text-sm">
        {lines.map((line) => (
          <div key={line.item} className="flex justify-between gap-3">
            <span>{line.item}</span>
            <span className="tabular-nums">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t pt-1">
          <span className="font-semibold">Total</span>
          <span className="text-primary text-xl font-bold tabular-nums">
            {formatUsd(out.totalUsd as number)}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    const products =
      (out.products as {
        id: string;
        name: string;
        type: string;
        priceUsd: number;
        colors: string[];
      }[]) ?? [];
    return (
      <div className="space-y-2">
        {products.map((product) => (
          <div key={product.id}>
            <p className="flex justify-between text-sm font-medium">
              <span>{product.name}</span>
              <span>{formatUsd(product.priceUsd)}</span>
            </p>
            <p className="text-muted-foreground text-xs">{product.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors.map((color) => (
                <Pill key={color} className="bg-accent/30">
                  {color}
                </Pill>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.name === "get_prices") {
    const products =
      (out.products as { id: string; name: string; priceUsd: number }[]) ?? [];
    const plans =
      (out.plans as {
        id: string;
        name: string;
        monthlyUsd: number;
        annualUsd: number;
      }[]) ?? [];
    return (
      <div className="space-y-1 text-sm">
        {products.map((product) => (
          <p key={product.id} className="flex justify-between">
            <span>{product.name}</span>
            <span>{formatUsd(product.priceUsd)}</span>
          </p>
        ))}
        {plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <p key={plan.id} className="flex justify-between">
              <span>{plan.name}</span>
              <span>
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </p>
          ))}
      </div>
    );
  }

  // check_availability
  if (out.status === "not_a_color")
    return (
      <p className="text-sm">
        {String(out.product)} doesn&apos;t come in {String(out.color)}. Its
        colors are {(out.colors as string[]).join(", ")}.
      </p>
    );
  if (out.status === "unavailable")
    return <p className="text-sm">{String(out.message)}</p>;
  const colors =
    (out.colors as {
      color: string;
      stock: string;
      restockDate: string | null;
    }[]) ?? [];
  return (
    <div className="space-y-1 text-sm">
      {colors.map((row) => (
        <div
          key={row.color}
          className="flex items-center justify-between gap-3"
        >
          <span>{row.color}</span>
          {row.stock === "in_stock" ? (
            <Pill className="bg-accent text-accent-foreground">In stock</Pill>
          ) : row.stock === "low_stock" ? (
            <Pill className="bg-chart-4 text-chart-5">Low stock</Pill>
          ) : (
            <Pill className="bg-chart-3 text-chart-5">
              Back-ordered
              {row.restockDate ? ` until ${dateLabel(row.restockDate)}` : ""}
            </Pill>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-card mt-1.5 overflow-hidden rounded-lg border"
    >
      <div className="bg-accent text-accent-foreground flex items-center justify-between gap-2 px-3 py-1.5">
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">{step.name}()</span>
          <span className="bg-background/40 rounded-full px-1.5 text-xs">
            tool {number}
          </span>
        </span>
        <span className="text-xs">{TOOL_LABELS[step.name] ?? step.name}</span>
      </div>
      <div className="space-y-1 px-3 py-2">
        <p className={LABEL}>
          <span aria-hidden>→ </span>What Copper sent
        </p>
        <SentList step={step} />
      </div>
      <div className="bg-accent/10 space-y-1 border-t px-3 py-2">
        <p className={LABEL}>
          <span aria-hidden>← </span>What came back
        </p>
        {step.state === "calling" || step.output === undefined ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-3.5" />
            the app is running the code…
          </p>
        ) : (
          <BackList step={step} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One whole answer
// ---------------------------------------------------------------------------

function nowLabel(progress: Progress, withTools: boolean): string {
  if (progress.reply) return "Writing the answer…";
  if (!withTools) return "Answering from memory…";
  if (progress.steps.length) return "Deciding what to do next…";
  return "Reading your question…";
}

export function AnswerSteps({
  progress,
  withTools,
}: {
  progress: Progress;
  withTools: boolean;
}) {
  const used = new Set(toolCallsOf(progress).map((call) => call.name));
  const working = progress.status === "working";
  let toolNumber = 0;
  const numbered = progress.steps.map((step) =>
    step.type === "tool" ? ++toolNumber : 0,
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <span
          aria-hidden
          className={cn(
            "absolute top-3 bottom-3 left-[11px] w-0.5 rounded-full",
            withTools
              ? "from-primary via-accent to-accent bg-gradient-to-b"
              : "bg-chart-3",
          )}
        />
        <ol className="relative">
          <ToolsStation used={used} withTools={withTools} />
          {progress.steps.map((step, i) =>
            step.type === "thinking" ? (
              <ThinkingStation key={i} step={step} withTools={withTools} />
            ) : (
              <Station
                key={step.id}
                icon={<WrenchIcon className="size-3.5" />}
                nodeClass="bg-accent"
                label={
                  step.state === "calling"
                    ? "Copper is calling a tool"
                    : "Copper called a tool"
                }
              >
                <ToolCard step={step} number={numbered[i]} />
              </Station>
            ),
          )}
          {working && (
            <Station
              icon={
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-1 animate-bounce rounded-full bg-white"
                      style={{ animationDelay: `${dot * 120}ms` }}
                    />
                  ))}
                </span>
              }
              nodeClass={withTools ? "bg-primary" : "bg-chart-3"}
            >
              <p className="text-muted-foreground text-sm leading-6">
                {nowLabel(progress, withTools)}
              </p>
            </Station>
          )}
        </ol>
      </div>

      {progress.reply && (
        <div className="bg-card ml-9 rounded-xl rounded-tl-sm border p-3 shadow-sm">
          <p className="text-primary mb-1 flex items-center gap-1 text-xs font-semibold">
            <SparklesIcon className="size-3" />
            Copper
          </p>
          {!withTools && (
            <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border p-2 text-xs">
              <p className="font-semibold">
                <span aria-hidden>⚠ </span>Answered without tools: may be made
                up
              </p>
              <p className="text-muted-foreground mt-0.5">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="text-sm whitespace-pre-wrap">
            <Markdown text={progress.reply} />
            {working && (
              <span aria-hidden className="animate-pulse">
                ▍
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
