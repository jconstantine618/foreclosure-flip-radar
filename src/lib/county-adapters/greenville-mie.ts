import logger from "@/lib/logger";
import { BaseCountyAdapter } from "./base-adapter";
import type { RawNoticeRecord, NormalizedNotice } from "./types";
import { normalizeAddress, normalizeName } from "./normalizer";

// ---------------------------------------------------------------------------
// Greenville County Master in Equity Adapter
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL =
  "https://www.greenvillecounty.org/courts/master_in_equity_sales.asp";

export class GreenvilleMIEAdapter extends BaseCountyAdapter {
  readonly name = "greenville-mie";
  readonly county = "GREENVILLE";
  readonly state = "SC";

  constructor(config: { baseUrl?: string; enabled?: boolean } = {}) {
    super({
      county: "GREENVILLE",
      state: "SC",
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      enabled: config.enabled ?? true,
      refreshIntervalMinutes: 60,
    });
  }

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  async fetchNotices(
    options?: { since?: Date },
  ): Promise<RawNoticeRecord[]> {
    const url = this.config.baseUrl!;
    logger.info({ adapter: this.name }, `Fetching Greenville MIE notices from ${url}`);

    const allowed = await this.checkRobotsTxt(url);
    if (!allowed) {
      logger.warn({ adapter: this.name }, "Blocked by robots.txt — skipping");
      return [];
    }

    const html = await this.fetchWithRetry(url);
    const records = this.extractRecords(html);

    // If caller specified a cutoff date, filter
    if (options?.since) {
      const cutoff = options.since.getTime();
      return records.filter((r) => {
        if (!r.saleDate) return true;
        const d = new Date(r.saleDate).getTime();
        return !isNaN(d) && d >= cutoff;
      });
    }

    logger.info({ adapter: this.name }, `Extracted ${records.length} Greenville MIE records`);
    return records;
  }

  // -------------------------------------------------------------------------
  // Extract raw records from HTML
  // -------------------------------------------------------------------------

  private extractRecords(html: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];

    // Greenville County typically publishes MIE sales in an HTML table
    // with columns: Case#, Sale Date, Sale Time, Address, Plaintiff,
    // Defendant, Legal Description, Deposit/Terms.
    const tableMatch = html.match(
      /<table[^>]*class="[^"]*sale[^"]*"[^>]*>([\s\S]*?)<\/table>/i,
    ) ?? html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

    if (!tableMatch) {
      // Fallback: try to parse individual sale blocks separated by <hr> or headings
      return this.extractBlockRecords(html);
    }

    const rows = this.parseHtmlTable(tableMatch[0]);

    // Skip header row
    const dataRows = rows.length > 1 ? rows.slice(1) : rows;

    for (const cells of dataRows) {
      if (cells.length < 4) continue;

      const record: RawNoticeRecord = {
        caseNumber: cells[0]?.trim() || undefined,
        saleDate: cells[1]?.trim() || undefined,
        saleTime: cells[2]?.trim() || undefined,
        address: cells[3]?.trim() || undefined,
        plaintiff: cells[4]?.trim() || undefined,
        defendant: cells[5]?.trim() || undefined,
        legalDescription: cells[6]?.trim() || undefined,
        depositTerms: cells[7]?.trim() || undefined,
        sourceUrl: this.config.baseUrl,
        rawHtml: tableMatch[0],
      };

      records.push(record);
    }

    return records;
  }

  /**
   * Fallback parser for block-formatted sale notices (separated by <hr> or
   * heading tags rather than table rows).
   */
  private extractBlockRecords(html: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];
    // Split by common block separators
    const blocks = html.split(/<hr[^>]*>|<h[2-4][^>]*>/i);

    for (const block of blocks) {
      const caseMatch = block.match(
        /(?:case|docket)\s*(?:#|no\.?|number)?\s*[:.]?\s*(\d{4}-[A-Z]{2,4}-\d+[\w.-]*)/i,
      );
      const dateMatch = block.match(
        /(?:sale\s+date|date\s+of\s+sale)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      );
      const timeMatch = block.match(
        /(?:sale\s+time|time\s+of\s+sale|time)\s*[:.]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      );
      const addressMatch = block.match(
        /(?:property\s+address|address|location)\s*[:.]?\s*([^\n<]+)/i,
      );
      const plaintiffMatch = block.match(
        /(?:plaintiff|petitioner)\s*[:.]?\s*([^\n<]+)/i,
      );
      const defendantMatch = block.match(
        /(?:defendant|respondent)\s*[:.]?\s*([^\n<]+)/i,
      );
      const legalMatch = block.match(
        /(?:legal\s+description|description)\s*[:.]?\s*([^\n<]+(?:\n[^\n<]+)*)/i,
      );
      const depositMatch = block.match(
        /(?:deposit|terms|deposit\s*(?:\/|and)\s*terms)\s*[:.]?\s*([^\n<]+)/i,
      );

      if (!caseMatch && !addressMatch) continue;

      records.push({
        caseNumber: caseMatch?.[1]?.trim(),
        saleDate: dateMatch?.[1]?.trim(),
        saleTime: timeMatch?.[1]?.trim(),
        address: addressMatch?.[1]?.trim(),
        plaintiff: plaintiffMatch?.[1]?.trim(),
        defendant: defendantMatch?.[1]?.trim(),
        legalDescription: legalMatch?.[1]?.trim(),
        depositTerms: depositMatch?.[1]?.trim(),
        sourceUrl: this.config.baseUrl,
        rawText: this.stripHtml(block),
      });
    }

    return records;
  }

  // -------------------------------------------------------------------------
  // Normalize a single raw record into NormalizedNotice
  // -------------------------------------------------------------------------

  parseNotice(raw: RawNoticeRecord): NormalizedNotice {
    let auctionDate: string | null = null;
    if (raw.saleDate) {
      const parsed = new Date(raw.saleDate);
      if (!isNaN(parsed.getTime())) {
        auctionDate = parsed.toISOString();
      }
    }

    return {
      county: this.county,
      state: this.state,
      noticeType: "MASTER_IN_EQUITY",
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
      publishedDate: new Date().toISOString(),
      documentUrl: raw.sourceUrl ?? null,
      rawData: {
        saleTime: raw.saleTime ?? null,
        legalDescription: raw.legalDescription ?? null,
        depositTerms: raw.depositTerms ?? null,
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
<h2>Greenville County Master in Equity Sales</h2>
<table class="sale-list">
  <tr>
    <th>Case #</th><th>Sale Date</th><th>Sale Time</th><th>Address</th>
    <th>Plaintiff</th><th>Defendant</th><th>Legal Description</th><th>Deposit/Terms</th>
  </tr>
  <tr>
    <td>2025-CP-23-04567</td>
    <td>03/15/2026</td>
    <td>11:00 AM</td>
    <td>123 Main Street, Greenville, SC 29601</td>
    <td>Wells Fargo Bank, N.A.</td>
    <td>John D. Smith et al.</td>
    <td>Lot 14, Block B, Pleasantburg Gardens, PB 45, Pg 102</td>
    <td>5% deposit required at time of sale</td>
  </tr>
  <tr>
    <td>2025-CP-23-05891</td>
    <td>03/15/2026</td>
    <td>11:00 AM</td>
    <td>456 Oak Avenue, Mauldin, SC 29662</td>
    <td>Nationstar Mortgage LLC</td>
    <td>Jane A. Doe</td>
    <td>Lot 7, Brookfield Subdivision, Phase 2, PB 62, Pg 48</td>
    <td>5% deposit required at time of sale</td>
  </tr>
  <tr>
    <td>2025-CP-23-06234</td>
    <td>03/22/2026</td>
    <td>11:00 AM</td>
    <td>789 Elm Drive, Simpsonville, SC 29681</td>
    <td>Bank of America, N.A.</td>
    <td>Robert L. Johnson and Mary T. Johnson</td>
    <td>Lot 22, Fairview Estates, Section 3, PB 78, Pg 215</td>
    <td>5% deposit required; sale subject to confirmation</td>
  </tr>
</table>
</body></html>`.trim();
  }
}
