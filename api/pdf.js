import chromium from '@sparticuz/chromium';
import { chromium as playwrightChromium } from 'playwright-core';

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sanitizeAlign(v, fallback = 'center') {
  return ['left', 'center', 'right'].includes(v) ? v : fallback;
}

function sanitizeLogoPosition(v) {
  const allowed = [
    'header-left',
    'header-center',
    'header-right',
    'footer-left',
    'footer-center',
    'footer-right'
  ];
  return allowed.includes(v) ? v : 'header-left';
}

function toMm(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return `${n}mm`;
}

function buildPrintCss(options) {
  const headerEnabled = Boolean(options.header?.enabled);
  const footerEnabled = Boolean(options.footer?.enabled);
  const logoEnabled = Boolean(options.logo?.enabled && options.logo?.dataUrl);

  const topMargin = headerEnabled || (logoEnabled && sanitizeLogoPosition(options.logo.position).startsWith('header')) ? 24 : 12;
  const bottomMargin = footerEnabled || (logoEnabled && sanitizeLogoPosition(options.logo.position).startsWith('footer')) ? 24 : 12;

  return `
@media print {
  @page {
    margin: ${topMargin}mm 10mm ${bottomMargin}mm 10mm;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .pdf-fixed-header,
  .pdf-fixed-footer {
    position: fixed;
    left: 10mm;
    right: 10mm;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    color: #111827;
    font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    z-index: 2147483647;
    pointer-events: none;
  }
  .pdf-fixed-header { top: 4mm; }
  .pdf-fixed-footer { bottom: 4mm; }
  .pdf-slot-left { text-align: left; }
  .pdf-slot-center { text-align: center; }
  .pdf-slot-right { text-align: right; }
  .pdf-logo {
    max-height: 12mm;
    width: auto;
    object-fit: contain;
    vertical-align: middle;
  }
}
`;
}

function buildBarHtml(kind, cfg, logoCfg) {
  const enabled = Boolean(cfg?.enabled);
  const text = String(cfg?.text || '').trim();
  const align = sanitizeAlign(cfg?.align, 'center');
  const fontSizePx = Math.max(8, Math.min(24, Number(cfg?.fontSize || 11)));
  const color = String(cfg?.color || '#111827');

  const logoEnabled = Boolean(logoCfg?.enabled && logoCfg?.dataUrl);
  const logoPos = sanitizeLogoPosition(logoCfg?.position);
  const logoInThisBar = logoEnabled && logoPos.startsWith(kind);
  const logoAlign = logoInThisBar ? logoPos.split('-')[1] : null;
  const logoMaxHeightMm = Math.max(4, Math.min(30, Number(logoCfg?.maxHeightMm || 10)));

  if (!enabled && !logoInThisBar) {
    return '';
  }

  const slots = {
    left: '',
    center: '',
    right: ''
  };

  if (enabled && text) {
    slots[align] += `<span style="font-size:${fontSizePx}px;color:${color};">${escapeHtml(text)}</span>`;
  }

  if (logoInThisBar) {
    slots[logoAlign] += `<img class="pdf-logo" style="max-height:${logoMaxHeightMm}mm;" src="${escapeAttr(logoCfg.dataUrl)}" alt="logo" />`;
  }

  return `
<div class="pdf-fixed-${kind}">
  <div class="pdf-slot-left">${slots.left}</div>
  <div class="pdf-slot-center">${slots.center}</div>
  <div class="pdf-slot-right">${slots.right}</div>
</div>`;
}

function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s) {
  return String(s).replaceAll('"', '&quot;');
}

async function launchBrowser() {
  const isVercel = Boolean(process.env.VERCEL);
  if (isVercel) {
    const executablePath = await chromium.executablePath();
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: chromium.headless
    });
  }

  return playwrightChromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const url = body?.url ? String(body.url) : null;
    const html = body?.html ? String(body.html) : null;

    if (!url && !html) {
      return json(res, 400, { ok: false, error: 'Provide either url or html' });
    }

    if (url) {
      const u = new URL(url);
      if (!['http:', 'https:'].includes(u.protocol)) {
        return json(res, 400, { ok: false, error: 'Only http/https URLs are supported' });
      }
    }

    const waitMs = Math.max(0, Math.min(30000, Number(body?.waitMs || 1500)));
    const format = String(body?.format || 'A4');
    const landscape = Boolean(body?.landscape);
    const printBackground = body?.printBackground !== false;

    const header = body?.header || { enabled: false };
    const footer = body?.footer || { enabled: false };
    const logo = body?.logo || { enabled: false };

    const browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: {
        width: Number(body?.viewportWidth || 1440),
        height: Number(body?.viewportHeight || 2200)
      }
    });

    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    } else {
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
    }

    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    const printCss = buildPrintCss({ header, footer, logo });
    const headerHtml = buildBarHtml('header', header, logo);
    const footerHtml = buildBarHtml('footer', footer, logo);

    await page.addStyleTag({ content: printCss });
    await page.evaluate(
      ({ headerMarkup, footerMarkup }) => {
        const removeIfExists = (selector) => {
          document.querySelectorAll(selector).forEach((n) => n.remove());
        };

        removeIfExists('.pdf-fixed-header');
        removeIfExists('.pdf-fixed-footer');

        if (headerMarkup) {
          document.body.insertAdjacentHTML('beforeend', headerMarkup);
        }
        if (footerMarkup) {
          document.body.insertAdjacentHTML('beforeend', footerMarkup);
        }
      },
      { headerMarkup: headerHtml, footerMarkup: footerHtml }
    );

    const pdfBuffer = await page.pdf({
      format,
      landscape,
      printBackground,
      margin: {
        top: toMm(body?.marginTopMm, 12),
        right: toMm(body?.marginRightMm, 10),
        bottom: toMm(body?.marginBottomMm, 12),
        left: toMm(body?.marginLeftMm, 10)
      }
    });

    await page.close();
    await browser.close();

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="export.pdf"');
    res.end(Buffer.from(pdfBuffer));
  } catch (err) {
    return json(res, 400, { ok: false, error: err?.message || 'Failed to generate PDF' });
  }
}
