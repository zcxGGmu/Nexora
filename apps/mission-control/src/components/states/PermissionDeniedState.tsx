import type { JSX } from "react";

import { StatePlane } from "./StatePlane.js";
import type { SharedStateProps } from "./LoadingState.js";

export function PermissionDeniedState(props: SharedStateProps): JSX.Element {
  return <StatePlane kind="permission" title={props.title} impact={props.impact} nextAction={props.nextAction} />;
}
