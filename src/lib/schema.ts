import { z } from "zod";
import {
  MAX_DEFINITION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SLANG_LENGTH,
  MAX_STORY_LENGTH,
  type Action,
} from "@/lib/types";

/**
 * Every client payload is validated at the edge of the system so the engine can
 * assume well-formed input.
 */
export const actionSchema: z.ZodType<Action> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join"),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
    avatar: z.number().int().min(0).max(63),
  }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("heartbeat") }),
  z.object({
    type: z.literal("update_settings"),
    settings: z
      .object({
        coinSeconds: z.number().int(),
        storySeconds: z.number().int(),
        voteSeconds: z.number().int(),
        coinVotePoints: z.number().int(),
        storyVotePoints: z.number().int(),
        callbackPoints: z.number().int(),
      })
      .partial(),
  }),
  z.object({ type: z.literal("start_game") }),
  z.object({
    type: z.literal("submit_slang"),
    categoryId: z.string().min(1).max(32),
    term: z.string().min(1).max(MAX_SLANG_LENGTH),
    definition: z.string().min(1).max(MAX_DEFINITION_LENGTH),
  }),
  z.object({
    type: z.literal("submit_story"),
    text: z.string().min(1).max(MAX_STORY_LENGTH),
  }),
  z.object({ type: z.literal("vote"), targetId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("unvote") }),
  z.object({ type: z.literal("advance") }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("kick"), playerId: z.string().min(1).max(64) }),
]);
