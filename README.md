# prompt-library

Static prompt library for GitHub Pages backed by Google Sheets.

## Files

- `index.html`: app shell
- `styles.css`: UI styling
- `app.js`: data fetch, normalization, search, favorites, modal, clipboard logic

## Data source

- Spreadsheet ID: `1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564`
- Google Sheets source: <https://docs.google.com/spreadsheets/d/1FP11gpL9_HpbfU_NXkZQ_tQgqtbm8aUAP27E2GJj564/edit?gid=1502618237#gid=1502618237>

## Deploy

### Local preview

```powershell
py -3 -m http.server 4173
```

Open <http://127.0.0.1:4173>.

### GitHub Pages

1. Push to GitHub.
2. Enable GitHub Pages from the `main` branch root.
3. Open the generated Pages URL.

No build step is required.
