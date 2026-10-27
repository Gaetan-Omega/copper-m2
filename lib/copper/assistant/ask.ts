"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

const NO_ANSWER =
  "Sorry, I couldn't come up with an answer. Please try again, or ask the Copper Crew.";
const FAILED =
  "Sorry, something went wrong on my side. Please try again, or ask the Copper Crew.";

/** A fresh copy of the progress, so earlier updates never change under the panel. */
function snapshot(
  steps: Step[],
  reply: string,
  status: Progress["status"],
): Progress {
  return { steps: steps.map((step) => ({ ...step })), reply, status };
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();
  const steps: Step[] = [];
  let reply = "";

  const toolStep = (id: string) =>
    steps.find((step) => step.type === "tool" && step.id === id);

  // Return straight away; the stream is read in the background.
  void (async () => {
    try {
      const messages = request.messages.map(({ role, content }) => ({
        role,
        content,
      }));
      // With tools off, the model gets just the conversation: no instructions
      // and no tools, so it has to answer from memory alone.
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        request.useTools
          ? {
              instructions: COPPER_INSTRUCTIONS,
              messages,
              tools: copperTools,
              stopWhen: stepCountIs(MAX_STEPS),
              providerOptions: THOUGHT_SUMMARIES,
            }
          : { messages, providerOptions: THOUGHT_SUMMARIES },
      );

      for await (const part of result.fullStream) {
        if (part.type === "reasoning-delta") {
          const last = steps.at(-1);
          if (last?.type === "thinking") last.text += part.text;
          else steps.push({ type: "thinking", text: part.text });
        } else if (part.type === "tool-input-start") {
          steps.push({
            type: "tool",
            id: part.id,
            name: part.toolName,
            state: "calling",
          });
        } else if (part.type === "tool-call") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") step.input = part.input;
        } else if (part.type === "tool-result") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") {
            step.output = part.output;
            step.state = "done";
          }
        } else if (part.type === "tool-error") {
          const step = toolStep(part.toolCallId);
          if (step?.type === "tool") {
            step.output =
              part.error instanceof Error
                ? part.error.message
                : String(part.error);
            step.state = "error";
          }
        } else if (part.type === "text-delta") {
          reply += part.text;
        } else if (part.type === "error") {
          throw part.error;
        } else {
          continue;
        }
        update(snapshot(steps, reply, "working"));
      }
      // Only replace an empty reply, never add to a real one.
      done(snapshot(steps, reply.trim() ? reply : NO_ANSWER, "done"));
    } catch {
      done(snapshot(steps, reply || FAILED, "error"));
    }
  })();

  return { progress: live };
}
