# Salesforce Trailblazer Scraper

A robust web application to scrape Salesforce certifications from Trailblazer profiles, handling Shadow DOM (LWC), Akamai anti-scraping, and dynamic layout shifts.

## Features

- **Next.js Web App**: Modern UI for entering aliases and viewing results.
- **Stealth Scraper**: Uses Puppeteer with stealth plugins to bypass security measures.
- **Shadow DOM Support**: Recursively traverses LWC Shadow Roots.
- **Dynamic Content Handling**: Recalculates coordinates for interactive elements during expansion.
- **Automated Filtering**: Removes non-certification badges and handles private profiles.

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Development Server**:
   ```bash
   npm run dev
   ```

3. **Verify Scraper**:
   You can run the scraper worker directly for testing:
   ```bash
   node scraper-worker.js [alias]
   ```

## Architecture

- `scraper-worker.js`: Standalone Puppeteer script for high-reliability scraping.
- `src/app/api/scrape/route.js`: API endpoint orchestrating the worker via child process.
- `src/app/page.js`: Frontend UI with dynamic table and status updates.
