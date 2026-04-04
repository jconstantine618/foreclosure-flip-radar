import { NextResponse } from "next/server";

export async function GET() {
    const apiKey = process.env.BATCHDATA_API_KEY;
    if (!apiKey) {
          return NextResponse.json({ error: "No API key" }, { status: 500 });
    }

  const body = {
        searchCriteria: {
                compAddress: {
                          street: "908 Metherton Ct",
                          city: "Myrtle Beach",
                          state: "SC",
                          zip: "29579",
                },
        },
        options: { skip: 0, take: 2, useDistance: true, distanceMiles: 1 },
  };

  const resp = await fetch("https://api.batchdata.com/api/v1/property/search", {
        method: "POST",
        headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
  });

  const data = await resp.json();
    const firstProp = data?.results?.properties?.[0] || null;

  return NextResponse.json({
        status: resp.status,
        total: data?.results?.total ?? 0,
        sampleKeys: firstProp ? Object.keys(firstProp) : [],
        saleObj: firstProp?.sale ?? "no sale key",
        valuationObj: firstProp?.valuation ?? "no valuation key",
        buildingObj: firstProp?.building ?? "no building key",
        addressObj: firstProp?.address ?? "no address key",
        fullSample: firstProp,
  });
}
