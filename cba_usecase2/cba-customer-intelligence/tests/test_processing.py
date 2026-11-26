import pandas as pd

from ci.process.clean import clean_frame, redact


def test_redacts_pii():
    t, hit = redact("email me jo@example.com or call 0412 345 678, card 4111 1111 1111 1111, BSB 062-000 acc 12345678")
    assert hit and "@" not in t and "4111" not in t and "0412" not in t and "12345678" not in t


def test_amounts_not_redacted():
    t, hit = redact("They charged me $500 and then $1,200 in fees")
    assert not hit and "$500" in t


def test_clean_frame_dedupes_and_drops_short():
    df = pd.DataFrame({"bank": ["CBA"] * 3, "source": ["x"] * 3, "date": ["2026-01-01"] * 3, "rating": [1, 1, None],
                       "text": ["The app crashes all the time <b>help</b>", "The app crashes all the time help", "ok"], "author": ["a", "a", "a"]})
    out = clean_frame(df)
    assert len(out) == 1 and "<b>" not in out.text_clean.iloc[0] and out.author.iloc[0] != "a"       # duplicate merged, short UNRATED row dropped


def test_short_rated_reviews_are_kept_and_other_users_not_deduped():
    df = pd.DataFrame({"bank": ["CBA"] * 4, "source": ["Google Play"] * 4, "date": ["2026-01-01"] * 4, "rating": [5, 5, 5, None],
                       "text": ["Love it", "Love it", "Love it", "Love it"], "author": ["amy", "bob", "amy", "cat"]})
    out = clean_frame(df)
    # amy's identical review scraped twice collapses; bob's is a different user and stays; the unrated 7-char row is noise
    assert sorted(out.rating.dropna().astype(int).tolist()) == [5, 5] and len(out) == 2
    assert len(clean_frame(df, min_chars_rated=12)) == 0              # old behaviour is one setting away
