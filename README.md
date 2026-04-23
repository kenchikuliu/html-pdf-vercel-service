# html-pdf-vercel-service

Deployable Vercel service for URL/HTML to PDF.

## Features

- URL or raw HTML to PDF
- Upload logo (data URL) to header or footer
- Header/footer text with left/center/right alignment
- A3/A4/Letter/Legal, landscape option

## Local

```bash
npm install
npx vercel dev
```

Open `http://localhost:3000`.

## API

`POST /api/pdf`

Body JSON (example):

```json
{
  "url": "https://example.com",
  "waitMs": 2000,
  "format": "A4",
  "landscape": false,
  "header": { "enabled": true, "text": "Internal", "align": "left" },
  "footer": { "enabled": true, "text": "Confidential", "align": "right" },
  "logo": {
    "enabled": true,
    "dataUrl": "data:image/png;base64,...",
    "position": "header-right",
    "maxHeightMm": 10
  }
}
```
