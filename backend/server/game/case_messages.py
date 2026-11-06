"""Plain interface messages shared by case decisions, views and the service.

Story lines always come from loaded case content instead of this table.
"""

UI_MESSAGES = {
    "started": "Searching. The card lands in {minutes} case minutes.",
    "pinned": "Pinned to the board.",
    "solved": "Accusation accepted. Open the reveal.",
    "moved": "The case clock moved {minutes} minutes forward.",
    "wrong_kit": "This route needs the {kit} kit.",
    "already_have": "This card is already in your journal, or your search for it is running.",
    "card_not_held": "That card is not in your journal yet.",
    "already_pinned": "You already pinned that card.",
    "already_deduced": "Your crew already formed that deduction.",
    "night_in_progress": "The night is already on.",
    "dawn_wait": "Dawn is breaking. Your crew can call nightfall again in {seconds} seconds.",
    "schooner_found": "The schooner is already found.",
    "night_required": "Call nightfall first.",
    "light_not_ready": "That light is not ready yet.",
    "station_not_ready": "Build a signal station on a home islet first.",
    "post_taken": "Another seat holds that light.",
    "already_on_post": "You are already at that light.",
    "post_not_owned": "Another player holds that light.",
    "aim_cooldown": "Wait {seconds} seconds before you lock this light again.",
    "already_solved": "Your crew already solved the case.",
}
