import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventSummaryPanel } from "./EventSummaryPanel";
import type { EventDetailDTO } from "@shared/dto";

const event = {
  id: 1,
  slug: "test-event",
  title: "Test Event",
  eventDate: "2011-05-14",
  datePrecision: "exact",
  summary: "The existing summary stays readable.",
  narrativesEnabled: true,
  annotations: [],
  mediaItems: [],
} as unknown as EventDetailDTO;

function render(status: "pending" | "processing" | "complete") {
  return renderToStaticMarkup(createElement(EventSummaryPanel, {
    event: { ...event, summaryJob: { status, requestedVersion: 2, completedVersion: status === "complete" ? 2 : 1, errorCode: null } },
    canUpload: false,
    isEditor: false,
    onReload: () => {},
  }));
}

describe("event summary on page load", () => {
  it("keeps an existing queued update from covering the summary", () => {
    const html = render("pending");
    expect(html).toContain("The existing summary stays readable.");
    expect(html).toContain("Summary update is queued.");
    expect(html).not.toContain("Updating…");
  });

  it("reports an active background update without the overlay", () => {
    const html = render("processing");
    expect(html).toContain("running in the background");
    expect(html).not.toContain("Updating…");
  });

  it("shows no update notice for completed work", () => {
    const html = render("complete");
    expect(html).not.toContain("Summary update is queued.");
    expect(html).not.toContain("Updating…");
  });

  it("shows a delayed notice for an expired worker lease", () => {
    const html = renderToStaticMarkup(createElement(EventSummaryPanel, {
      event: { ...event, summaryJob: { status: "failed", requestedVersion: 2, completedVersion: 1,
        errorCode: "LEASE_EXPIRED" } },
      canUpload: false, isEditor: true, onReload: () => {},
    }));
    expect(html).toContain("Summary update is delayed; waiting to retry.");
    expect(html).not.toContain("Updating…");
    expect(html).not.toContain("running in the background");
  });

  it("offers a retry when an old pending job has expired", () => {
    const html = renderToStaticMarkup(createElement(EventSummaryPanel, {
      event: { ...event, summaryJob: { status: "failed", requestedVersion: 2, completedVersion: 1,
        errorCode: "QUEUE_EXPIRED" } },
      canUpload: false, isEditor: true, onReload: () => {},
    }));
    expect(html).toContain("queued summary update expired");
    expect(html).toContain("Retry summary update");
    expect(html).not.toContain("Updating…");
  });
});
