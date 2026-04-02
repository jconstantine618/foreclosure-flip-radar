import logger from "@/lib/logger";
import { BaseCountyAdapter } from "./base-adapter";
import type { RawNoticeRecord, NormalizedNotice } from "./types";
import { normalizeAddress, normalizeName } from "./normalizer";

// ---------------------------------------------------------------------------
// Horry County Upset Bid Sales Adapter
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL =
  "https://www.horrycounty.org/departments/master-in-equity/upset-bids";

export class HorryUpsetBidAdapter extends BaseCountyAdapter {
  readonly name = "horry-upset";
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
    logger.info({ adapter: this.name }, `Fetching Horry County upset bid notices from ${url}`);

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

    logger.info({ adapter: this.name }, `Extracted ${records.length} Horry upset bid records`);
    return records;
  }

  // -------------------------------------------------------------------------
  // Extract records — upset bid pages typically list the original sale info
  // plus the upset bid amount and new bid deadline.
  // -------------------------------------------------------------------------

  private extractRecords(html: string): RawNoticeRecord[] {
    const records: RawNoticeRecord[] = [];

    // Try table-based extraction first
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);

    if (tableMatch) {
      const rows = this.parseHtmlTable(tableMatch[0]);
      const dataRows = rows.length > 1 ? rows.slice(1) : rows;

      for (const cells of dataRows) {
        if (cells.length < 3) continue;

        // Upset bid table format:
        // Case#, Original Sale Date, Upset Bid Deadline, Plaintiff v. Defendant,
        // Address, Current Bid Amount
        records.push({
          caseNumber: cells[0]?.trim() || undefined,
          saleDate: cells[1]?.trim() || undefined,
          upsetBidDeadline: cells[2]?.trim() || undefined,
          plaintiff: this.extractPlaintiff(cells[3] ?? ""),
          defendant: this.extractDefendant(cells[3] ?? ""),
          address: cells[4]?.trim() || undefined,
          currentBidAmount: cells[5]?.trim() || undefined,
          sourceUrl: this.config.baseUrl,
          rawHtml: tableMatch[0],
        });
      }

      return records;
    }

    // Fallback: block-based parsing
    const blocks = html.split(/<hr[^>]*>|<div[^>]*class="[^"]*upset[^"]*"/i);

    for (const block of blocks) {
      const caseMatch = block.match(
        /(?:case|docket)\s*(?:#|no\.?|number)?\s*[:.]?\s*(\d{4}-[A-Z]{2,4}-\d+[\w.-]*)/i,
      );
      const saleDateMatch = block.match(
        /(?:original\s+sale\s+date|sale\s+date)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      );
      const deadlineMatch = block.match(
        /(?:upset\s+bid\s+deadline|deadline|bid\s+deadline)\s*[:.]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      );
      const bidAmountMatch = block.match(
        /(?:current\s+bid|bid\s+amount|amount)\s*[:.]?\s*\$?([\d,]+(?:\.\d{2})?)/i,
      );
      const addressMatch = block.match(
        /(?:property\s+address|address|location)\s*[:.]?\s*([^\n<]+)/i,
      );
      const plaintiffMatch = block.match(
        /(?:plaintiff)\s*[:.]?\s*([^\n<]+)/i,
      );
      const defendantMatch = block.match(
        /(?:defendant)\s*[:.]?\s*([^\n<]+)/i,
      );

      if (!caseMatch && !addressMatch) continue;

      records.push({
        caseNumber: caseMatch?.[1]?.trim(),
        saleDate: saleDateMatch?.[1]?.trim(),
        upsetBidDeadline: deadlineMatch?.[1]?.trim(),
        currentBidAmount: bidAmountMatch?.[1]?.trim(),
        address: addressMatch?.[1]?.trim(),
        plaintiff: plaintiffMatch?.[1]?.trim(),
        defendant: defendantMatch?.[1]?.trim(),
        sourceUrl: this.config.baseUrl,
        rawText: this.stripHtml(block),
      });
    }

    return records;
  }

  private extractPlaintiff(parties: string): string | undefined {
    const vsMatch = parties.match(/^(.+?)\s+(?:vs?\.?|v\.)\s+/i);
    return vsMatch ? vsMatch[1].trim() : undefined;
  }

  private extractDefendant(parties: string): string | undefined {
    const vsMatch = parties.match(/\s+(?:vs?\.?|v\.)\s+(.+)$/i);
    return vsMatch ? vsMatch[1].trim() : undefined;
  }

  // -------------------------------------------------------------------------
  // Normalize
  // -------------------------------------------------------------------------

  parseNotice(raw: RawNoticeRecord): NormalizedNotice {
    let auctionDate: string | null = null;

    // For upset bids, the relevant date is the upset bid deadline
    const dateStr = raw.upsetBidDeadline ?? raw.saleDate;
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        auctionDate = parsed.toISOString();
      }
    }

    // Parse current bid amount
    let defaultAmount: number | null = null;
    if (raw.currentBidAmount) {
      const cleaned = raw.currentBidAmount.replace(/[,$]/g, "");
      const amt = parseFloat(cleaned);
      if (!isNaN(amt)) {
        defaultAmount = amt;
      }
    }

    return {
      county: this.county,
      state: this.state,
      noticeType: "UPSET_BID",
      caseNumber: raw.caseNumber ?? null,
      address: raw.address ? normalizeAddress(raw.address) : null,
      parcelNumber: null,
      borrowerName: raw.defendant ? normalizeName(raw.defendant) : null,
      lenderName: raw.plaintiff ? normalizeName(raw.plaintiff) : null,
      trusteeName: null,
      defaultAmount,
      unpaidBalance: null,
      originalLoanAmount: null,
      recordingDate: null,
      auctionDate,
      publishedDate: new Date().toISOString(),
      documentUrl: raw.sourceUrl ?? null,
      rawData: {
        originalSaleDate: raw.saleDate ?? null,
        upsetBidDeadline: raw.upsetBidDeadline ?? null,
        currentBidAmount: raw.currentBidAmount ?? null,
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
<h2>Horry County Master in Equity - Upset Bid Sales</h2>
<p>The following properties are subject to upset bid. Bids must be submitted
by the deadline shown.</p>
<table>
  <tr>
    <th>Case Number</th><th>Original Sale Date</th><th>Upset Bid Deadline</th>
    <th>Parties</th><th>Property Address</th><th>Current Bid Amount</th>
  </tr>
  <tr>
    <td>2025-CP-26-00987</td>
    <td>02/10/2026</td>
    <td>04/10/2026</td>
    <td>Pennymac Loan Services LLC v. Thomas R. Brown</td>
    <td>210 Magnolia Lane, Myrtle Beach, SC 29579</td>
    <td>$185,500.00</td>
  </tr>
  <tr>
    <td>2025-CP-26-01102</td>
    <td>02/24/2026</td>
    <td>04/17/2026</td>
    <td>Freedom Mortgage Corp v. Angela D. White et al.</td>
    <td>78 Cypress Bay Road, Little River, SC 29566</td>
    <td>$142,750.00</td>
  </tr>
  <tr>
    <td>2025-CP-26-01345</td>
    <td>03/03/2026</td>
    <td>04/24/2026</td>
    <td>NewRez LLC v. Christopher and Lisa Adams</td>
    <td>920 Waccamaw Drive, Garden City, SC 29576</td>
    <td>$267,000.00</td>
  </tr>
</table>
</body></html>`.trim();
  }
}
