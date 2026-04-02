import logger from "@/lib/logger";
import type {
  CountyAdapter,
  CountyAdapterConfig,
  RawNoticeRecord,
  NormalizedNotice,
} from "./types";

// ---------------------------------------------------------------------------
// BaseCountyAdapter — abstract base class with shared HTTP, retry, and
// rate-limiting logic. Subclasses implement the county-specific scraping.
// ---------------------------------------------------------------------------

export abstract class BaseCountyAdapter implements CountyAdapter {
  abstract readonly name: string;
  abstract readonly county: string;
  abstract readonly state: string;

  protected config: CountyAdapterConfig;

  /** Minimum delay (ms) between consecutive HTTP requests. */
  protected minRequestDelayMs: number;

  /** Maximum retry attempts for transient failures. */
  protected maxRetries: number;

  /** Timestamp of the last outbound request (for rate-limiting). */
  private lastRequestAt = 0;

  constructor(config: Partial<CountyAdapterConfig> = {}) {
    this.config = {
      county: config.county ?? "",
      state: config.state ?? "SC",
      enabled: config.enabled ?? true,
      refreshIntervalMinutes: config.refreshIntervalMinutes ?? 60,
      baseUrl: config.baseUrl,
    };
    this.minRequestDelayMs = 2000;
    this.maxRetries = 3;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  abstract fetchNotices(options?: { since?: Date }): Promise<RawNoticeRecord[]>;
  abstract parseNotice(raw: RawNoticeRecord): NormalizedNotice;

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = this.config.baseUrl;
      if (!url) {
        return { ok: false, message: "No baseUrl configured" };
      }
      const res = await this.httpGet(url);
      if (res.ok) {
        return { ok: true, message: `Reachable (HTTP ${res.status})` };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    }
  }

  // -------------------------------------------------------------------------
  // HTTP helper — rate-limited, with proper headers
  // -------------------------------------------------------------------------

  protected async httpGet(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    await this.enforceRateLimit();

    const defaultHeaders: Record<string, string> = {
      "User-Agent":
        "ForeclosureFlipRadar/1.0 (research; +https://foreclosureflipradar.com)",
      Accept: "text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    };

    const mergedHeaders = { ...defaultHeaders, ...headers };

    logger.debug({ adapter: this.name }, `HTTP GET ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: mergedHeaders,
      signal: AbortSignal.timeout(30_000),
    });

    this.lastRequestAt = Date.now();
    return response;
  }

  /**
   * Fetch a URL as text with automatic retries and exponential backoff.
   */
  protected async fetchWithRetry(url: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.httpGet(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        return await response.text();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        logger.warn(
          { adapter: this.name },
          `Fetch attempt ${attempt}/${this.maxRetries} failed for ${url}: ${lastError.message}`,
        );

        if (attempt < this.maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await this.sleep(backoffMs);
        }
      }
    }

    logger.error({ adapter: this.name }, `All ${this.maxRetries} attempts failed for ${url}`);
    throw lastError!;
  }

  // -------------------------------------------------------------------------
  // robots.txt — simple, best-effort check
  // -------------------------------------------------------------------------

  /**
   * Check whether we are allowed to fetch the given URL according to
   * the site's robots.txt.  This is a simplified check — it only looks
   * for Disallow rules that apply to our User-Agent or to *.
   */
  protected async checkRobotsTxt(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      const robotsUrl = `${parsed.origin}/robots.txt`;

      const response = await this.httpGet(robotsUrl);
      if (!response.ok) {
        // No robots.txt or unreachable — assume allowed
        return true;
      }

      const text = await response.text();
      const path = parsed.pathname;

      let appliesToUs = false;
      const lines = text.split("\n");

      for (const rawLine of lines) {
        const line = rawLine.trim().toLowerCase();

        if (line.startsWith("user-agent:")) {
          const agent = line.slice("user-agent:".length).trim();
          appliesToUs = agent === "*" || agent.includes("foreclosureflipradar");
        }

        if (appliesToUs && line.startsWith("disallow:")) {
          const disallowed = line.slice("disallow:".length).trim();
          if (disallowed && path.startsWith(disallowed)) {
            logger.warn({ adapter: this.name, robotsUrl }, `robots.txt disallows ${path}`);
            return false;
          }
        }
      }

      return true;
    } catch {
      // If we cannot check, default to allowed
      return true;
    }
  }

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minRequestDelayMs) {
      const waitMs = this.minRequestDelayMs - elapsed;
      logger.debug({ adapter: this.name }, `Rate-limiting: waiting ${waitMs}ms`);
      await this.sleep(waitMs);
    }
  }

  // -------------------------------------------------------------------------
  // Utility helpers
  // -------------------------------------------------------------------------

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Strip HTML tags from a string, decode common entities, and collapse
   * whitespace.
   */
  protected stripHtml(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|tr|li)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Extract text content from inside an HTML table, returning an array
   * of rows, each row being an array of cell values.
   */
  protected parseHtmlTable(html: string): string[][] {
    const rows: string[][] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(this.stripHtml(cellMatch[1]).trim());
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    return rows;
  }
}
