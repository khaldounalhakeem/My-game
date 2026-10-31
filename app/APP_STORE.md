# Putting Boost League on the App Store

Everything that can be prepared without a Mac is already in this folder:

| What | Where |
|---|---|
| iPhone/iPad project (Capacitor 7, Swift Package Manager) | `app/ios/` |
| The game, App Store version (no other companies' names) | `app/www/index.html`, built by `node tools/build.js` |
| App icon, 1024×1024 | `app/resources/icon-1024.png` (already in the Xcode project) |
| Screenshots in Apple's sizes | `app/resources/screenshots/` (`ipad-*` 2752×2064, `iphone-*` 2868×1320) |
| Privacy policy text | `app/PRIVACY.md` |

App settings already done: name **Boost League**, bundle ID `com.boostleague.game`, landscape only,
fullscreen with no status bar, game controllers supported, "uses no non-exempt encryption" (so Apple
won't ask about encryption export rules), category Sports games.

## What you need

1. **A Mac** with **Xcode** (free from the Mac App Store). An iPad alone can't build or upload apps.
2. **An Apple Developer Program membership**: $99 per year, at <https://developer.apple.com/programs/enroll/>.
   Approval can take a day or two. If you're under 18, a parent or guardian has to enroll.
3. **Node.js** on the Mac (<https://nodejs.org>, the LTS version).

## Steps

### 1. Get the project onto the Mac
```
git clone https://github.com/khaldounalhakeem/My-game.git
cd My-game
git checkout claude/boost-league-game
cd app
npm install
npm run sync      # rebuilds the game and copies it into the iOS project
npm run open      # opens the project in Xcode
```

### 2. In Xcode
1. Click **App** in the left sidebar → **Signing & Capabilities**.
2. Tick **Automatically manage signing** and choose your **Team** (your developer account).
3. If Xcode says the bundle ID is taken, change `com.boostleague.game` to something unique, for example
   `com.yourname.boostleague` (change it in `app/capacitor.config.json` too, then `npm run sync`).
4. Plug in your iPad, pick it at the top of Xcode, press **▶ Run** to try the app on it.
   (The first time, on the iPad: Settings → General → VPN & Device Management → trust your developer profile.)

### 3. Upload
1. At the top of Xcode choose **Any iOS Device (arm64)**.
2. **Product → Archive**. When it finishes, the Organizer opens: **Distribute App → App Store Connect → Upload**.

### 4. App Store Connect (<https://appstoreconnect.apple.com>)
1. **My Apps → + → New App**: platform iOS, name **Boost League** (pick another if it's taken),
   language, the bundle ID from step 2, a SKU like `boostleague1`.
2. Fill in the listing:
   - **Subtitle**: e.g. *Rocket-powered car soccer*
   - **Description**: what the game is (modes, ranked, online parties, controller support).
   - **Keywords**: car soccer, ball, cars, multiplayer, controller, sports
   - **Screenshots**: drag in the files from `app/resources/screenshots/`: `ipad-*` for the
     13-inch iPad slot, `iphone-*` for the 6.9-inch iPhone slot.
   - **Privacy Policy URL**: a public link to `app/PRIVACY.md` (see below).
   - **Age rating** questionnaire: no violence/gambling/etc. → it should come out 4+.
   - **App Privacy**: "Data Not Collected".
   - **Price**: Free (or a price).
3. Under **Build**, pick the build you uploaded, then **Submit for Review**. Review usually takes 1–3 days.

### Privacy policy link
Apple needs a web link. Easiest: open `app/PRIVACY.md` on GitHub and use that page's link, but only if the
repository is public. Otherwise publish the text anywhere public (a Google Doc shared "anyone with the
link", a free site, etc.) and paste that link.

## Things to know
- **Saving in the app** is on the device (the Claude account save only exists on claude.ai). The **save codes**
  in Profile let you move progress from the claude.ai version into the app.
- **Online parties work in the app** (devices connect directly), including with people on the claude.ai link.
- **Names**: the App Store version calls the Octane, Dominus and Fennec **Comet**, **Baron** and **Fox**, and
  doesn't mention Rocket League anywhere, because Apple rejects apps that use other companies' trademarks.
  Don't add their names to the store listing either. The game's look and feel is still close to Rocket League,
  so Apple could still question it under guideline 4.1 (copycats); if that happens, the reply is that it's an
  original game written from scratch with its own art and names.
- After any change to the game: `npm run sync` in `app/`, bump the version in Xcode (General → Version / Build),
  archive and upload again.
