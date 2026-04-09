/**
 * Master in Equity (MIE) Foreclosure Sale Scraper
 *
 * Scrapes upcoming foreclosure sale listings from county MIE websites.
 * SC foreclosures are judicial — the Master in Equity conducts monthly sales
 * on the first Monday of each month.
 *
 * Sources:
 * - Greenville: mie.greenvillejournal.com (HTML, searchable by date)
 * - Horry: horrycountysc.gov/departments/master-in-equity/principal-sales/ (HTML)
 * - Georgetown: gtcounty.org/223/Foreclosure-Sales (PDF links — fallback to HTML scrape)
 */

export interface MIESaleEntry {
  county: string;
  saleDate: string; // ISO date string
  caseNumber: string;
  address: string;
  city: string;
  state: string;
  plaintiff: string | null; // lender
  defendant: string | null; // borrower
  lawFirm: string | null;
  bidAmount: number | null;
  status: string | null; // "Withdrawn", "Continued", etc.
  sourceUrl: string;
}

// ---------------------------------------------------------------------------
// Greenville County MIE Scraper
// ---------------------------------------------------------------------------

/**
 * Get upcoming sale dates from the Greenville MIE site.
 * Parses the date dropdown on the search form.
 */
export async function getGreenvilleSaleDates(): Promise<string[]> {
  const url = "https://mie.greenvillejournal.com/";
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return [];
    const html = await resp.text();

    // Extract dates from the select dropdown (format: MM/DD/YYYY)
    const dates: string[] = [];
    const regex = /value="(\d{2}\/\d{2}\/\d{4})"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      dates.push(match[1]);
    }

    // Include future dates AND recent past dates (within 60 days)
    // Recent past sales help us update distress stages for properties
    // that already went to auction
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const filtered = dates.filter((d) => new Date(d) >= sixtyDaysAgo);
    // Sort: future dates first (ascending), then past dates (most recent first)
    // This ensures we always prioritize upcoming auctions
    const future = filtered.filter((d) => new Date(d) >= now).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const past = filtered.filter((d) => new Date(d) < now).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return [...future, ...past];
  } catch {
    console.warn("[MIE-Greenville] Failed to fetch sale dates");
    return [];
  }
}

/**
 * Scrape Greenville MIE sale entries for a specific date.
 * Fetches the search results page and parses structured listing entries.
 *
 * The site uses WP Adverts plugin with "wpa-result-item" blocks.
 * Each block has 8 "wpa-detail-left" child divs:
 *   [0] Status tags + sale date (e.g. "Def Waived In Order05/04/2026")
 *   [1] Case number with link (e.g. "2022-CP-23-00650")
 *   [2] Address + city separated by <br> (e.g. "310 Langley Road<br>Travelers Rest, SC")
 *   [3] Law firm name
 *   [4] Plaintiff (lender)
 *   [5] Defendant (borrower)
 *   [6] Bid amount (usually empty for upcoming sales)
 *   [7] Bidder (usually empty for upcoming sales)
 */
export async function scrapeGreenvilleSales(
  saleDate: string, // MM/DD/YYYY format
): Promise<MIESaleEntry[]> {
  const encoded = encodeURIComponent(saleDate);
  const url = `https://mie.greenvillejournal.com/search-results/?_form_scheme=foreclosure-sale-ads-search&_form_scheme_id=331&custom_field_2=${encoded}`;

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return [];
    const html = await resp.text();

    // Parse sale date to ISO
    const [month, day, year] = saleDate.split("/");
    const isoDate = `${year}-${month}-${day}`;

    const entries: MIESaleEntry[] = [];

    // Split HTML into wpa-result-item blocks.
    // Each entry is a <div class="wpa-result-item ..."> containing wpa-detail-left fields.
    // Skip the first block (column headers: Date of Sale, Case Number, etc.)
    const itemBlocks = html.split(/class="wpa-result-item\b/);

    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];

      // Extract all wpa-detail-left field contents
      const fieldRegex = /class="wpa-detail-left[^"]*"[^>]*>(.*?)<\/div>\s*(?=<div class="wpa-detail-left|<\/div>\s*<\/div>)/gs;
      const rawFields: string[] = [];
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(block)) !== null) {
        rawFields.push(fieldMatch[1]);
      }

      // Fallback: if the nested regex didn't work, try extracting text between
      // consecutive wpa-detail-left markers
      if (rawFields.length < 3) {
        const altParts = block.split(/class="wpa-detail-left[^"]*"[^>]*>/);
        for (let j = 1; j < altParts.length; j++) {
          // Take content up to the matching outer closing </div>, accounting for
          // nested divs (e.g. field[0] has inner <div>status</div> children).
          let depth = 1; // we're inside the opening wpa-detail-left div
          let endIdx = 0;
          const part = altParts[j];
          const tagRegex = /<(\/?)div\b[^>]*>/gi;
          let tagMatch;
          while ((tagMatch = tagRegex.exec(part)) !== null) {
            if (tagMatch[1] === "/") {
              depth--;
              if (depth === 0) {
                endIdx = tagMatch.index;
                break;
              }
            } else {
              depth++;
            }
          }
          const content = endIdx > 0 ? part.substring(0, endIdx) : part;
          rawFields.push(content);
        }
      }

      if (rawFields.length < 4) continue; // skip header row or malformed

      // Helper: strip HTML tags and normalise whitespace
      const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      // Field 0: status + date — e.g. "Def Waived In Order05/04/2026"
      const field0 = stripHtml(rawFields[0] ?? "");
      const dateMatch = field0.match(/(\d{2}\/\d{2}\/\d{4})/);
      let status: string | null = null;
      if (dateMatch) {
        const statusPart = field0.substring(0, dateMatch.index).trim();
        if (statusPart) status = statusPart;
      }

      // Field 1: case number
      const caseNumber = stripHtml(rawFields[1] ?? "").trim();

      // Field 2: address + city separated by <br> tag — e.g. "310 Langley Road<br>Travelers Rest, SC"
      const addrFieldRaw = rawFields[2] ?? "";
      // Split on <br> / <br/> / <br /> to separate street from city line
      const addrParts = addrFieldRaw.split(/<br\s*\/?\s*>/i).map((p) => stripHtml(p).trim()).filter(Boolean);

      let street = "";
      let city = "";
      let state = "SC";

      if (addrParts.length >= 2) {
        // First part is street, second is "City, SC"
        street = addrParts[0];
        const cityLine = addrParts[1];
        const cityStateMatch = cityLine.match(/^(.+?),\s*([A-Z]{2})\s*$/);
        if (cityStateMatch) {
          city = cityStateMatch[1].trim();
          state = cityStateMatch[2];
        } else {
          city = cityLine;
        }
      } else {
        // No <br> separator — try splitting "AddressCityName, SC" heuristically
        const addrRaw = stripHtml(addrFieldRaw).trim();
        street = addrRaw;
        const cityStateMatch = addrRaw.match(/^(.+?)\s*,\s*([A-Z]{2})\s*$/);
        if (cityStateMatch) {
          const beforeState = cityStateMatch[1];
          const splitMatch = beforeState.match(/^(.*[a-z.])([A-Z][A-Za-z\s]*)$/);
          if (splitMatch) {
            street = splitMatch[1].trim();
            city = splitMatch[2].trim();
          }
          state = cityStateMatch[2];
        }
      }

      // Field 3-5: law firm, plaintiff, defendant
      const lawFirm = stripHtml(rawFields[3] ?? "").trim() || null;
      const plaintiff = stripHtml(rawFields[4] ?? "").trim() || null;
      const defendant = stripHtml(rawFields[5] ?? "").trim() || null;

      // Field 6: bid amount (parse if present)
      const bidRaw = stripHtml(rawFields[6] ?? "").trim();
      let bidAmount: number | null = null;
      if (bidRaw) {
        const bidNum = parseFloat(bidRaw.replace(/[$,]/g, ""));
        if (!isNaN(bidNum) && bidNum > 0) bidAmount = bidNum;
      }

      if (caseNumber && street) {
        entries.push({
          county: "Greenville",
          saleDate: isoDate,
          caseNumber,
          address: street,
          city,
          state,
          plaintiff,
          defendant,
          lawFirm,
          bidAmount,
          status,
          sourceUrl: url,
        });
      }
    }

    console.log(`[MIE-Greenville] Found ${entries.length} entries for ${saleDate}`);
    return entries;
  } catch (err) {
    console.warn("[MIE-Greenville] Scrape failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Horry County MIE Scraper
// ---------------------------------------------------------------------------

/**
 * Scrape Horry County MIE principal sales page.
 * Sales are posted ~3 weeks before the first Monday of each month.
 * The page lists foreclosures with case numbers, addresses, plaintiffs,
 * defendants, and sale dates in a structured HTML layout.
 */
export async function scrapeHorrySales(): Promise<MIESaleEntry[]> {
  const url = "https://www.horrycountysc.gov/departments/master-in-equity/principal-sales/";

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[MIE-Horry] HTTP ${resp.status}`);
      return [];
    }
    const html = await resp.text();

    // Check if there are no upcoming sales
    if (html.toLowerCase().includes("no upcoming sale") ||
        html.toLowerCase().includes("no sales scheduled")) {
      console.log("[MIE-Horry] No upcoming sales posted");
      return [];
    }

    // Extract the next sale date from the page heading or content
    // Common format: "Sale Date: May 5, 2026" or "Monday, May 5, 2026"
    let saleDate = "";
    const dateHeadingMatch = html.match(
      /(?:sale\s*date|next\s*sale)[:\s]*(\w+day,?\s*)?(\w+\s+\d{1,2},?\s*\d{4})/i
    );
    if (dateHeadingMatch) {
      const parsed = new Date(dateHeadingMatch[2]);
      if (!isNaN(parsed.getTime())) {
        saleDate = parsed.toISOString().split("T")[0];
      }
    }

    // Fallback: compute next first Monday if no date found on page
    if (!saleDate) {
      saleDate = getNextFirstMonday().toISOString().split("T")[0];
    }

    const entries: MIESaleEntry[] = [];

    // Strategy 1: Look for structured table rows (some months use tables)
    const tableRowRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
    let rowMatch;
    while ((rowMatch = tableRowRegex.exec(html)) !== null) {
      const row = rowMatch[1];
      const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) =>
        m[1].replace(/<[^>]+>/g, "").trim()
      );
      if (cells.length >= 4) {
        const entry = parseHorryTableRow(cells, saleDate, url);
        if (entry) entries.push(entry);
      }
    }

    // Strategy 2: If no table rows found, parse free-text blocks
    // Horry sometimes posts as paragraphs with case info separated by <br> or <p>
    if (entries.length === 0) {
      // Extract main content area
      const contentMatch = html.match(
        /class="(?:field-item|content-area|entry-content|page-content)"[^>]*>(.*?)<\/(?:div|article|section)>/s
      );
      const content = contentMatch ? contentMatch[1] : html;

      // Split by case number pattern: "20XX-CP-26-XXXXX" (Horry = county 26)
      const caseBlocks = content.split(
        /(?=\b\d{4}-CP-26-\d{3,6}\b)/i
      );

      for (const block of caseBlocks) {
        const caseMatch = block.match(/(\d{4}-CP-26-\d{3,6})/i);
        if (!caseMatch) continue;

        const caseNumber = caseMatch[1];
        const text = block.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

        // Extract address: look for street number + street name pattern
        const addrMatch = text.match(
          /(\d+\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Cir|Pl|Hwy|Pkwy|Loop|Trail|Ter)\.?(?:\s+(?:Apt|Unit|#)\s*\S+)?)/i
        );
        const address = addrMatch ? addrMatch[1].trim() : "";

        // Extract plaintiff (v. or vs. pattern)
        const vsMatch = text.match(/(.+?)\s+(?:v\.?s?\.?)\s+(.+?)(?:\s+(?:TMS|Case|Property|$))/i);
        const plaintiff = vsMatch ? vsMatch[1].trim().slice(-80) : null;
        const defendant = vsMatch ? vsMatch[2].trim().slice(0, 80) : null;

        // Extract city from address context — default to Myrtle Beach area cities
        let city = "Conway"; // Horry county seat
        const cityMatch = text.match(
          /\b(Myrtle Beach|North Myrtle Beach|Conway|Surfside Beach|Little River|Loris|Aynor|Socastee|Carolina Forest|Garden City)\b/i
        );
        if (cityMatch) city = cityMatch[1];

        if (address) {
          entries.push({
            county: "Horry",
            saleDate,
            caseNumber,
            address,
            city,
            state: "SC",
            plaintiff,
            defendant,
            lawFirm: null,
            bidAmount: null,
            status: null,
            sourceUrl: url,
          });
        }
      }
    }

    console.log(`[MIE-Horry] Found ${entries.length} sale entries`);
    return entries;
  } catch (err) {
    console.warn("[MIE-Horry] Scrape failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Parse a table row from Horry's foreclosure listing table.
 * Column order varies but typically: Case#, Plaintiff, Defendant, Address/TMS
 */
function parseHorryTableRow(
  cells: string[],
  saleDate: string,
  sourceUrl: string,
): MIESaleEntry | null {
  // Find the cell that looks like a case number
  const caseIdx = cells.findIndex((c) => /\d{4}-CP-26-\d{3,6}/i.test(c));
  if (caseIdx === -1) return null;

  const caseNumber = cells[caseIdx].match(/(\d{4}-CP-26-\d{3,6})/i)?.[1] ?? "";

  // Find the cell that looks like an address (starts with a number)
  const addrIdx = cells.findIndex((c, i) => i !== caseIdx && /^\d+\s+\w/.test(c));
  const address = addrIdx !== -1 ? cells[addrIdx] : "";
  if (!address) return null;

  // Remaining cells are plaintiff/defendant (in order after case#)
  const remaining = cells.filter((_, i) => i !== caseIdx && i !== addrIdx);
  const plaintiff = remaining[0] || null;
  const defendant = remaining[1] || null;

  return {
    county: "Horry",
    saleDate,
    caseNumber,
    address,
    city: "Conway",
    state: "SC",
    plaintiff,
    defendant,
    lawFirm: null,
    bidAmount: null,
    status: null,
    sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// Georgetown County MIE Scraper
// ---------------------------------------------------------------------------

/**
 * Scrape Georgetown County foreclosure sales.
 * Georgetown posts sale listings as PDF documents linked from their
 * Foreclosure Sales page. We scrape the page for PDF links, then attempt
 * to extract text from the most recent PDF. Falls back to parsing the
 * HTML listing page itself if PDF links contain embedded text previews.
 */
export async function scrapeGeorgetownSales(): Promise<MIESaleEntry[]> {
  const listingUrl = "https://www.gtcounty.org/223/Foreclosure-Sales";

  try {
    const resp = await fetch(listingUrl, { signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.warn(`[MIE-Georgetown] HTTP ${resp.status}`);
      return [];
    }
    const html = await resp.text();

    // Find PDF links on the page (DocumentCenter/View/XXXX)
    const pdfLinks: { url: string; label: string }[] = [];
    const linkRegex = /href="([^"]*DocumentCenter\/View\/\d+[^"]*)"\s*[^>]*>([^<]*)/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      const href = linkMatch[1].startsWith("http")
        ? linkMatch[1]
        : `https://www.gtcounty.org${linkMatch[1]}`;
      pdfLinks.push({ url: href, label: linkMatch[2].trim() });
    }

    console.log(`[MIE-Georgetown] Found ${pdfLinks.length} PDF links`);

    // Try to extract sale date from the most recent PDF link label
    // Labels often contain month/year like "February 2026 Foreclosure Sales"
    const entries: MIESaleEntry[] = [];

    for (const link of pdfLinks.slice(0, 3)) {
      // Extract month/year from label
      const dateMatch = link.label.match(
        /(\w+)\s+(\d{4})/
      );
      let saleDate = "";
      if (dateMatch) {
        // First Monday of the given month
        const monthStr = dateMatch[1];
        const year = parseInt(dateMatch[2]);
        const monthIdx = new Date(`${monthStr} 1, ${year}`).getMonth();
        if (!isNaN(monthIdx)) {
          const firstMonday = getFirstMondayOfMonth(year, monthIdx);
          saleDate = firstMonday.toISOString().split("T")[0];
        }
      }

      if (!saleDate) continue;
      // Skip dates older than 60 days (keep recent past for distress stage updates)
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      if (new Date(saleDate) < sixtyDaysAgo) continue;

      // Try to fetch the PDF and extract text
      // PDF parsing in a serverless env is limited — we'll extract what we can
      // from the raw bytes looking for readable text streams
      try {
        const pdfResp = await fetch(link.url, { signal: AbortSignal.timeout(20000) });
        if (!pdfResp.ok) continue;
        const buffer = await pdfResp.arrayBuffer();
        const text = extractTextFromPdfBuffer(buffer);

        if (text.length > 50) {
          const pdfEntries = parseGeorgetownPdfText(text, saleDate, link.url);
          entries.push(...pdfEntries);
          console.log(`[MIE-Georgetown] Extracted ${pdfEntries.length} entries from ${link.label}`);
        }
      } catch (err) {
        console.warn(`[MIE-Georgetown] Failed to fetch PDF ${link.label}:`,
          err instanceof Error ? err.message : err);
      }
    }

    console.log(`[MIE-Georgetown] Total entries: ${entries.length}`);
    return entries;
  } catch (err) {
    console.warn("[MIE-Georgetown] Scrape failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Lightweight PDF text extractor — pulls readable ASCII strings from
 * PDF binary data. Won't handle all PDFs perfectly, but Georgetown's
 * simple sale listing PDFs contain plain text streams that this can grab.
 */
function extractTextFromPdfBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  // Find text between stream...endstream markers
  const chunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
  let m;
  while ((m = streamRegex.exec(raw)) !== null) {
    // Extract parenthesized text strings: (text here)
    const textRegex = /\(([^)]{2,})\)/g;
    let tm;
    while ((tm = textRegex.exec(m[1])) !== null) {
      const t = tm[1].replace(/\\n/g, "\n").replace(/\\\(/g, "(").replace(/\\\)/g, ")");
      if (/[a-zA-Z]{2,}/.test(t)) {
        chunks.push(t);
      }
    }
  }

  // Also try BT...ET text blocks with Tj/TJ operators
  const btRegex = /BT\s([\s\S]*?)ET/g;
  while ((m = btRegex.exec(raw)) !== null) {
    const tjRegex = /\(([^)]{2,})\)\s*Tj/g;
    let tm;
    while ((tm = tjRegex.exec(m[1])) !== null) {
      const t = tm[1].replace(/\\n/g, "\n");
      if (/[a-zA-Z]{2,}/.test(t)) {
        chunks.push(t);
      }
    }
  }

  return chunks.join("\n");
}

/**
 * Parse extracted text from a Georgetown MIE PDF into sale entries.
 * Georgetown PDFs typically list: case number, parties (Plaintiff v. Defendant),
 * property address, and TMS number.
 */
function parseGeorgetownPdfText(
  text: string,
  saleDate: string,
  sourceUrl: string,
): MIESaleEntry[] {
  const entries: MIESaleEntry[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Georgetown case numbers: YYYY-CP-22-XXXXX (county 22)
  // Split by case number occurrences
  const caseBlocks: { caseNumber: string; text: string }[] = [];

  const fullText = lines.join(" ");
  const caseSplits = fullText.split(/(?=\d{4}-CP-22-\d{3,6})/i);

  for (const block of caseSplits) {
    const caseMatch = block.match(/(\d{4}-CP-22-\d{3,6})/i);
    if (!caseMatch) continue;
    caseBlocks.push({ caseNumber: caseMatch[1], text: block });
  }

  for (const { caseNumber, text: blockText } of caseBlocks) {
    // Extract address
    const addrMatch = blockText.match(
      /(\d+\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Cir|Pl|Hwy|Pkwy|Loop|Trail|Ter)\.?)/i
    );
    const address = addrMatch ? addrMatch[1].trim() : "";

    // Extract plaintiff v. defendant
    const vsMatch = blockText.match(
      /(.{5,80}?)\s+(?:v\.?s?\.?)\s+(.{5,80}?)(?:\s+(?:TMS|Property|Case|\d+\s))/i
    );
    const plaintiff = vsMatch ? vsMatch[1].trim() : null;
    const defendant = vsMatch ? vsMatch[2].trim() : null;

    // Georgetown cities
    let city = "Georgetown";
    const cityMatch = blockText.match(
      /\b(Georgetown|Andrews|Pawleys Island|Murrells Inlet|Litchfield)\b/i
    );
    if (cityMatch) city = cityMatch[1];

    if (address) {
      entries.push({
        county: "Georgetown",
        saleDate,
        caseNumber,
        address,
        city,
        state: "SC",
        plaintiff,
        defendant,
        lawFirm: null,
        bidAmount: null,
        status: null,
        sourceUrl,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Get the first Monday of a given month. */
function getFirstMondayOfMonth(year: number, month: number): Date {
  const d = new Date(year, month, 1);
  const day = d.getDay();
  // Monday = 1. If day is 0 (Sun), add 1. If day is 2 (Tue), add 6. etc.
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  d.setDate(1 + daysUntilMonday);
  return d;
}

/** Get the next first Monday from today. */
function getNextFirstMonday(): Date {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  // Try this month first
  let firstMon = getFirstMondayOfMonth(year, month);
  if (firstMon > now) return firstMon;

  // Otherwise next month
  month++;
  if (month > 11) { month = 0; year++; }
  return getFirstMondayOfMonth(year, month);
}

// ---------------------------------------------------------------------------
// Orchestrator: Scrape all counties
// ---------------------------------------------------------------------------

export interface ScrapeAllResult {
  county: string;
  entries: MIESaleEntry[];
  error?: string;
}

/**
 * Scrape all 3 counties in parallel and return combined results.
 */
export async function scrapeAllCounties(): Promise<ScrapeAllResult[]> {
  const results: ScrapeAllResult[] = [];

  // Greenville — get sale dates first, then scrape each
  try {
    const dates = await getGreenvilleSaleDates();
    const allGreenville: MIESaleEntry[] = [];
    for (const d of dates.slice(0, 6)) {
      const entries = await scrapeGreenvilleSales(d);
      allGreenville.push(...entries);
    }
    results.push({ county: "Greenville", entries: allGreenville });
    console.log(`[MIE] Greenville: ${allGreenville.length} entries from ${dates.length} sale dates`);
  } catch (err) {
    results.push({
      county: "Greenville",
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Horry
  try {
    const horryEntries = await scrapeHorrySales();
    results.push({ county: "Horry", entries: horryEntries });
    console.log(`[MIE] Horry: ${horryEntries.length} entries`);
  } catch (err) {
    results.push({
      county: "Horry",
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Georgetown
  try {
    const georgetownEntries = await scrapeGeorgetownSales();
    results.push({ county: "Georgetown", entries: georgetownEntries });
    console.log(`[MIE] Georgetown: ${georgetownEntries.length} entries`);
  } catch (err) {
    results.push({
      county: "Georgetown",
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}
