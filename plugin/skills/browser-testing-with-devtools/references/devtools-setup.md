# Chrome DevTools MCP Setup

## Installation

```bash
# Add the Chrome DevTools MCP server to your Cursor MCP config
# (project .cursor/mcp.json, or the global Cursor MCP settings):
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}
```

## Available Tools

| Tool | What It Does | When to Use |
|------|-------------|-------------|
| **Screenshot** | Captures current page state | Visual verification, before/after comparisons |
| **DOM Inspection** | Reads live DOM tree | Verify component rendering, check structure |
| **Console Logs** | Retrieves console output (log, warn, error) | Diagnose errors, verify logging |
| **Network Monitor** | Captures network requests and responses | Verify API calls, check payloads |
| **Performance Trace** | Records performance timing data | Profile load time, identify bottlenecks |
| **Element Styles** | Reads computed styles for elements | Debug CSS issues, verify styling |
| **Accessibility Tree** | Reads accessibility tree | Verify screen reader experience |
| **JavaScript Execution** | Runs JavaScript in page context | Read-only state inspection and debugging (see Security Boundaries) |
