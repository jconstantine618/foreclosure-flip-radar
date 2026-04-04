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

  // 1) compAddress search - get a comp address
  const compResp = await fetch(BASE + "/property/search", {
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
      options: { skip: 0, take: 3, useDistance: true, distanceMiles: 1 },
    }),
  });
  const compData = await compResp.json();
  const compAddr = compData?.results?.properties?.[0]?.address;

  // 2) Regular query search using the comp address
  let queryData = null;
  if (compAddr) {
    const addrStr = (compAddr.street || "") + ", " + (compAddr.city || "") + ", " + (compAddr.state || "") + " " + (compAddr.zip || "");
    const queryResp = await fetch(BASE + "/property/search", {
      method: "POST",
      headers: hdrs(),
      body: JSON.stringify({
        searchCriteria: { query: addrStr },
        options: { take: 1 },
      }),
    });
    queryData = await queryResp.json();
  }

  const queryProp = queryData?.results?.properties?.[0];

  return NextResponse.json({
    compSearchKeys: compData?.results?.properties?.[0]
      ? Object.keys(compData.results.properties[0])
      : [],
    compAddress: compAddr,
    querySearchKeys: queryProp ? Object.keys(queryProp) : [],
    queryHasSale: !!queryProp?.sale,
    queryHasBuilding: !!queryProp?.building,
    queryHasValuation: !!queryProp?.valuation,
    queryHasMortgage: !!queryProp?.mortgage,
    querySale: queryProp?.sale || "none",
    queryBuilding: queryProp?.building || "none",
    queryValuation: queryProp?.valuation || "none",
    queryFull: queryProp,
  });
}
