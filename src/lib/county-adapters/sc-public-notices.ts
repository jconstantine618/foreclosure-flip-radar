import logger from "@/lib/logger";
import { BaseCountyAdapter } from "./base-adapter";
import type { RawNoticeRecord, NormalizedNotice } from "./types";
import { normalizeAddress, normalizeName, normalizeCounty } from "./normalizer";

// ---------------------------------------------------------------------------
// South Carolina Public Notices Adapter
// Searches scpublicnotices.com for foreclosure-related notices across
// configured counties.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://www.scpublicnotices.com";

const FORECLOSURE_KEYWORDS = [
  "foreclosure",
  "master in equity",
  "notice of sale",
  "upset bid",
  "judicial sale",
  "tax sale",
  "delinquent tax",
  "lis pendens",
];

export class SCPublicNoticesAdapter extends BaseCountyAdapter {
  readonly name = "sc-public-notices";
  readonly county = "ALL"; // multi-county adapter
  readonly state = "SC";

  /** Counties to include. Empty = all SC counties. */
  private countyFilter: string[];

  constructor(
    config: {
      baseUrl?: string;
      enabled?: boolean;
      counties?: string[];
    } = {},
  ) {
    super({
      county: "ALL",
      state: "SC",
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      enabled: config.enabled ?? true,
      refreshIntervalMinutes: 120,
    });
    this.countyFilter = (config.counties ?? []).map((c) =>
      normalizeCounty(c),
    );
  }

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  async fetchNotices(
    options?: { since?: Date },
  ): Promise<RawNoticeRecord[]> {
    const baseUrl = this.config.baseUrl!;
    logger.info({ adapter: this.name, countyFilter: this.countyFilter }, `Fetching SC public notices from ${baseUrl}`);

    const allowed = await this.checkRobotsTxt(baseUrl);
    if (!allowed) {
      logger.warn({ adapter: this.name }, "Blocked by robots.txt — skipping");
      return [];
    }

    const allRecords: RawNoticeRecord[] = [];

    // Fetch the search/listing pages for foreclosure notices
    for (const keyword of FORECLOSURE_KEYWORDS) {
      try {
        const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(keyword)}&type=foreclosure`;
        const html = await this.fetchWithRetry(searchUrl);
        const records = this.extractFromSearchResults(html, keyword);
        allRecords.push(...records);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          { adapter: this.name },
          `Failed to fetch notices for keyword "${keyword}": ${message}`,
        );
      }
    }

    // De-duplicate by case number
    const seen = new Set<string>();
    const deduplicated = allRecords.filter((r) => {
      const key = r.caseNumber ?? `${r.address ?? ""}|${r.saleDate ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply county filter
    let filtered = deduplicated;
    if (this.countyFilter.length > 0) {
      filtered = deduplicated.filter((r) => {
        if (!r.county) return false;
        return this.countyFilter.includes(normalizeCounty(r.county));
      });
    }

    // Apply date filter
    if (options?.since) {
      const cutoff = options.since.getTime();
      filtered = filtered.filter((r) => {
        if (!r.publishedDate && !r.saleDate) return true;
        const dateStr = r.publishedDate ?? r.saleDate;
        const d = new Date(dateStr!).getTime();
        return !isNaN(d) && d >= cutoff;
      });
    }

    logger.info(
      { adapter: this.name },
      `Extracted ${filtered.length} SC public notice records (${deduplicated.length} total before county filter)`,
    );
    return filtered;
  }

  // -------------------------------------------------------------------------
  // Extract records from search result HTML
  // -------------------------------------------------------------------------

  private extractFromSearchResults(
    html: string,
    keyword: string,
  ): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];

    // Public notice sites typically list notices in card/div blocks or tables
    // Try structured listing first
    const listingRegex =
      /<(?:div|article|li)[^>]*class="[^"]*(?:notice|listing|result)[^"]*"[^>]*>([\s\S]*?)(?:<\/(?:div|article|li)>)/gi;

    let match: RegExpExecArray | null;
    while ((match = listingRegex.exec(html)) !== null) {
      const block = match[1];
      const record = this.parseNoticeBlock(block, keyword);
      if (record) records.push(record);
    }

    // If no structured listings found, try table
    if (records.length === 0) {
      const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
      if (tableMatch) {
        const rows = this.parseHtmlTable(tableMatch[0]);
        for (const cells of rows.slice(1)) {
          if (cells.length < 2) continue;
          const record = this.parseTableRow(cells, keyword);
          if (record) records.push(record);
        }
      }
    }

    // If still nothing, try to parse as free-text blocks separated by
    // horizontal rules or headings
    if (records.length === 0) {
      const blocks = html.split(/<hr[^>]*>|<h[2-4][^>]*>/i);
      for (const block of blocks) {
        const record = this.parseNoticeBlock(block, keyword);
        if (record) records.push(record);
      }
    }

    return records;
  }

  private parseNoticeBlock(
    block: string,
    keyword: string,
  ): RawNoticeRecord | null {
    const text = this.stripHtml(block);

    // Must contain some foreclosure-related language to be relevant
    const lowerText = text.toLowerCase();
    const isRelevant = FORECLOSURE_KEYWORDS.some((kw) =>
      lowerText.includes(kw),
    );
    if (!isRelevant && !lowerText.includes(keyword.toLowerCase())) {
      return null;
    }

    const caseMatch = text.match(
      /(?:case|docket)\s*(?:#|no\.?|number)?\s*[:.]?\s*(\d{4}-[A-Z]{2,4}-\d+[\w.-]*)/i,
    );
    const dateMatch = text.match(
      /(?:sale\s+date|date\s+of\s+sale|auction\s+date)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    const publishedMatch = text.match(
      /(?:published|posted|date)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    const addressMatch = text.match(
      /(?:property\s+address|address|location|premises)\s*[:.]?\s*([^\n]+)/i,
    );
    const countyMatch = text.match(
      /(?:county)\s*[:.]?\s*([A-Za-z]+)/i,
    ) ?? text.match(/\b([A-Za-z]+)\s+County\b/i);
    const plaintiffMatch = text.match(
      /(?:plaintiff|petitioner)\s*[:.]?\s*([^\n]+)/i,
    );
    const defendantMatch = text.match(
      /(?:defendant|respondent)\s*[:.]?\s*([^\n]+)/i,
    );

    // Must have at least a case number or an address
    if (!caseMatch && !addressMatch) return null;

    // Extract the link to the full notice if present
    const linkMatch = block.match(/href="([^"]+)"/i);

    return {
      caseNumber: caseMatch?.[1]?.trim(),
      saleDate: dateMatch?.[1]?.trim(),
      publishedDate: publishedMatch?.[1]?.trim(),
      address: addressMatch?.[1]?.trim(),
      county: countyMatch?.[1]?.trim(),
      plaintiff: plaintiffMatch?.[1]?.trim(),
      defendant: defendantMatch?.[1]?.trim(),
      noticeType: keyword,
      sourceUrl: linkMatch
        ? new URL(linkMatch[1], this.config.baseUrl).toString()
        : this.config.baseUrl,
      rawText: text,
    };
  }

  private parseTableRow(
    cells: string[],
    keyword: string,
  ): RawNoticeRecord | null {
    // Common layout: Date, County, Title/Case, Description
    if (cells.length < 3) return null;

    const lowerJoined = cells.join(" ").toLowerCase();
    const isRelevant = FORECLOSURE_KEYWORDS.some((kw) =>
      lowerJoined.includes(kw),
    );
    if (!isRelevant) return null;

    return {
      publishedDate: cells[0]?.trim() || undefined,
      county: cells[1]?.trim() || undefined,
      caseNumber: this.extractCaseNumber(cells[2] ?? ""),
      address: this.extractAddress(cells.join(" ")),
      rawText: cells.join(" | "),
      noticeType: keyword,
      sourceUrl: this.config.baseUrl,
    };
  }

  private extractCaseNumber(text: string): string | undefined {
    const match = text.match(
      /(\d{4}-[A-Z]{2,4}-\d+[\w.-]*)/i,
    );
    return match?.[1]?.trim();
  }

  private extractAddress(text: string): string | undefined {
    // Look for a pattern that looks like a street address
    const match = text.match(
      /(\d{1,6}\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Ct|Court|Way|Cir|Circle|Pl|Place)[.,]?\s*[A-Za-z\s]*,?\s*(?:SC|S\.C\.)?\s*\d{5}?)/i,
    );
    return match?.[1]?.trim();
  }

  // -------------------------------------------------------------------------
  // Normalize
  // -------------------------------------------------------------------------

  parseNotice(raw: RawNoticeRecord): NormalizedNotice {
    let auctionDate: string | null = null;
    if (raw.saleDate) {
      const parsed = new Date(raw.saleDate);
      if (!isNaN(parsed.getTime())) {
        auctionDate = parsed.toISOString();
      }
    }

    let publishedDate: string | null = null;
    if (raw.publishedDate) {
      const parsed = new Date(raw.publishedDate);
      if (!isNaN(parsed.getTime())) {
        publishedDate = parsed.toISOString();
      }
    }

    const county = raw.county ? normalizeCounty(raw.county) : "UNKNOWN";

    return {
      county,
      state: this.state,
      noticeType: "PUBLIC_NOTICE",
      caseNumber: raw.caseNumber ?? null,
      address: raw.address ? normalizeAddress(raw.address) : null,
      parcelNumber: null,
      borrowerName: raw.defendant ? normalizeName(raw.defendant) : null,
      lenderName: raw.plaintiff ? normalizeName(raw.plaintiff) : null,
      trusteeName: null,
      defaultAmount: null,
      unpaidBalance: null,
      originalLoanAmount: null,
      recordingDate: null,
      auctionDate,
      publishedDate: publishedDate ?? new Date().toISOString(),
      documentUrl: raw.sourceUrl ?? null,
      rawData: {
        noticeKeyword: raw.noticeType ?? null,
        rawText: raw.rawText ?? null,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Test fixture
  // -------------------------------------------------------------------------

  static getTestFixture(): string {
    return `
<html><body>
<h1>SC Public Notices - Search Results</h1>
<p>Showing results for "foreclosure"</p>
<div class="notice-listing">
  <article class="notice-result">
    <h3><a href="/notice/12345">Foreclosure Sale - Greenville County</a></h3>
    <p class="date">Published: 03/01/2026</p>
    <p>Case No.: 2025-CP-23-07890</p>
    <p>Plaintiff: Truist Bank<br>
    Defendant: William J. Carter</p>
    <p>Property Address: 55 Maple Court, Greer, SC 29650</p>
    <p>Sale Date: 04/15/2026 at 11:00 AM at the Greenville County Courthouse</p>
  </article>
  <article class="notice-result">
    <h3><a href="/notice/12346">Master in Equity Sale - Horry County</a></h3>
    <p class="date">Published: 03/05/2026</p>
    <p>Case No.: 2025-CP-26-03456</p>
    <p>Plaintiff: Lakeview Loan Servicing, LLC<br>
    Defendant: Patricia M. Evans et al.</p>
    <p>Property Address: 1200 Kings Highway, Myrtle Beach, SC 29577</p>
    <p>Sale Date: 04/20/2026 at 11:00 AM at the Horry County Courthouse</p>
  </article>
  <article class="notice-result">
    <h3><a href="/notice/12347">Notice of Sale - Richland County</a></h3>
    <p class="date">Published: 03/08/2026</p>
    <p>Case No.: 2025-CP-40-02345</p>
    <p>Plaintiff: PHH Mortgage Corporation<br>
    Defendant: Marcus T. Robinson</p>
    <p>Property Address: 340 Assembly Street, Columbia, SC 29201</p>
    <p>Sale Date: 04/22/2026 at 12:00 PM at the Richland County Courthouse</p>
  </article>
</div>
</body></html>`.trim();
  }
}
