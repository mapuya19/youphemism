import type { Action, ClientView } from "@/lib/types";

export interface PhaseProps {
  view: ClientView;
  send: (action: Action) => Promise<void>;
  secondsLeft?: number | null;
}
