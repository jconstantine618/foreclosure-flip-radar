/**
 * Public Records URL Builder
 *
 * Constructs deep-link URLs to South Carolina county public records services
 * (court case index, register of deeds, and tax portals) using case numbers,
 * owner names, parcel numbers, and addresses already in our database.
 *
 * NO SCRAPING: We only construct URLs from existing data. SC Courts has
 * expressly prohibited scraping (https://www.sccourts.org/).
 *
 * Supported counties: Greenville, Horry, Georgetown
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicRecordLinks {
  /** Deep link to SC Courts Public Index for a case number (if available) */
  courtIndexUrl: string | null;
  /** Deep link to county Register of Deeds search (owner or parcel) */
  rodSearchUrl: string | null;
  /** Deep link to county tax assessor portal (parcel or address) */
  taxPortalUrl: string | null;
}

export interface BuildRecordLinksParams {
  /** County name (e.g., "Greenville", "Horry", "Georgetown") */
  county: string;
  /** Case number from a MIE (Master in Equity) notice */
  caseNumber?: string | null;
  /** Owner name for deed/property searches */
  ownerName?: string | null;
  /** Parcel number / PIN for tax portal searches */
  parcelNumber?: string | null;
  /** Street address for tax portal searches (fallback if no parcel) */
  streetAddress?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SC Courts Public Index
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build URL to SC Courts Public Index for a case number.
 * County-specific URLs are: https://publicindex.sccourts.org/[county-lowercase]/publicindex/
 * Case numbers should NOT contain spaces or dashes.
 *
 * Reference: https://publicindex.sccourts.org/
 * Note: Direct URL parameters for case search are not documented in public API.
 * This returns the county-specific public index homepage where users can search.
 */
function buildCourtIndexUrl(county: string, caseNumber?: string | null): string | null {
  if (!caseNumber || caseNumber.trim() === "") {
    return null;
  }

  const countyLower = county.toLowerCase();
  const cleanCaseNumber = caseNumber.replace(/[\s\-]/g, "");

  if (!cleanCaseNumber) {
    return null;
  }

  // County-specific public index URL
  const baseUrl = `https://publicindex.sccourts.org/${countyLower}/publicindex/`;

  // Note: SC Courts Public Index does not expose documented URL query parameters
  // for direct case searches. Users must use the search interface on the site.
  // This returns the county entry point; users will search from there.
  // TODO: Contact SC Courts to determine if direct case number URL parameters exist
  return baseUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Register of Deeds (Greenville, Horry, Georgetown)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build Register of Deeds search URL for Greenville County.
 * Primary ROD search: https://www.greenvillecounty.org/rod/searchrecords.aspx
 * Alternative: https://greenville.sc.publicsearch.us/
 *
 * Reference: https://www.greenvillecounty.org/rod/searchrecords.aspx
 */
function buildGreenvilleRodUrl(ownerName?: string | null, parcelNumber?: string | null): string | null {
  // Greenville ROD search page (user will enter name or parcel manually)
  // No documented URL parameters, so return the search entry point
  return "https://www.greenvillecounty.org/rod/searchrecords.aspx";
}

/**
 * Build Register of Deeds search URL for Horry County.
 * Primary search: https://www.horrycountysc.gov/apps/LandRecords/
 * Also available: https://acclaimweb.horrycounty.org/acclaimweb (party name search)
 *
 * Reference: https://www.horrycountysc.gov/departments/register-of-deeds/
 *            https://www.horrycountysc.gov/apps/LandRecords/
 *
 * Note: As of March 16, free user login is required for property address info.
 */
function buildHorryRodUrl(ownerName?: string | null, parcelNumber?: string | null): string | null {
  // Horry Land Records application (requires login for address info)
  return "https://www.horrycountysc.gov/apps/LandRecords/";
}

/**
 * Build Register of Deeds search URL for Georgetown County.
 * Primary search: https://www.georgetowndeeds.com/ (online record system)
 * Alternative: https://qpublic.schneidercorp.com/Application.aspx?App=GeorgetownCountySC&Layer=Parcels&PageType=Search
 *
 * Reference: https://www.georgetowndeeds.com/
 *            https://www.gtcounty.org/178/Register-of-Deeds
 */
function buildGeorgetownRodUrl(ownerName?: string | null, parcelNumber?: string | null): string | null {
  // Georgetown Online Record System
  return "https://www.georgetowndeeds.com/";
}

/**
 * Route to appropriate county ROD URL builder.
 */
function buildRodSearchUrl(county: string, ownerName?: string | null, parcelNumber?: string | null): string | null {
  const countyLower = county.toLowerCase();

  if (countyLower === "greenville") {
    return buildGreenvilleRodUrl(ownerName, parcelNumber);
  } else if (countyLower === "horry") {
    return buildHorryRodUrl(ownerName, parcelNumber);
  } else if (countyLower === "georgetown") {
    return buildGeorgetownRodUrl(ownerName, parcelNumber);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tax Portals (Greenville, Horry, Georgetown)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build tax assessor portal URL for Greenville County.
 * Primary: https://www.greenvillecounty.org/appsas400/RealProperty/
 * Also: https://www.gcgis.org/apps/GreenvilleJS/ (GIS-based with PIN parameter support)
 *
 * Reference: https://www.greenvillecounty.org/appsas400/RealProperty/
 *            https://www.gcgis.org/apps/GreenvilleJS/
 */
function buildGrenevilleTaxPortalUrl(parcelNumber?: string | null, streetAddress?: string | null): string | null {
  // Base URL for Real Property Services
  const baseUrl = "https://www.greenvillecounty.org/appsas400/RealProperty/";

  // If we have a parcel number, try to use the GIS with PIN parameter
  if (parcelNumber && parcelNumber.trim() !== "") {
    const pin = encodeURIComponent(parcelNumber.trim());
    return `https://www.gcgis.org/apps/GreenvilleJS/?PIN=${pin}`;
  }

  // Fall back to main Real Property search page
  return baseUrl;
}

/**
 * Build tax assessor portal URL for Horry County.
 * Primary: https://www.horrycountysc.gov/apps/LandRecords/
 * Also: https://qpublic.net/sc/scassessors/ (qPublic system)
 *
 * Reference: https://www.horrycountysc.gov/departments/assessor/
 *            https://www.horrycountysc.gov/apps/LandRecords/
 *
 * Note: As of March 16, free user login required for property address info.
 */
function buildHorryTaxPortalUrl(parcelNumber?: string | null, streetAddress?: string | null): string | null {
  // Horry County Land Records (includes tax/assessor info, requires login for addresses)
  return "https://www.horrycountysc.gov/apps/LandRecords/";
}

/**
 * Build tax assessor portal URL for Georgetown County.
 * Primary: https://qpublic.schneidercorp.com/Application.aspx?App=GeorgetownCountySC&Layer=Parcels&PageType=Search
 * Also: https://www.qpublic.net/sc/georgetown/search.html
 *
 * Reference: https://qpublic.schneidercorp.com/Application.aspx?App=GeorgetownCountySC&Layer=Parcels&PageType=Search
 *            https://www.qpublic.net/sc/georgetown/search.html
 */
function buildGeorgetownTaxPortalUrl(parcelNumber?: string | null, streetAddress?: string | null): string | null {
  // qPublic-based assessment search for Georgetown
  return "https://qpublic.schneidercorp.com/Application.aspx?App=GeorgetownCountySC&Layer=Parcels&PageType=Search";
}

/**
 * Route to appropriate county tax portal builder.
 */
function buildTaxPortalUrl(county: string, parcelNumber?: string | null, streetAddress?: string | null): string | null {
  const countyLower = county.toLowerCase();

  if (countyLower === "greenville") {
    return buildGrenevilleTaxPortalUrl(parcelNumber, streetAddress);
  } else if (countyLower === "horry") {
    return buildHorryTaxPortalUrl(parcelNumber, streetAddress);
  } else if (countyLower === "georgetown") {
    return buildGeorgetownTaxPortalUrl(parcelNumber, streetAddress);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct deep-link URLs to South Carolina public records services.
 *
 * @param params - Object containing county, caseNumber, ownerName, parcelNumber, streetAddress
 * @returns PublicRecordLinks with courtIndexUrl, rodSearchUrl, and taxPortalUrl
 *
 * Each URL will be null if:
 * - The required data for that service is missing (e.g., no case number for court index)
 * - The county is not supported (currently: Greenville, Horry, Georgetown)
 *
 * Example:
 *   const links = buildRecordLinks({
 *     county: "Greenville",
 *     caseNumber: "2024CV123456",
 *     ownerName: "John Doe",
 *     parcelNumber: "R12345678"
 *   });
 *   // Returns:
 *   // {
 *   //   courtIndexUrl: "https://publicindex.sccourts.org/greenville/publicindex/",
 *   //   rodSearchUrl: "https://www.greenvillecounty.org/rod/searchrecords.aspx",
 *   //   taxPortalUrl: "https://www.gcgis.org/apps/GreenvilleJS/?PIN=R12345678"
 *   // }
 */
export function buildRecordLinks(params: BuildRecordLinksParams): PublicRecordLinks {
  const { county, caseNumber, ownerName, parcelNumber, streetAddress } = params;

  return {
    courtIndexUrl: buildCourtIndexUrl(county, caseNumber),
    rodSearchUrl: buildRodSearchUrl(county, ownerName, parcelNumber),
    taxPortalUrl: buildTaxPortalUrl(county, parcelNumber, streetAddress),
  };
}
