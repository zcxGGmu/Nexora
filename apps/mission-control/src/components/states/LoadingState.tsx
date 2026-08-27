import type { JSX } from "react";

import { StatePlane } from "./StatePlane.js";

export type SharedStateProps = {
  readonly title: string;
  readonly impact: string;
  readonly nextAction: string;
};

export function LoadingState(props: SharedStateProps): JSX.Element {
  return <StatePlane kind="loading" title={props.title} impact={props.impact} nextAction={props.nextAction} />;
}
