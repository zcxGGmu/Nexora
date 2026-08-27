import type { JSX } from "react";

import { StatePlane } from "./StatePlane.js";
import type { SharedStateProps } from "./LoadingState.js";

export function OfflineState(props: SharedStateProps): JSX.Element {
  return <StatePlane kind="offline" title={props.title} impact={props.impact} nextAction={props.nextAction} />;
}
