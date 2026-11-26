from ci.categorise.rules import classify_area
from ci.categorise.segment import account_type
from ci.categorise.sentiment import sentiment


def test_area_basic():
    r = classify_area("Tap to pay with Apple Pay keeps failing at the shops", 1)
    assert r.secondary.startswith("Card payments")


def test_forum_chatter_without_bank_words_is_other():
    assert classify_area("Did anyone watch the footy last night, that was a great game", None).secondary.startswith("No specific")


def test_segments():
    assert account_type("Our business account ABN verification took weeks") == "Business"
    assert account_type("Offshoring and job cuts at the bank are a disgrace") != "Business"
    assert account_type("Why are business days so slow for transfers") != "Business"
    assert account_type("My home loan redraw is wrong") == "Personal"
    assert account_type("The app is slow") == "General"


def test_sentiment_uses_rating():
    assert sentiment("meh", 5) == "Positive"
    assert sentiment("meh", 1) == "Negative"
    assert sentiment("meh", 3) == "Neutral"
