"""The class demo (G29 checkpoint C0, decision D029): guest play inside a host-controlled window.

During the class demo, phones join by QR code and sign in as Supabase anonymous users ("guests"),
with no GitHub account. Guests may use the API only while the host's demo window is open and the
feature flag demo is on. GitHub and email users are never affected.

Where things are (one job per file):
    gate.py     the demo gate: reads the window (cached for 10 seconds), refuses guests with
                403 demo_closed while it is closed, and gets a guest ready on their first call
    guests.py   getting a guest ready (a captain name and the default kit, no Act 1) and the
                host's "Clean up guests" (anonymous users older than 24 hours)
    window.py   the host's switch: read the window, open it for 1 to 6 hours or close it

The database part is supabase/migrations/20261109010000_demo_window.sql. The routes are in
routes/demo.py (host only) and routes/config.py (the public "demo" field).
"""
