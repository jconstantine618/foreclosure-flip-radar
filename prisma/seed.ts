import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Create default organization
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: { id: 'default-org', name: 'FFR Default' },
  });

  // 2. Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@flipradar.com' },
    update: {},
    create: {
      email: 'admin@flipradar.com',
      name: 'Admin User',
      role: 'ADMIN',
      orgId: org.id,
    },
  });

  // 3. Seed counties config as AdminSettings
  const counties = [
    { key: 'county:greenville', value: { name: 'Greenville', state: 'SC', enabled: true, refreshMinutes: 240 } },
    { key: 'county:horry', value: { name: 'Horry', state: 'SC', enabled: true, refreshMinutes: 240 } },
    { key: 'county:georgetown', value: { name: 'Georgetown', state: 'SC', enabled: true, refreshMinutes: 480 } },
  ];
  for (const c of counties) {
    await prisma.adminSetting.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: { key: c.key, value: c.value },
    });
  }

  // 4. Seed default flip score weights
  await prisma.adminSetting.upsert({
    where: { key: 'flip-score-weights' },
    update: {},
    create: {
      key: 'flip-score-weights',
      value: {
        equityScore: 15, distressUrgency: 12, arvConfidence: 10,
        daysUntilSale: 10, occupancyRisk: 8, neighborhoodTurnover: 5,
        rehabComplexity: 10, listToMarketSpeed: 5, spreadAfterCosts: 15,
        titleComplexity: 5, condoHoaPenalty: 3, floodZoneRisk: 2,
      },
    },
  });

  // 5. Seed feature flags
  const flags = [
    { key: 'flag:skip_trace_enabled', value: false },
    { key: 'flag:contact_data_enabled', value: false },
    { key: 'flag:attom_fallback_enabled', value: true },
    { key: 'flag:auto_score_on_ingest', value: true },
    { key: 'flag:auto_alert_on_ingest', value: true },
    { key: 'flag:public_notices_enabled', value: true },
    { key: 'flag:daily_digest_enabled', value: true },
  ];
  for (const f of flags) {
    await prisma.adminSetting.upsert({
      where: { key: f.key },
      update: { value: f.value },
      create: { key: f.key, value: f.value },
    });
  }

  // 6. Seed alert templates
  await prisma.adminSetting.upsert({
    where: { key: 'alert-templates' },
    update: {},
    create: {
      key: 'alert-templates',
      value: {
        NEW_OPPORTUNITY: { subject: 'New Flip Opportunity: {{address}}', enabled: true },
        HOT_LEAD: { subject: 'HOT LEAD: {{address}} - Score {{score}}', enabled: true },
        AUCTION_APPROACHING: { subject: 'Auction in {{days}} days: {{address}}', enabled: true },
        STATUS_CHANGED: { subject: 'Status Changed: {{address}} - {{newStage}}', enabled: true },
        DAILY_DIGEST: { subject: 'Daily Flip Radar Digest - {{date}}', enabled: true },
      },
    },
  });

  // 7. Seed 10 sample properties across counties
  const sampleProperties = [
    { normalizedAddress: '123 MAIN ST, GREENVILLE, SC 29601', streetAddress: '123 Main St', city: 'Greenville', state: 'SC', county: 'Greenville', zipCode: '29601', propertyType: 'SINGLE_FAMILY', bedrooms: 3, bathrooms: 2, sqft: 1450, yearBuilt: 1985, estimatedValue: 185000, mortgageBalance: 145000, equityEstimate: 40000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '456 OAK AVE, GREENVILLE, SC 29605', streetAddress: '456 Oak Ave', city: 'Greenville', state: 'SC', county: 'Greenville', zipCode: '29605', propertyType: 'SINGLE_FAMILY', bedrooms: 4, bathrooms: 2.5, sqft: 2100, yearBuilt: 1992, estimatedValue: 245000, mortgageBalance: 180000, equityEstimate: 65000, ownerOccupied: true, absenteeOwner: false },
    { normalizedAddress: '789 BEACH BLVD, MYRTLE BEACH, SC 29577', streetAddress: '789 Beach Blvd', city: 'Myrtle Beach', state: 'SC', county: 'Horry', zipCode: '29577', propertyType: 'CONDO', bedrooms: 2, bathrooms: 2, sqft: 1100, yearBuilt: 2005, estimatedValue: 195000, mortgageBalance: 160000, equityEstimate: 35000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '321 KINGS HWY, CONWAY, SC 29526', streetAddress: '321 Kings Hwy', city: 'Conway', state: 'SC', county: 'Horry', zipCode: '29526', propertyType: 'SINGLE_FAMILY', bedrooms: 3, bathrooms: 1.5, sqft: 1300, yearBuilt: 1978, estimatedValue: 155000, mortgageBalance: 95000, equityEstimate: 60000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '555 FRONT ST, GEORGETOWN, SC 29440', streetAddress: '555 Front St', city: 'Georgetown', state: 'SC', county: 'Georgetown', zipCode: '29440', propertyType: 'SINGLE_FAMILY', bedrooms: 3, bathrooms: 2, sqft: 1600, yearBuilt: 1970, estimatedValue: 165000, mortgageBalance: 110000, equityEstimate: 55000, ownerOccupied: true, absenteeOwner: false },
    { normalizedAddress: '900 PELHAM RD, GREENVILLE, SC 29615', streetAddress: '900 Pelham Rd', city: 'Greenville', state: 'SC', county: 'Greenville', zipCode: '29615', propertyType: 'TOWNHOUSE', bedrooms: 2, bathrooms: 2, sqft: 1200, yearBuilt: 2000, estimatedValue: 175000, mortgageBalance: 140000, equityEstimate: 35000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '1200 OCEAN BLVD, NORTH MYRTLE BEACH, SC 29582', streetAddress: '1200 Ocean Blvd', city: 'North Myrtle Beach', state: 'SC', county: 'Horry', zipCode: '29582', propertyType: 'CONDO', bedrooms: 3, bathrooms: 2, sqft: 1400, yearBuilt: 2008, estimatedValue: 285000, mortgageBalance: 220000, equityEstimate: 65000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '45 WADE HAMPTON BLVD, GREENVILLE, SC 29609', streetAddress: '45 Wade Hampton Blvd', city: 'Greenville', state: 'SC', county: 'Greenville', zipCode: '29609', propertyType: 'DUPLEX', bedrooms: 4, bathrooms: 2, sqft: 1800, yearBuilt: 1965, estimatedValue: 210000, mortgageBalance: 130000, equityEstimate: 80000, ownerOccupied: false, absenteeOwner: true },
    { normalizedAddress: '678 CHURCH ST, CONWAY, SC 29527', streetAddress: '678 Church St', city: 'Conway', state: 'SC', county: 'Horry', zipCode: '29527', propertyType: 'SINGLE_FAMILY', bedrooms: 3, bathrooms: 2, sqft: 1550, yearBuilt: 1988, estimatedValue: 175000, mortgageBalance: 120000, equityEstimate: 55000, ownerOccupied: true, absenteeOwner: false },
    { normalizedAddress: '234 HIGHMARKET ST, GEORGETOWN, SC 29440', streetAddress: '234 Highmarket St', city: 'Georgetown', state: 'SC', county: 'Georgetown', zipCode: '29440', propertyType: 'SINGLE_FAMILY', bedrooms: 4, bathrooms: 2.5, sqft: 2200, yearBuilt: 1950, estimatedValue: 225000, mortgageBalance: 140000, equityEstimate: 85000, ownerOccupied: false, absenteeOwner: true },
  ];

  for (const propData of sampleProperties) {
    const property = await prisma.property.create({ data: propData as any });

    // Create opportunity for each
    const distressStages = ['PRE_FORECLOSURE', 'AUCTION', 'REO', 'LIS_PENDENS', 'PRE_FORECLOSURE'];
    const pipelineStages = ['NEW', 'REVIEWING', 'DRIVE_BY', 'UNDERWRITING', 'BID_READY'];
    const idx = sampleProperties.indexOf(propData);

    await prisma.opportunity.create({
      data: {
        propertyId: property.id,
        flipScore: 40 + Math.random() * 55,
        distressStage: distressStages[idx % distressStages.length] as any,
        pipelineStage: pipelineStages[idx % pipelineStages.length] as any,
        estimatedARV: propData.estimatedValue * 1.15,
        estimatedRehabCost: 15000 + Math.random() * 35000,
        auctionDate: new Date(Date.now() + (3 + idx * 5) * 24 * 60 * 60 * 1000),
      },
    });
  }

  // 8. Create default alert rule for admin
  await prisma.alertRule.create({
    data: {
      userId: admin.id,
      name: 'Hot Leads',
      alertType: 'HOT_LEAD',
      channel: 'EMAIL',
      scoreThreshold: 75,
      countyFilter: ['Greenville', 'Horry'],
      isActive: true,
    },
  });

  // 9. Create some tags
  const tags = [
    { name: 'high-equity', color: '#22c55e' },
    { name: 'needs-rehab', color: '#f59e0b' },
    { name: 'drive-by-done', color: '#3b82f6' },
    { name: 'title-clear', color: '#10b981' },
    { name: 'flood-zone', color: '#ef4444' },
    { name: 'vacant', color: '#8b5cf6' },
  ];
  for (const tag of tags) {
    await prisma.tag.upsert({ where: { name: tag.name }, update: {}, create: tag });
  }

  console.log('Seed completed successfully');
}

main().catch(console.error).finally(() => prisma.$disconnect());
