# FIFA 27 Game - Multiple Versions

Six different versions of the FIFA 27 game have been created, each using different technical approaches to maximize compatibility with Google Drive's sandbox environment. **At least one should work with full button functionality.**

## Recommended Order to Test

Test versions in this order to find one that works best:

### 1. **FIFA27_Minimal.html** ⭐ START HERE
- **Approach:** Clean object-oriented JavaScript with minimal code
- **Navigation:** Direct onclick handlers on buttons
- **Why this first:** Simplest, most straightforward implementation
- **Button interactions:** All buttons respond immediately (Shoot, Pass, Defend, Skip)
- **Status display:** Top bar updates with current page title
- **Best for:** Finding out if basic onclick handlers work in your environment

### 2. **FIFA27_DirectJS.html**
- **Approach:** Button elements with direct onclick handlers
- **Navigation:** Uses .classList toggling for page visibility
- **Why try this:** Different DOM manipulation method
- **Button interactions:** Full game play and navigation
- **Status display:** Dynamic topbar with page names

### 3. **FIFA27_HashNav.html**
- **Approach:** Hash-based navigation (#menu, #ultimate, etc.) with onclick for match actions
- **Navigation:** Uses window.location.hash
- **Why try this:** Browser's native URL hash handling
- **Button interactions:** Navigation via hash, match actions via onclick
- **Status display:** Hash in URL bar shows current page

### 4. **FIFA27_DataAttrs.html**
- **Approach:** Uses data attributes (data-nav, data-action) with event delegation
- **Navigation:** Single event listener on document for all button clicks
- **Why try this:** Event delegation pattern
- **Button interactions:** All buttons use centralized event handling

### 5. **FIFA27_CSSOnly.html**
- **Approach:** Pure CSS :target pseudo-selector for navigation
- **Navigation:** No JavaScript needed for page switching (href="#page")
- **Match actions:** Only onclick for Shoot/Pass/Defend/Skip
- **Why try this:** Minimal JavaScript, CSS-only navigation
- **Good for:** If JavaScript event handlers are blocked

### 6. **FIFA27_FormBased.html**
- **Approach:** Radio buttons with CSS :checked selector
- **Navigation:** Label elements trigger radio button state
- **Match actions:** Onclick handlers for game play
- **Why try this:** Uses native form element behavior
- **Good for:** Most accessible, uses browser's form API

## How to Use in Google Drive

1. **Upload the HTML file to Google Drive**
   - Go to drive.google.com
   - Click "New" → "File upload"
   - Select one of the FIFA27_*.html files

2. **Open in Google Drive**
   - Right-click the file
   - Select "Open with" → "Google Chrome" (or your browser)
   - The game will load in the Drive preview

3. **Test Button Functionality**
   - Try clicking the menu buttons (Ultimate Team, World Cup, etc.)
   - If buttons work, try playing a match (Shoot, Pass, Defend, Skip)
   - Try changing settings (Difficulty, Half Time)

## Game Features in All Versions

✅ **Game Modes:**
- 🏆 Ultimate Team - Build your squad
- 🌍 World Cup 2026 - Tournament play
- ⭐ Champions League - Club competition
- 📊 Career Mode - Manage Man City
- ⚙️ Settings - Configure difficulty & duration

✅ **Match Features:**
- Live match timer (00:00 to 90:00)
- Home and away scores
- Event log (goals, passes, defensive actions)
- Four match actions: Shoot, Pass, Defend, Skip
- Match results with coin rewards (Win: 1500, Draw: 1000, Loss: 500)

✅ **Customization:**
- Difficulty levels: Easy, Normal, Hard, Legendary
- Half-time duration: 10-90 minutes
- Different probability for scoring based on difficulty

✅ **Squad Display:**
- 10 top players with ratings
- Players: Ronaldo, Messi, Haaland, Mbappé, Vinicius Jr, Rodri, Harry Kane, Phil Foden, Bellingham, De Bruyne

## Technical Differences

| Feature | DirectJS | Minimal | HashNav | DataAttrs | CSSOnly | FormBased |
|---------|----------|---------|---------|-----------|---------|-----------|
| Navigation | classList | classList | hash | getAttribute | :target | :checked |
| Page switching | onclick | onclick | hash change | event delegation | CSS only | CSS only |
| Match actions | onclick | onclick | onclick | onclick | onclick | onclick |
| Code size | 12KB | 12KB | 12KB | 13KB | 21KB | 15KB |
| Simplicity | High | Highest | Medium | Medium | Low | Medium |

## Troubleshooting

### If buttons turn blue but don't do anything:
- Try **FIFA27_HashNav.html** - hash navigation is browser-native
- Or try **FIFA27_CSSOnly.html** - CSS selectors are native
- Or try **FIFA27_FormBased.html** - forms are always supported

### If you see JavaScript errors:
- Try **FIFA27_Minimal.html** - fewest dependencies
- Try **FIFA27_CSSOnly.html** - minimal JavaScript

### If navigation works but match buttons don't:
- All versions have the same match logic
- Issue might be with event handlers in Google Drive's sandbox
- Try a different version's overall approach

## Direct Repository Access

All files are in the GitHub repository:
https://github.com/khaldounalhakeem/My-game

Branch: `claude/fifa-27-game-dev-6r9rku`

Files:
- FIFA27_Minimal.html
- FIFA27_DirectJS.html
- FIFA27_HashNav.html
- FIFA27_DataAttrs.html
- FIFA27_CSSOnly.html
- FIFA27_FormBased.html

## Quick Test Checklist

When you open a version:

- [ ] Menu displays with 5 mode buttons
- [ ] Clicking a mode button changes to that screen
- [ ] "PLAY MATCH" button works
- [ ] Match page displays with 4 action buttons
- [ ] "SHOOT" button works and adds event to log
- [ ] "PASS" button works
- [ ] "DEFEND" button works
- [ ] "SKIP" button auto-completes match
- [ ] Match ends and shows results
- [ ] Can return to menu
- [ ] Settings page opens and closes properly

## Note on GitHub

The files are automatically versioned. If you need to rollback to a previous version or compare versions, check the git history on the branch.

---

**Last Updated:** September 15, 2026
**Status:** Ready for testing on Google Drive

Test each version and let me know which one works best for full button interactivity!
