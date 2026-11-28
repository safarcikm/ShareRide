"""Households per delivery area, from Statistics Iceland's open API.

Prints the population on 1 January of the given year (default 2026) for
the areas in the door-drop estimate, and the households that population
makes at two ratios:

- 2.65 people per private household (census 1 January 2021, Hagstofa);
- 2.83 people per home that Pósturinn delivers letters to (its count of
  135,684 homes in December 2023, against 383,726 people on
  1 January 2024).

The first ratio gives the higher count, the second is closer to the
letterboxes a distributor walks to.

Run: python3 marketing/door-drop/src/households.py [year]
Needs only the Python standard library and internet access.
"""

import csv
import io
import json
import sys
import urllib.request

API = "https://px.hagstofa.is/pxen/api/v1/en/Ibuar/mannfjoldi/2_byggdir"
CENSUS_PEOPLE_PER_HOUSEHOLD = 2.65
POST_PEOPLE_PER_HOME = 383_726 / 135_684  # about 2.83

# Municipality codes of the capital area (höfuðborgarsvæðið).
CAPITAL = ["0000", "1000", "1100", "1300", "1400", "1604", "1606"]

# Towns on Route 1 (or just off it, like Höfn) outside the capital area,
# as Statistics Iceland names the localities.
ROUTE_1 = [
    "Borgarnes",
    "Bifrost",
    "Blonduos",
    "Varmahlid",
    "Akureyri",
    "Reykjahlid",
    "Egilsstadir",
    "Fellabaer",
    "Reydarfjordur",
    "Faskrudsfjordur",
    "Stodvarfjordur",
    "Breiddalsvik",
    "Djupivogur",
    "Hofn in Hornafjordur",
    "Kirkjubaejarklaustur",
    "Vik in Myrdal",
    "Hvolsvollur",
    "Hella",
    "Selfoss",
    "Hveragerdi",
]

# Larger towns that are not on Route 1.
OTHER_TOWNS = [
    "Keflavik and Njardvik",
    "Sandgerdi",
    "Gardur",
    "Vogar",
    "Akranes",
    "Vestmannaeyjar",
    "Isafjordur",
    "Saudarkrokur",
    "Husavik",
    "Thorlakshofn",
]


def post_csv(path: str, query: list) -> list[list[str]]:
    body = json.dumps({"query": query, "response": {"format": "csv"}}).encode()
    request = urllib.request.Request(
        f"{API}/{path}", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.reader(io.StringIO(text)))


def total_only(year: str) -> list:
    return [
        {"code": "Aldur", "selection": {"filter": "item", "values": ["-1"]}},
        {"code": "Ár", "selection": {"filter": "item", "values": [year]}},
        {"code": "Kyn", "selection": {"filter": "item", "values": ["0"]}},
    ]


def municipalities(year: str) -> dict[str, int]:
    query = [
        {
            "code": "Sveitarfélag",
            "selection": {"filter": "item", "values": ["9999", *CAPITAL]},
        },
        *total_only(year),
    ]
    rows = post_csv("sveitarfelog/MAN02005.px", query)[1:]
    codes = ["9999", *CAPITAL]
    return {code: int(row[-1]) for code, row in zip(codes, rows)}


def localities(year: str) -> dict[str, int]:
    rows = post_csv("Byggdakjarnar/MAN030102.px", total_only(year))[1:]
    return {row[0]: int(row[-1]) for row in rows if row[-1].isdigit()}


def line(name: str, people: int) -> str:
    high = round(people / CENSUS_PEOPLE_PER_HOUSEHOLD, -2)
    low = round(people / POST_PEOPLE_PER_HOME, -2)
    return f"{name:<38} {people:>9,} people  {low:>9,.0f} to {high:>9,.0f} homes"


def main() -> None:
    year = sys.argv[1] if len(sys.argv) > 1 else "2026"
    muni = municipalities(year)
    places = localities(year)
    everyone = muni["9999"]
    capital = sum(muni[code] for code in CAPITAL)
    route_1 = sum(places[name] for name in ROUTE_1)
    other = sum(places[name] for name in OTHER_TOWNS)
    print(f"Population on 1 January {year} (Statistics Iceland)\n")
    print(line("All Iceland", everyone))
    print(line("Capital area", capital))
    print(line("Outside the capital area", everyone - capital))
    print(line("Towns on Route 1 (outside capital)", route_1))
    print(line("  of which Akureyri", places["Akureyri"]))
    print(line("Larger towns off Route 1", other))


if __name__ == "__main__":
    main()
