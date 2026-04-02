// ---------------------------------------------------------------------------
// Email templates for Foreclosure Flip Radar alert types
// ---------------------------------------------------------------------------

const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

/** Color code a flip score: green >= 80, yellow >= 60, red below */
function scoreColor(score: number): string {
  if (score >= 80) return '#16a34a';
  if (score >= 60) return '#ca8a04';
  return '#dc2626';
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  return 'Cold';
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <tr><td style="background:#1e293b;padding:20px 24px;">
    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Foreclosure Flip Radar</h1>
  </td></tr>
  <tr><td style="padding:24px;">
    ${body}
  </td></tr>
  <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
    <a href="${BASE_URL}/settings/alerts" style="color:#94a3b8;">Manage alert preferences</a>
    &nbsp;&middot;&nbsp;
    <a href="${BASE_URL}/unsubscribe" style="color:#94a3b8;">Unsubscribe</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Property card snippet (reused across templates)
// ---------------------------------------------------------------------------

function propertyCard(data: any): string {
  const score = data.flipScore ?? data.score ?? 0;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:16px;">
      <tr><td style="padding:16px;">
        <h2 style="margin:0 0 4px;font-size:16px;color:#1e293b;">${data.address ?? 'Unknown Address'}</h2>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;">${data.county ?? ''} County &middot; ${data.propertyType ?? 'Property'}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          <tr>
            <td style="padding-right:16px;text-align:center;">
              <div style="display:inline-block;background:${scoreColor(score)};color:#fff;font-weight:700;font-size:18px;border-radius:50%;width:48px;height:48px;line-height:48px;text-align:center;">${Math.round(score)}</div>
              <div style="font-size:11px;color:${scoreColor(score)};font-weight:600;margin-top:4px;">${scoreLabel(score)}</div>
            </td>
            <td style="font-size:13px;color:#475569;line-height:1.6;">
              <strong>ARV:</strong> ${formatCurrency(data.estimatedARV)}<br>
              <strong>Rehab:</strong> ${formatCurrency(data.estimatedRehabCost)}<br>
              <strong>MAO:</strong> ${formatCurrency(data.maxAllowableOffer)}
            </td>
            <td style="padding-left:24px;font-size:13px;color:#475569;line-height:1.6;">
              <strong>Target Price:</strong> ${formatCurrency(data.targetPurchasePrice)}<br>
              <strong>Gross Margin:</strong> ${data.projectedGrossMargin != null ? `${Math.round(data.projectedGrossMargin)}%` : 'N/A'}<br>
              <strong>Days to Flip:</strong> ${data.projectedDaysToFlip ?? 'N/A'}
            </td>
          </tr>
        </table>

        ${data.auctionDate ? `<p style="margin:0;font-size:13px;color:#dc2626;font-weight:600;">Auction: ${formatDate(data.auctionDate)}${data.daysUntilSale != null ? ` (${data.daysUntilSale} days)` : ''}</p>` : ''}
      </td></tr>
    </table>

    <a href="${BASE_URL}/opportunities/${data.opportunityId ?? data.id ?? ''}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">View Opportunity</a>
  `;
}

// ---------------------------------------------------------------------------
// Individual templates
// ---------------------------------------------------------------------------

function newOpportunityTemplate(data: any): { subject: string; html: string } {
  const subject = `New Opportunity: ${data.address ?? 'Property'} (Score ${Math.round(data.flipScore ?? 0)})`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b;">New Opportunity Detected</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">A new foreclosure opportunity matching your criteria has been identified.</p>
    ${propertyCard(data)}
  `;
  return { subject, html: layout(subject, body) };
}

function hotLeadTemplate(data: any): { subject: string; html: string } {
  const score = Math.round(data.flipScore ?? data.score ?? 0);
  const subject = `Hot Lead Alert: Score ${score} - ${data.address ?? 'Property'}`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#dc2626;">Hot Lead Alert</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">An opportunity has reached a flip score of <strong>${score}</strong>, exceeding your threshold.</p>
    ${propertyCard(data)}
  `;
  return { subject, html: layout(subject, body) };
}

function auctionApproachingTemplate(data: any): { subject: string; html: string } {
  const days = data.daysUntilSale ?? '?';
  const subject = `Auction in ${days} Day${days === 1 ? '' : 's'}: ${data.address ?? 'Property'}`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#ca8a04;">Auction Approaching</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">An auction for a property on your radar is coming up in <strong>${days} day${days === 1 ? '' : 's'}</strong>.</p>
    ${propertyCard(data)}
  `;
  return { subject, html: layout(subject, body) };
}

function statusChangedTemplate(data: any): { subject: string; html: string } {
  const subject = `Status Changed: ${data.address ?? 'Property'} - ${data.oldStage ?? '?'} to ${data.newStage ?? '?'}`;
  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b;">Status Change</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      Pipeline stage changed from <strong>${data.oldStage ?? 'Unknown'}</strong> to <strong>${data.newStage ?? 'Unknown'}</strong>.
    </p>
    ${propertyCard(data)}
  `;
  return { subject, html: layout(subject, body) };
}

function dailyDigestTemplate(data: any): { subject: string; html: string } {
  const count = data.opportunities?.length ?? 0;
  const subject = `Daily Digest: ${count} New Opportunit${count === 1 ? 'y' : 'ies'}`;
  const cards = (data.opportunities ?? [])
    .slice(0, 10)
    .map((opp: any) => propertyCard(opp))
    .join('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">');

  const body = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#1e293b;">Your Daily Digest</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#475569;">
      ${count} new opportunit${count === 1 ? 'y' : 'ies'} matched your criteria in the last 24 hours.
    </p>
    ${count > 0 ? cards : '<p style="color:#94a3b8;font-style:italic;">No new matches today.</p>'}
    ${count > 10 ? `<p style="margin-top:16px;font-size:13px;color:#64748b;">Showing 10 of ${count}. <a href="${BASE_URL}/opportunities" style="color:#2563eb;">View all</a></p>` : ''}
  `;
  return { subject, html: layout(subject, body) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getAlertEmailHtml(
  alertType: string,
  data: any,
): { subject: string; html: string } {
  switch (alertType) {
    case 'NEW_OPPORTUNITY':
      return newOpportunityTemplate(data);
    case 'HOT_LEAD':
      return hotLeadTemplate(data);
    case 'AUCTION_APPROACHING':
      return auctionApproachingTemplate(data);
    case 'STATUS_CHANGED':
      return statusChangedTemplate(data);
    case 'DAILY_DIGEST':
      return dailyDigestTemplate(data);
    default:
      return {
        subject: `Foreclosure Flip Radar Alert`,
        html: layout('Alert', `<p style="font-size:14px;color:#475569;">You have a new alert. <a href="${BASE_URL}/opportunities" style="color:#2563eb;">View opportunities</a></p>`),
      };
  }
}
