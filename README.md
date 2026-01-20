# ServiceNow Media & Comments Viewer

A browser extension that displays all images and comments from ServiceNow incidents and tasks in a clean, unified modal view.

## Features

- **Image Gallery**: View all image attachments in chronological order with horizontal scrolling
- **Comments Timeline**: See all journal entries (comments & work notes) in a timeline view
- **Lightbox**: Click any image to view it full-size
- **Download**: Download images directly from the gallery
- **Native Look**: Designed to integrate seamlessly with ServiceNow's Polaris UI

## Supported Record Types

- Incidents (`incident`)
- Service Catalog Tasks (`sc_task`)
- Requested Items (`sc_req_item`)
- Change Requests (`change_request`)
- Problems (`problem`)

## Installation

### Chrome / Edge (Developer Mode)

1. Download or clone this repository
2. Add icon files to the `icons/` folder (16x16, 48x48, 128x128 PNG)
3. Open your browser and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked"
6. Select the `servicenow-media-viewer` folder

### Firefox (Developer Mode)

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file

## Usage

1. Navigate to any incident or task record in ServiceNow
2. Click the blue **"View Summary"** button in the bottom right corner
3. Use tabs to switch between Images and Comments
4. Click any image to view it full-size
5. Press `Escape` or click outside the modal to close

## Demo

Open `demo.html` in a browser to see the modal with mock data (no ServiceNow instance required).

## File Structure

```
servicenow-media-viewer/
├── manifest.json      # Extension manifest (v3)
├── content.js         # Main content script
├── styles.css         # Modal styles (Polaris-inspired)
├── background.js      # Service worker
├── demo.html          # Standalone demo page
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Customization

### Colors

Edit the CSS variables at the top of `styles.css` to customize colors:

```css
:root {
  --sn-primary: #0b62a4;      /* Main accent color */
  --sn-surface: #ffffff;       /* Background */
  --sn-text-primary: #1f2328;  /* Main text */
  /* ... */
}
```

### Supported Tables

Add more table types by modifying the `isValidPage()` and `getRecordInfo()` functions in `content.js`:

```javascript
const tablePatterns = [
  /\/incident\.do/i,
  /\/sc_task\.do/i,
  // Add more patterns here
];
```

## API Endpoints Used

The extension uses ServiceNow's REST API:

- **Attachments**: `/api/now/attachment`
- **Journal Entries**: `/api/now/table/sys_journal_field`

These APIs require the user to be authenticated in ServiceNow.

## Browser Support

- Chrome 88+
- Edge 88+
- Firefox 89+ (requires minor manifest adjustments)

## License

MIT License - feel free to modify and use as needed.
