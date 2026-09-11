# AIX SEC OPS – COK
**Live Flight Operations & Turnaround Board for Cochin International Airport (COK)**

A high-contrast, mobile-first flight operations board engineered for airport security and ops staff at Cochin International Airport. Built as an installable Progressive Web App (PWA) with native Capacitor and Android wrapper integration.

---

## ✈️ Key Capabilities

- **Live FlightRadar24 Schedule Integration**:
  - Direct schedule polling from FlightRadar24 API for Cochin International Airport (`code=cok`).
  - **Fallback Proxy Chain**: Direct fetch $\rightarrow$ `corsproxy.io` $\rightarrow$ `allorigins.win` $\rightarrow$ `codetabs.com`.
  - **Proxy Mode Selector**: Auto (automatically enables proxies on iOS Safari), Forced On, or Off.
  - **6 Overlapping 6-Hour Windows**: Pulls $-6\text{h}$ to $+24\text{h}$ window around current time, merges and de-duplicates flights, filtered to active/recent landings and within $-1\text{h}$ to $+20\text{h}$.
  - **30-Second Polling**: Auto-refreshes with in-flight deduplication (no redundant fetches within $25\text{s}$), plus immediate reload on tab focus or reconnecting online.
  - **Manual "⏮ -6h Earlier" Button**: Shifts the time window backwards in 6-hour increments.

- **Strict Airline Allow-List**:
  - Filtered exclusively to the 8 designated operators:
    - `IX` (Air India Express)
    - `AK` / `FD` (AirAsia / Thai AirAsia)
    - `UL` (SriLankan Airlines)
    - `J9` (Jazeera Airways)
    - `FZ` (flydubai)
    - `WY` (Oman Air)
    - `G9` / `3L` (Air Arabia / Air Arabia Abu Dhabi)
    - `EY` (Etihad Airways)
  - Small airline logos with graceful fallback to high-contrast IATA badges if image fails.

- **Turnaround Aircraft Matching**:
  - Automatically correlates inbound arrivals and outbound departures sharing the same aircraft registration occurring within $0\text{--}150$ minutes of each other.
  - Generates linked turnaround pairs (`Arrival Flight ↳ Departure Flight`), showing combined route, both times, ground time duration, and worst-case delay status.
  - De-duplicated matching ensures no aircraft or flight is duplicated across multiple turnaround pairs.

- **Status & Delay Computations**:
  - Delay calculation comparing estimated/actual against scheduled times.
  - Color-coded badges and whole-row tinting:
    - 🟢 **On Time**: $\le 5\text{ min}$ delay.
    - 🟡 **Delayed >5m**: $6\text{--}30\text{ min}$ delay.
    - 🟠 **Heavy Delay >30m**: $> 30\text{ min}$ delay.
    - 🔴 **Cancelled**: Flight marked cancelled.
  - All times rendered in **IST (Asia/Kolkata, UTC+5:30)** 24-hour format regardless of device timezone.

- **Active Flight Tracker & Push Notifications**:
  - "Track" checkbox per arrival row with local persistence in `localStorage`.
  - Floating bottom drawer with live second-by-second countdown and flight progress bar.
  - Push-style notification alerts at 60, 30, 15, 10, 5, and 0 minutes remaining before ETA.

- **Offline & Mock Test Fixtures**:
  - Built-in "Mock Mode" toggle with full realistic flight fixtures for immediate verification even if FlightRadar24 or proxies are unreachable.
  - Valid Service Worker (`sw.js`) caching app shell offline while keeping API calls strictly network-only.

---

## 🚀 Running Locally (Web / PWA)

### Prerequisites
- Node.js (v18+) and npm

### Steps
1. Clone or extract the project directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start local development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.
5. In Chrome or mobile Safari, click **"Install App"** to install it directly to your home screen or desktop as a standalone PWA.

---

## 📱 Building & Running Android (Capacitor & Native)

The project is pre-configured with both Capacitor configuration (`capacitor.config.json`) and a native Android project in `/app`.

### Option A: Using Capacitor CLI
1. Build web assets:
   ```bash
   npm run build
   ```
2. Sync assets with Capacitor:
   ```bash
   npx cap sync android
   ```
3. Open in Android Studio:
   ```bash
   npx cap open android
   ```
4. Run on a connected device or emulator.

### Option B: Building Directly with Gradle
To build the debug APK directly:
```bash
gradle assembleDebug
```
The resulting APK is generated at `app/build/outputs/apk/debug/app-debug.apk`.

To run local Robolectric and unit tests:
```bash
gradle :app:testDebugUnitTest
```

---

## 📁 Project Structure

```
├── public/                 # Web PWA Root
│   ├── index.html          # Single-page layout with high-contrast ops UI
│   ├── styles.css          # Mobile-first responsive styling, dark & light themes
│   ├── app.js              # Core logic, FR24 polling, proxy fallback, turnaround matching
│   ├── mock-data.js        # Test fixtures for COK operations
│   ├── sw.js               # Service worker caching app shell (never caching API)
│   ├── manifest.json       # PWA manifest with standalone display
│   └── icons/              # 192x192 & 512x512 PWA icons and SVG
├── capacitor.config.json   # Capacitor configuration (appId: com.aistudio.aixsecops.cokin)
├── package.json            # NPM scripts for dev, build, and Capacitor sync
├── app/                    # Native Android project
│   ├── src/main/
│   │   ├── AndroidManifest.xml # Permissions (INTERNET, POST_NOTIFICATIONS, VIBRATE)
│   │   ├── assets/public/      # Synced web assets packaged inside APK
│   │   └── java/com/example/   # MainActivity with full-screen WebView & native bridge
└── README.md
```
