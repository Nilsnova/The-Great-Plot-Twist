"""The class demo (G29, decisions D029 and D030): guest play with the class code.

During the class demo, phones join by QR code and sign in as Supabase anonymous users ("guests"),
with no GitHub account. Anonymous sign-ins stay switched on in Supabase for good. A guest may use
the API only after presenting the current class code (POST /api/demo/join) while the feature flag
demo is on. GitHub and Google users are never affected.

Where things are (one job per file):
    code.py     the class code: make it, read it, compare a typed one in constant time, record an
                admitted guest (demo_guests)
    gate.py     the guest gate: refuses guests with 403 demo_closed until they are admitted (an
                admission is remembered for 10 seconds), and gets a guest ready on their first call
    guests.py   getting a guest ready (a captain name and the default kit, no Act 1) and cleaning
                old guests up (anonymous users older than 24 hours), by hand or automatically

The database part is supabase/migrations/20261109020000_class_code.sql (the old demo window of
20261109010000_demo_window.sql stays in the database, unused). The routes are in routes/demo.py
(the host routes and POST /api/demo/join) and routes/config.py (the public "demo" field).
"""
