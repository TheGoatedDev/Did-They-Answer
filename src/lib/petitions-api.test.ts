import { describe, expect, it, vi } from "vitest";
import archivedPage from "./__fixtures__/archived-page.json";
import currentPage from "./__fixtures__/current-page.json";
import { fetchPetitionPage, sourceUrl, toRow } from "./petitions-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("fetchPetitionPage", () => {
  it("parses a current page and keeps the raw record", async () => {
    const fetch = vi.fn(async () => json(currentPage));
    const page = await fetchPetitionPage("https://x/p", { fetch });

    expect(page.next).toBe(currentPage.links.next);
    expect(page.petitions).toHaveLength(3);
    expect(page.petitions[0].raw).toEqual(currentPage.data[0]);
  });

  it("parses archived records, which lack some current-only fields", async () => {
    const fetch = vi.fn(async () => json(archivedPage));
    const page = await fetchPetitionPage("https://x/p", { fetch });

    expect(
      page.petitions[0].petition.attributes.debate?.transcript_url,
    ).toMatch(/^https:\/\/hansard/);
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(currentPage));
    const sleep = vi.fn(async () => {});

    await fetchPetitionPage("https://x/p", { fetch, sleep });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 404", async () => {
    const fetch = vi.fn(async () => json({}, 404));
    await expect(
      fetchPetitionPage("https://x/p", { fetch, sleep: async () => {} }),
    ).rejects.toThrow("404");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a record that does not match the schema", async () => {
    const broken = { ...currentPage, data: [{ id: "nope" }] };
    const fetch = vi.fn(async () => json(broken));
    await expect(fetchPetitionPage("https://x/p", { fetch })).rejects.toThrow();
  });
});

describe("toRow", () => {
  it("maps the government response and blanks empty additional details", async () => {
    const page = await fetchPetitionPage("https://x/p", {
      fetch: async () => json(archivedPage),
    });
    const row = toRow(page.petitions[0], "2015-17");

    expect(row.parliament).toBe("2015-17");
    expect(row.respondedOn).toBe("2016-07-08");
    expect(row.responseDetails?.length).toBeGreaterThan(0);
    expect(row.additionalDetails).toBeNull();
  });
});

describe("sourceUrl", () => {
  it("links archived petitions to the archive", () => {
    expect(sourceUrl(1, "2024-")).toBe(
      "https://petition.parliament.uk/petitions/1",
    );
    expect(sourceUrl(1, "2019-24")).toBe(
      "https://petition.parliament.uk/archived/petitions/1",
    );
  });
});
