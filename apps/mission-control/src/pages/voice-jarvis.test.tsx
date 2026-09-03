import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { pageForRoute } from "../app/detail-pages.js";
import { buildRouteHref, parseRouteUrl } from "../app/router.js";
import { VoiceJarvisPage, VoiceJarvisPageContent, voiceJarvisFixture, type VoiceJarvisControlView } from "./VoiceJarvisPage.js";

describe("C24 Voice/Jarvis Mission Control surface", () => {
  it("shows audio policy wake word transcript lifecycle and descriptor-only boundary facts", () => {
    const markup = renderToStaticMarkup(<VoiceJarvisPage view={voiceJarvisFixture} />);

    expect(markup).toContain("Voice / Jarvis");
    expect(markup).toContain("Descriptor-only voice control");
    expect(markup).toContain("No microphone");
    expect(markup).toContain("No external connection");
    expect(markup).toContain("Audio policy");
    expect(markup).toContain("Wake word");
    expect(markup).toContain("Transcripts");
    expect(markup).toContain("Command facts");
    expect(markup).not.toContain("<table");
  });

  it("wires Wake Interrupt Pause Resume Delete transcript and Export transcript controls", () => {
    const commands: string[] = [];
    const element = VoiceJarvisPageContent({
      view: voiceJarvisFixture,
      onSessionCommand: (sessionId, command) => commands.push(`${command}:${sessionId}`),
      onTranscriptCommand: (transcriptId, command) => commands.push(`${command}:${transcriptId}`),
    });

    clickButton(element, "Wake");
    clickButton(element, "Interrupt");
    clickButton(element, "Pause");
    clickButton(element, "Delete transcript");
    clickButton(element, "Export transcript");

    const pausedView: VoiceJarvisControlView = {
      ...voiceJarvisFixture,
      sessions: voiceJarvisFixture.sessions.map((session) => ({ ...session, status: "paused" })),
    };
    clickButton(VoiceJarvisPageContent({ view: pausedView, onSessionCommand: (sessionId, command) => commands.push(`${command}:${sessionId}`) }), "Resume");

    expect(commands).toEqual([
      `wake:${voiceJarvisFixture.selected.sessionId}`,
      `interrupt:${voiceJarvisFixture.selected.sessionId}`,
      `pause:${voiceJarvisFixture.selected.sessionId}`,
      `delete_transcript:${voiceJarvisFixture.selected.transcriptId}`,
      `export_transcript:${voiceJarvisFixture.selected.transcriptId}`,
      `resume:${voiceJarvisFixture.selected.sessionId}`,
    ]);
  });

  it("routes the production Voice/Jarvis page by workspace instead of injecting the fixture", () => {
    const route = parseRouteUrl("http://nexora.local/voice-jarvis?workspace=ws-demo");
    const page = pageForRoute(route);

    expect(route.key).toBe("voice-jarvis");
    expect(buildRouteHref("voice-jarvis", route.urlState)).toBe("/voice-jarvis?workspace=ws-demo");
    expect(page).toMatchObject({ props: { workspaceId: "ws-demo" } });
    expect(page).not.toMatchObject({ props: { view: expect.anything() } });
  });

  it("disables transcript lifecycle controls after delete or export is requested", () => {
    const requestedStatus: VoiceJarvisControlView["transcripts"]["items"][number]["lifecycleStatus"] = "delete_requested";
    const requestedView: VoiceJarvisControlView = {
      ...voiceJarvisFixture,
      transcripts: {
        ...voiceJarvisFixture.transcripts,
        retained: 0,
        deleteRequested: 1,
        items: voiceJarvisFixture.transcripts.items.map((transcript) => ({ ...transcript, lifecycleStatus: requestedStatus })),
      },
    };

    const element = VoiceJarvisPageContent({ view: requestedView, onTranscriptCommand: () => undefined });

    expect(findButton(element, "Delete transcript")?.disabled).toBe(true);
    expect(findButton(element, "Export transcript")?.disabled).toBe(true);
  });

  it("keeps mobile layout compact while adding Voice/Jarvis to system navigation", () => {
    const markup = renderToStaticMarkup(<VoiceJarvisPage view={voiceJarvisFixture} />);

    expect(markup).not.toContain("word-break:break-all");
    expect(markup).toContain("Jarvis wall mode control session");
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
  if (button === undefined) throw new Error(`Missing ${label} Voice/Jarvis action button`);
  expect(button.disabled).toBe(false);
  const onClick = button.onClick;
  if (onClick === undefined) throw new Error(`Missing ${label} Voice/Jarvis action handler`);
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

const _viewShape: VoiceJarvisControlView = voiceJarvisFixture;
void _viewShape;
