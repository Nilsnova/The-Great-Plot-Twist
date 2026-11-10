# Duel pieces (package A7)

> **What this folder is:** the shared pieces of a Lantern Duel: the sealed signal picker (`picker.js`), the dramatic reveal (`reveal.js`), the result words (`steps.js`), the pure rules (`logic.js`), glyphs, DOM helpers and `duels.css`.
>
> **Who uses it:** the class demo's duel shortcut (`src/class-demo/duel-overlay.js`): tap a captain near you, choose "Friendly duel", and the overlay uses these pieces. That is the one way to start a duel in the game.

The server decides every duel (D003). The screen sends signals and ids, never a round result, a winner or an amount. A captain's sealed signals reach the other captain only inside the reveal, after both envelopes are in. The routes are in [docs/INTERFACES.md](../../../../docs/INTERFACES.md) (Lantern Duels).

The old arena panel (the Arena gate in Smugglers' Cove, the festival ring, challenges list and history) was removed on 10 Nov 2026 together with the mystery, so there is one duel entry point. See D031 in [docs/DECISIONS.md](../../../../docs/DECISIONS.md).
