import logger from "@/lib/logger";
import { BaseCountyAdapter } from "./base-adapter";
import type { RawNoticeRecord, NormalizedNotice } from "./types";
import { normalizeAddress, normalizeName } from "./normalizer";

// ---------------------------------------------------------------------------
// Horry County Master in Equity — Principal Sales Adapter
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL =
  "https://www.horrycounty.org/departments/master-in-equity/sales";

export class HorryMIEAdapter extends BaseCountyAdapter {
  readonly name = "horry-mie";
  readonly county = "HORRY";
  readonly state = "SC";

  constructor(config: { baseUrl?: string; enabled?: boolean } = {}) {
    super({
      county: "HORRY",
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
    logger.info({ adapter: this.name }, `Fetching Horry County principal MIE sales from ${url}`);

    const allowed = await this.checkRobotsTxt(url);
    if (!allowed) {
      logger.warn({ adapter: this.name }, "Blocked by robots.txt — skipping");
      return [];
    }

    const html = await this.fetchWithRetry(url);
    const records = this.extractRecords(html);

    if (options?.since) {
      const cutoff = options.since.getTime();
      return records.filter((r) => {
        if (!r.saleDate) return true;
        const d = new Date(r.saleDate).getTime();
        return !isNaN(d) && d >= cutoff;
      });
    }

    logger.info({ adapter: this.name }, `Extracted ${records.length} Horry MIE principal records`);
    return records;
  }

  // -------------------------------------------------------------------------
  // Extract records
  // -------------------------------------------------------------------------

  private extractRecords(html: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];

    // Horry County often publishes sales in a div-based list or table.
    // Try table first, then fall back to div blocks.
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

    if (tableMatch) {
      return this.extractFromTable(tableMatch[0]);
    }

    // Div/section-based layout: each sale in a card or list-item
    return this.extractFromBlocks(html);
  }

  private extractFromTable(tableHtml: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];
    const rows = this.parseHtmlTable(tableHtml);
    const dataRows = rows.length > 1 ? rows.slice(1) : rows;

    for (const cells of dataRows) {
      if (cells.length < 3) continue;

      // Horry County table format may vary; common layout:
      // Case#, Sale Date, Plaintiff v. Defendant, Address, Terms
      const vsMatch = cells[2]?.match(/^(.+?)\s+(?:vs?\.?|v\.)\s+(.+)$/i);

      records.push({
        caseNumber: cells[0]?.trim() || undefined,
        saleDate: cells[1]?.trim() || undefined,
        plaintiff: vsMatch ? vsMatch[1].trim() : cells[2]?.trim(),
        defendant: vsMatch ? vsMatch[2].trim() : undefined,
        address: cells[3]?.trim() || undefined,
        legalDescription: cells[4]?.trim() || undefined,
        depositTerms: cells[5]?.trim() || undefined,
        sourceUrl: this.config.baseUrl,
        rawHtml: tableHtml,
      });
    }

    return records;
  }

  private extractFromBlocks(html: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];

    // Split on sale entry boundaries
    const saleBlocks = html.split(
      /(?:<div[^>]*class="[^"]*sale-entry[^"]*"[^>]*>|<hr[^>]*>|<h[3-4][^>]*>)/i,
    );

    for (const block of saleBlocks) {
      const caseMatch = block.match(
        /(?:case|docket)\s*(?:#|no\.?|number)?\s*[:.]?\s*(\d{4}-[A-Z]{2,4}-\d+[\w.-]*)/i,
      );
      const dateMatch = block.match(
        /(?:sale\s+date|date)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      );
      const timeMatch = block.match(
        /(?:time)\s*[:.]?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      );
      const plaintiffMatch = block.match(
        /(?:plaintiff)\s*[:.]?\s*([^\n<]+)/i,
      );
      const defendantMatch = block.match(
        /(?:defendant)\s*[:.]?\s*([^\n<]+)/i,
      );
      const addressMatch = block.match(
        /(?:property\s+address|address|location)\s*[:.]?\s*([^\n<]+)/i,
      );
      const legalMatch = block.match(
        /(?:legal\s+description|description)\s*[:.]?\s*([^\n<]+)/i,
      );
      const depositMatch = block.match(
        /(?:deposit|terms)\s*[:.]?\s*([^\n<]+)/i,
      );

      // "Plaintiff v. Defendant" single-line format
      const vsLine = block.match(
        /([A-Z][\w\s,.]+?)\s+(?:vs?\.?|v\.)\s+([A-Z][\w\s,.]+)/i,
      );

      if (!caseMatch && !addressMatch && !vsLine) continue;

      records.push({
        caseNumber: caseMatch?.[1]?.trim(),
        saleDate: dateMatch?.[1]?.trim(),
        saleTime: timeMatch?.[1]?.trim(),
        plaintiff:
          plaintiffMatch?.[1]?.trim() ?? vsLine?.[1]?.trim(),
        defendant:
          defendantMatch?.[1]?.trim() ?? vsLine?.[2]?.trim(),
        address: addressMatch?.[1]?.trim(),
        legalDescription: legalMatch?.[1]?.trim(),
        depositTerms: depositMatch?.[1]?.trim(),
        sourceUrl: this.config.baseUrl,
        rawText: this.stripHtml(block),
      });
    }

    return records;
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
<h2>Horry County Master in Equity - Principal Sales</h2>
<table>
  <tr>
    <th>Case Number</th><th>Sale Date</th><th>Parties</th>
    <th>Property Address</th><th>Legal Description</th><th>Terms</th>
  </tr>
  <tr>
    <td>2025-CP-26-01234</td>
    <td>04/05/2026</td>
    <td>U.S. Bank National Association v. Michael R. Williams</td>
    <td>1500 Ocean Boulevard, Myrtle Beach, SC 29577</td>
    <td>Unit 412, Sea Breeze Condominiums, Horry County, PB 112, Pg 56</td>
    <td>5% deposit due at sale; balance within 30 days</td>
  </tr>
  <tr>
    <td>2025-CP-26-01678</td>
    <td>04/05/2026</td>
    <td>JPMorgan Chase Bank, N.A. v. Sarah L. Martinez et al.</td>
    <td>302 Palmetto Drive, Conway, SC 29526</td>
    <td>Lot 8, Riverfront Estates, Phase 1, PB 89, Pg 33</td>
    <td>5% deposit due at sale; balance within 30 days</td>
  </tr>
  <tr>
    <td>2025-CP-26-02091</td>
    <td>04/12/2026</td>
    <td>Rocket Mortgage LLC v. David and Karen Thompson</td>
    <td>45 Pine Valley Road, Surfside Beach, SC 29575</td>
    <td>Lot 15, Block C, Surfside Pines, PB 74, Pg 198</td>
    <td>5% deposit due at sale</td>
  </tr>
</table>
</body></html>`.trim();
  }
}
