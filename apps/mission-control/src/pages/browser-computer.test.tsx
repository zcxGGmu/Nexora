import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { pageForRoute } from "../app/detail-pages.js";
import { buildRouteHref, parseRouteUrl } from "../app/router.js";
import { shouldUseBrowserComputerFallback } from "../app/browser-computer-api.js";
import { BrowserComputerPage, BrowserComputerPageContent, browserComputerFixture, type BrowserComputerControlView } from "./BrowserComputerPage.js";

describe("C23 Browser/Computer Use Mission Control surface", () => {
  it("shows sandbox allowlist approval action receipt and screenshot receipt facts", () => {
    const markup = renderToStaticMarkup(<BrowserComputerPage view={browserComputerFixture} />);

    expect(markup).toContain("Browser / Computer Use");
    expect(markup).toContain("Descriptor-only control");
    expect(markup).toContain("No real browser or desktop action");
    expect(markup).toContain("Sandbox policy");
    expect(markup).toContain("Allowlist");
    expect(markup).toContain("Human approval");
    expect(markup).toContain("Action receipts");
    expect(markup).toContain("Screenshot receipts");
  });

  it("wires Pause Resume Stop Takeover Acknowledge and Approve controls to control-plane callbacks", () => {
    const commands: string[] = [];
    const element = BrowserComputerPageContent({
      view: browserComputerFixture,
      onSessionCommand: (sessionId, command) => commands.push(`${command}:${sessionId}`),
      onApproveAction: (intentId) => commands.push(`approve:${intentId}`),
      onAcknowledgeReceipt: (receiptId) => commands.push(`ack:${receiptId}`),
    });

    clickButton(element, "Pause");
    clickButton(element, "Stop");
    clickButton(element, "Takeover");
    clickButton(element, "Approve");
    clickButton(element, "Acknowledge");

    const pausedView: BrowserComputerControlView = {
      ...browserComputerFixture,
      sessions: browserComputerFixture.sessions.map((session) => ({ ...session, status: "paused" })),
    };
    clickButton(BrowserComputerPageContent({
      view: pausedView,
      onSessionCommand: (sessionId, command) => commands.push(`${command}:${sessionId}`),
    }), "Resume");

    expect(commands).toEqual([
      `pause:${browserComputerFixture.selected.sessionId}`,
      `stop:${browserComputerFixture.selected.sessionId}`,
      `takeover:${browserComputerFixture.selected.sessionId}`,
      `approve:${browserComputerFixture.selected.intentId}`,
      `ack:${browserComputerFixture.selected.receiptId}`,
      `resume:${browserComputerFixture.selected.sessionId}`,
    ]);
  });

  it("routes the production Browser/Computer page by workspace instead of injecting the fixture", () => {
    const route = parseRouteUrl("http://nexora.local/browser-computer?workspace=ws-demo");
    const page = pageForRoute(route);

    expect(route.key).toBe("browser-computer");
    expect(buildRouteHref("browser-computer", route.urlState)).toBe("/browser-computer?workspace=ws-demo");
    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });

  it("keeps compact mobile navigation stable while adding Browser/Computer to system navigation", () => {
    const markup = renderToStaticMarkup(<BrowserComputerPage view={browserComputerFixture} />);

    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("word-break:break-all");
  });

  it("does not replace live API 5xx failures with plausible fixture data", () => {
    const serverError = { response: { status: 500 } };

    expect(shouldUseBrowserComputerFallback(serverError)).toBe(false);
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
  if (button === undefined) throw new Error(`Missing ${label} Browser/Computer action button`);
  expect(button.disabled).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${label} Browser/Computer action handler`);
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

const _viewShape: BrowserComputerControlView = browserComputerFixture;
void _viewShape;
