import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import { GatewayPage, GatewayPageContent, gatewayControlFixture, type GatewayControlView } from "./GatewayPage.js";

describe("GatewayPage", () => {
  it("shows declared gateway, channel, session, cursor, delivery and allowlist facts", () => {
    const markup = renderToStaticMarkup(<GatewayPage view={gatewayControlFixture} />);
    expect(markup).toContain("Gateway, Channels &amp; Sessions");
    expect(markup).toContain("Descriptor and control-plane state only");
    expect(markup).toContain("cursor:42");
    expect(markup).toContain("delivered");
    expect(markup).toContain("deny_by_default");
  });

  it("wires Pause, Steer, and Acknowledge controls to control-plane callbacks", () => {
    const commands: string[] = [];
    const session = requiredSession(gatewayControlFixture);
    const view: GatewayControlView = {
      ...gatewayControlFixture,
      sessions: [{ ...session, acknowledgement: { message_id: "01TRZ3NDEKTSV4RRFFQ69G5FAV" } }],
    };
    const element = GatewayPageContent({
      view,
      onAcknowledge: (sessionId, messageId) => commands.push(`ack:${sessionId}:${messageId}`),
      onSessionCommand: (sessionId, kind) => commands.push(`${kind}:${sessionId}`),
    });

    clickButton(element, "Pause");
    clickButton(element, "Steer");
    clickButton(element, "Acknowledge");

    expect(commands).toEqual([
      "pause:01SRZ3NDEKTSV4RRFFQ69G5FAV",
      "steer:01SRZ3NDEKTSV4RRFFQ69G5FAV",
      "ack:01SRZ3NDEKTSV4RRFFQ69G5FAV:01TRZ3NDEKTSV4RRFFQ69G5FAV",
    ]);
  });

  it("routes the production Gateway page by workspace instead of injecting the fixture", () => {
    const page = pageForRoute(parseRouteUrl("http://nexora.local/gateway?workspace=ws-demo"));

    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });

  it("routes readable workspaces into the live Gateway page instead of an invalid-scope fixture", () => {
    const page = pageForRoute(parseRouteUrl("http://nexora.local/gateway?workspace=ws-a"));

    expect(page).toMatchObject({ props: { workspaceId: "ws-a" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });
});

type ButtonProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children?: ReactNode;
};

function clickButton(node: ReactNode, label: string): void {
  const button = findButton(node, label);
  if (button === undefined) throw new Error(`Missing ${label} Gateway action button`);
  expect(button.disabled).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${label} Gateway action handler`);
  onClick();
}

function findButton(node: ReactNode, label: string): ButtonProps | undefined {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findButton(child, label);
      if (match !== undefined) return match;
    }
    return undefined;
  }
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (node.type === "button" && node.props.className === "row-action" && textFromNode(node.props.children).includes(label)) return node.props;
  return findButton(node.props.children, label);
}

function textFromNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => textFromNode(child)).join("");
  if (isValidElement<ButtonProps>(node)) return textFromNode(node.props.children);
  return "";
}

function requiredSession(view: GatewayControlView): GatewayControlView["sessions"][number] {
  const session = view.sessions[0];
  if (session === undefined) throw new Error("Gateway fixture requires a session");
  return session;
}
