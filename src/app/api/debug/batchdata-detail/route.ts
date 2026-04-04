import { NextResponse } from "next/server";

const BASE = "https://api.batchdata.com/api/v1";
const KEY = () => process.env.BATCHDATA_API_KEY;
const hdrs = () => ({
  "Content-Type": "application/json",
  Authorization: "Bearer " + KEY(),
});

export async function GET() {
  if (!process.env.BATCHDATA_API_KEY)
    return NextResponse.json({ error: "No key" }, { status: 500 });

  // 1) compAddress search to get _id
  const searchResp = await fetch(BASE + "/property/search", {
    method: "POST",
    headers: hdrs(),
    body: JSON.stringify({
      searchCriteria: {
        compAddress: {
          street: "908 Metherton Ct",
          city: "Myrtle Beach",
          state: "SC",
          zip: "29579",
        },
      },
      options: { skip: 0, take: 1, useDistance: true, distanceMiles: 1 },
    }),
  });
  const searchData = await searchResp.json();
  const firstProp = searchData?.results?.properties?.[0];
  const propId = firstProp?._id;

  // 2) GET /property/:id for full detail
  let detail = null;
  let detailError = null;
  if (propId) {
    try {
      const dResp = await fetch(
        BASE + "/property/" + encodeURIComponent(propId),
        { headers: hdrs() },
      );
      detail = await dResp.json();
    } catch (e: any) {
      detailError = e.message;
    }
  }

  // 3) POST /property/lookup by address
  let lookupData = null;
  let lookupError = null;
  try {
    const lookupResp = await fetch(BASE + "/property/lookup", {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        requests: [
          {
            street: "908 Metherton Ct",
            city: "Myrtle Beach",
            state: "SC",
            zip: "29579",
          },
        ],
      }),
    });
    lookupData = await lookupResp.json();
  } catch (e: any) {
    lookupError = e.message;
  }

  return NextResponse.json({
    searchPropId: propId,
    searchFirstPropKeys: firstProp ? Object.keys(firstProp) : [],
    detailError,
    detailKeys: detail ? Object.keys(detail) : [],
    detailSale: detail?.sale ?? detail?.results?.sale ?? "none",
    detailBuilding: detail?.building ?? detail?.results?.building ?? "none",
    detailValuation:
      detail?.valuation ?? detail?.results?.valuation ?? "none",
    detailFull: detail,
    lookupError,
    lookupKeys: lookupData?.results
      ? Object.keys(lookupData.results)
      : Object.keys(lookupData || {}),
    lookupSample: lookupData?.results?.properties?.[0] ?? lookupData,
  });
}
