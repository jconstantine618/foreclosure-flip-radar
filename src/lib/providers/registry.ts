import type {
  GeocodingProvider,
  NoticeProvider,
  PropertyProvider,
  ValuationProvider,
} from "./interfaces";

// ---------------------------------------------------------------------------
// ProviderRegistry – singleton that stores registered providers by type/name
// ---------------------------------------------------------------------------

class ProviderRegistry {
  private static instance: ProviderRegistry;

  private propertyProviders = new Map<string, PropertyProvider>();
  private noticeProviders = new Map<string, NoticeProvider>();
  private valuationProviders = new Map<string, ValuationProvider>();
  private geocodingProviders = new Map<string, GeocodingProvider>();

  private defaultPropertyProvider: string | null = null;
  private defaultNoticeProvider: string | null = null;
  private defaultValuationProvider: string | null = null;
  private defaultGeocodingProvider: string | null = null;

  private constructor() {}

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  // -------------------------------------------------------------------------
  // Property providers
  // -------------------------------------------------------------------------

  registerPropertyProvider(
    provider: PropertyProvider,
    isDefault = false,
  ): void {
    this.propertyProviders.set(provider.name, provider);
    if (isDefault || this.propertyProviders.size === 1) {
      this.defaultPropertyProvider = provider.name;
    }
  }

  getPropertyProvider(name?: string): PropertyProvider | undefined {
    if (name) return this.propertyProviders.get(name);
    if (this.defaultPropertyProvider) {
      return this.propertyProviders.get(this.defaultPropertyProvider);
    }
    return undefined;
  }

  getAllPropertyProviders(): PropertyProvider[] {
    return Array.from(this.propertyProviders.values());
  }

  // -------------------------------------------------------------------------
  // Notice providers
  // -------------------------------------------------------------------------

  registerNoticeProvider(
    provider: NoticeProvider,
    isDefault = false,
  ): void {
    this.noticeProviders.set(provider.name, provider);
    if (isDefault || this.noticeProviders.size === 1) {
      this.defaultNoticeProvider = provider.name;
    }
  }

  getNoticeProvider(name?: string): NoticeProvider | undefined {
    if (name) return this.noticeProviders.get(name);
    if (this.defaultNoticeProvider) {
      return this.noticeProviders.get(this.defaultNoticeProvider);
    }
    return undefined;
  }

  getAllNoticeProviders(): NoticeProvider[] {
    return Array.from(this.noticeProviders.values());
  }

  // -------------------------------------------------------------------------
  // Valuation providers
  // -------------------------------------------------------------------------

  registerValuationProvider(
    provider: ValuationProvider,
    isDefault = false,
  ): void {
    this.valuationProviders.set(provider.name, provider);
    if (isDefault || this.valuationProviders.size === 1) {
      this.defaultValuationProvider = provider.name;
    }
  }

  getValuationProvider(name?: string): ValuationProvider | undefined {
    if (name) return this.valuationProviders.get(name);
    if (this.defaultValuationProvider) {
      return this.valuationProviders.get(this.defaultValuationProvider);
    }
    return undefined;
  }

  getAllValuationProviders(): ValuationProvider[] {
    return Array.from(this.valuationProviders.values());
  }

  // -------------------------------------------------------------------------
  // Geocoding providers
  // -------------------------------------------------------------------------

  registerGeocodingProvider(
    provider: GeocodingProvider,
    isDefault = false,
  ): void {
    this.geocodingProviders.set(provider.name, provider);
    if (isDefault || this.geocodingProviders.size === 1) {
      this.defaultGeocodingProvider = provider.name;
    }
  }

  getGeocodingProvider(name?: string): GeocodingProvider | undefined {
    if (name) return this.geocodingProviders.get(name);
    if (this.defaultGeocodingProvider) {
      return this.geocodingProviders.get(this.defaultGeocodingProvider);
    }
    return undefined;
  }

  getAllGeocodingProviders(): GeocodingProvider[] {
    return Array.from(this.geocodingProviders.values());
  }

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  /** Reset all providers (mainly for testing). */
  clear(): void {
    this.propertyProviders.clear();
    this.noticeProviders.clear();
    this.valuationProviders.clear();
    this.geocodingProviders.clear();
    this.defaultPropertyProvider = null;
    this.defaultNoticeProvider = null;
    this.defaultValuationProvider = null;
    this.defaultGeocodingProvider = null;
  }
}

export const providerRegistry = ProviderRegistry.getInstance();
export default providerRegistry;
