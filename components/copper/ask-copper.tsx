"use client";

// Ask Copper: a floating chat panel that answers price and stock questions
// with tools, and shows its work as it goes. Tools on and tools off are two
// separate conversations. Layout is in specs/module-2/spec.md, sections 4-5.
import { ArrowUpIcon, MessageCircleIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerSteps } from "@/components/copper/ask-copper-steps";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import type { Progress } from "@/lib/copper/assistant/progress";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const APOLOGY =
  "Sorry, something went wrong on my side. Please try again, or ask the Copper Crew.";

type Turn = { id: number; question: string; progress: Progress };
type Chats = { on: Turn[]; off: Turn[] };

/** The conversation so far as the model should see it: questions and finished replies. */
function historyOf(turns: Turn[]): ChatMessage[] {
  return turns.flatMap((turn): ChatMessage[] => [
    { role: "user", content: turn.question },
    ...(turn.progress.reply
      ? [{ role: "assistant" as const, content: turn.progress.reply }]
      : []),
  ]);
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const nextId = useRef(0);
  const body = useRef<HTMLDivElement>(null);

  const key = useTools ? "on" : "off";
  const turns = chats[key];
  const busy = turns.some((turn) => turn.progress.status === "working");

  // Open from the header link (every click: a second click on "#ask" fires no
  // hashchange) and when the site loads at /#ask.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    const onHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    onHash();
    document.addEventListener("click", onClick);
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  // Keep the newest step in view.
  useEffect(() => {
    const el = body.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chats, key, open]);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      const mode = useTools ? "on" : "off";
      const id = nextId.current++;
      const messages: ChatMessage[] = [
        ...historyOf(chats[mode]),
        { role: "user", content: text },
      ];
      const show = (progress: Progress) =>
        setChats((current) => ({
          ...current,
          [mode]: current[mode].map((turn) =>
            turn.id === id ? { ...turn, progress } : turn,
          ),
        }));

      setDraft("");
      setChats((current) => ({
        ...current,
        [mode]: [
          ...current[mode],
          {
            id,
            question: text,
            progress: { steps: [], reply: "", status: "working" },
          },
        ],
      }));
      try {
        const { progress } = await askCopper({ messages, useTools });
        for await (const update of readLive(progress)) show(update);
      } catch {
        show({ steps: [], reply: APOLOGY, status: "error" });
      }
    },
    [busy, chats, useTools],
  );

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-11 rounded-full px-4 shadow-lg"
      >
        <MessageCircleIcon />
        Ask Copper
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton={false}
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <header className="bg-chart-5 text-white">
            <div className="flex items-center gap-3 p-4">
              <span className="bg-primary text-chart-5 flex size-9 shrink-0 items-center justify-center rounded-full">
                <SparklesIcon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base text-white">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-xs text-white/75">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                >
                  <span aria-hidden>✕</span>
                  <span className="sr-only">Close</span>
                </Button>
              </SheetClose>
            </div>
            <div className="flex items-center justify-between gap-3 bg-white/10 px-4 py-2">
              <div>
                <p className="text-sm font-medium">Use tools</p>
                <p className="text-xs text-white/75">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </p>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          </header>

          {aiConfigured ? (
            <>
              <div
                ref={body}
                className="bg-secondary flex-1 space-y-5 overflow-y-auto p-4"
              >
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <p className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm px-3 py-2 text-sm">
                      {turn.question}
                    </p>
                    <AnswerSteps
                      progress={turn.progress}
                      withTools={useTools}
                    />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2">
                    {turns.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        Hi, I&apos;m Copper! Ask me about prices and stock.
                      </p>
                    )}
                    {STARTERS.map((starter) => (
                      <Button
                        key={starter}
                        variant="outline"
                        onClick={() => send(starter)}
                        className="h-auto max-w-full justify-start rounded-xl px-3 py-2 text-left whitespace-normal"
                      >
                        {starter}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <Input
                  aria-label="Your question"
                  placeholder="Ask about prices or stock…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  className="h-10 rounded-full px-4"
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send"
                  disabled={busy}
                  className="size-10 rounded-full"
                >
                  <ArrowUpIcon />
                </Button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto p-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
