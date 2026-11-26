from ci.collect.base import Collector


def test_iso_and_stars():
    assert Collector.iso("2026-03-04T10:00:00Z") == "2026-03-04"
    assert Collector.iso(1700000000).startswith("2023-")
    assert Collector.stars("5") == 5 and Collector.stars(9) is None and Collector.stars(None) is None
