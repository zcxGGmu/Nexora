import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { pageForRoute } from "../app/detail-pages.js";
import { parseRouteUrl } from "../app/router.js";
import { JournalPage, JournalPageContent, journalControlFixture, type JournalControlView, type WritebackUiDecision } from "./JournalPage.js";

describe("JournalPage", () => {
  it("shows vault graph daily journal memory candidate and writeback approval facts", () => {
    const markup = renderToStaticMarkup(<JournalPage view={journalControlFixture} />);

    expect(markup).toContain("Journal &amp; Vault");
    expect(markup).toContain("Descriptor-only vault bridge");
    expect(markup).toContain("No external connection");
    expect(markup).toContain("read_only");
    expect(markup).toContain("Graph/FTS index");
    expect(markup).toContain("Daily journal");
    expect(markup).toContain("Memory candidates");
    expect(markup).toContain("Writeback approval");
  });

  it("wires Request writeback Approve and Reject controls to control-plane callbacks", () => {
    const commands: string[] = [];
    const element = JournalPageContent({
      view: journalControlFixture,
      writebackInput: { target_ref: "workspace://vaults/demo/Journal/2026-09-02.md", diff_hash: journalControlFixture.selected.diffHash, reason: "Stage reviewed diff", expected_target_revision: 3 },
      onRequestWriteback: (input, candidateId) => commands.push(`request:${candidateId}:${input.target_ref}`),
      onWritebackDecision: (requestId, decision) => commands.push(`${decision}:${requestId}`),
    });

    clickButton(element, "Request writeback");
    clickButton(element, "Approve");
    clickButton(element, "Reject");

    expect(commands).toEqual([
      `request:${journalControlFixture.selected.candidateId}:workspace://vaults/demo/Journal/2026-09-02.md`,
      `${"approve" satisfies WritebackUiDecision}:${journalControlFixture.writebackRequests[0]?.id}`,
      `reject:${journalControlFixture.writebackRequests[0]?.id}`,
    ]);
  });

  it("routes the production Journal page by workspace instead of injecting the fixture", () => {
    const page = pageForRoute(parseRouteUrl("http://nexora.local/journal?workspace=ws-demo"));

    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });

  it("keeps the five-item mobile navigation stable while adding Journal to system navigation", () => {
    const route = parseRouteUrl("http://nexora.local/journal?workspace=ws-demo");

    expect(route.key).toBe("journal");
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
  if (button === undefined) throw new Error(`Missing ${label} Journal action button`);
  expect(button.disabled).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${label} Journal action handler`);
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

const _viewShape: JournalControlView = journalControlFixture;
void _viewShape;
