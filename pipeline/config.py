"""Every modelling assumption, with its source. Section and [n] refs point to docs/CONTEXT.md."""
from datetime import date
from pathlib import Path

# --- Paths -----------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
PROCESSED = ROOT / "data" / "processed"
QA = PROCESSED / "qa"
FIGURES = ROOT / "outputs" / "figures"
WEB_DATA = ROOT / "web" / "public" / "data"
MANIFEST = RAW / "MANIFEST.json"

# --- Source landing pages (§13). Direct file URLs are found on these pages in step 1. ---
SOURCE_PAGES = {
    "cer_postcode": "https://cer.gov.au/markets/reports-and-data/small-scale-installation-postcode-data",  # [14]
    "abs_asgs": "https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files",  # [15]
    "abs_datapacks": "https://www.abs.gov.au/census/find-census-data/datapacks",  # [16]
    "ga_waste_ecat": "https://ecat.ga.gov.au/geonetwork/srv/api/records/495820b9-4a56-4409-9d1b-950589b50936",  # [17]
    "ga_waste_atlas": "https://digital.atlas.gov.au/datasets/waste-management-facilities-1",  # [18]
}

# Direct file links, copied from the pages above on 2026-10-03. Filename in data/raw/ -> URL.
_CER = "https://cer.gov.au/document/"
_ASGS = ("https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/"
         "edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/")
_GA = "https://d28rz98at9flks.cloudfront.net/147594/"
DOWNLOADS = {
    # CER SGU solar (small generation units, PV only): counts and kW, split 2001-2010 and 2011-present.
    "cer_solar_installations_2001_2010.csv": _CER + "sgu-solar-installations-2001-to-2010",
    "cer_solar_installations_2011_present.csv": _CER + "sgu-solar-installations-2011-to-present-and-totals",
    "cer_solar_capacity_2001_2010.csv": _CER + "sgu-solar-capacity-2001-to-2010",
    "cer_solar_capacity_2011_present.csv": _CER + "sgu-solar-capacity-2011-to-present-and-totals",
    # ABS ASGS Edition 3 boundaries, GDA2020 shapefiles.
    "POA_2021_AUST_GDA2020_SHP.zip": _ASGS + "POA_2021_AUST_GDA2020_SHP.zip",
    "GCCSA_2021_AUST_SHP_GDA2020.zip": _ASGS + "GCCSA_2021_AUST_SHP_GDA2020.zip",
    "STE_2021_AUST_SHP_GDA2020.zip": _ASGS + "STE_2021_AUST_SHP_GDA2020.zip",
    # ABS Census 2021 General Community Profile, POA level, all of Australia.
    "2021_GCP_POA_for_AUS_short-header.zip":
        "https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_POA_for_AUS_short-header.zip",
    # GA Waste Management Facilities Database (eCat 147594, CC BY 4.0). Layer is named
    # "Waste_Management_Facilities_2025", newer than the 2022 update cited in CONTEXT [17]. GeoJSON + field defs PDF.
    "ga_waste_facilities.geojson": _GA + "147594_00_1.json",
    "ga_waste_facilities_metadata.pdf": _GA + "147594_04_3.pdf",
}

# --- Coordinate systems (CLAUDE.md modelling rules) ---------------------------
CRS_STORE = "EPSG:4326"  # storage
CRS_METRIC = "EPSG:3577"  # GDA94 / Australian Albers, metres, for distances and areas

# --- Geography and dwellings, BUILD_PLAN step 3 ---------------------------------
STATE_ABBR = {"1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT",
              "9": "OT"}  # ABS STE_CODE21 -> standard abbreviation; OT = Other Territories
# POAs crossing state borders, allocated by ABS by population rather than area (Census DataPack
# Readme/2021POA_readme.txt). Largest-area overlap gets 4 of these wrong, e.g. 2611 (Weston Creek, ACT) -> NSW.
POA_STATE_OVERRIDES = {"0872": "NT", "2540": "NSW", "2611": "ACT", "2620": "NSW", "2618": "ACT", "2406": "NSW",
                       "3707": "VIC", "3691": "VIC", "3644": "VIC", "4375": "QLD", "4377": "QLD", "4380": "QLD",
                       "4383": "QLD", "4385": "QLD", "4825": "QLD"}
# Greater Capital City Statistical Areas (ABS GCC_CODE21). The ACT (8ACTE) stands in for Canberra.
CAPITAL_GCCSA = ["1GSYD", "2GMEL", "3GBRI", "4GADE", "5GPER", "6GHOB", "7GDAR", "8ACTE"]
# Census 2021 GCP table G36 "Dwelling Structure", occupied private dwellings (Metadata_2021_GCP_DataPack_R1_R2.xlsx).
CENSUS_G36 = "2021 Census GCP Postal Areas for AUS/2021Census_G36_AUST_POA.csv"
CENSUS_HOUSES_COL = "OPDs_Separate_house_Dwellings"  # separate houses: default fit denominator, §6.4
CENSUS_SEMIS_COL = "OPDs_SD_r_t_h_th_Tot_Dwgs"  # semi-detached, row or terrace, townhouse: sensitivity, §6.4
POA_SIMPLIFY_M = 500  # web polygon simplification tolerance; 500 m gives ~4.2 MB, under POA_GEOJSON_MAX_MB
GEOJSON_DECIMALS = 4  # ~11 m at Australian latitudes, well below the simplification tolerance

# --- Retirement curve F(t) = 1 - exp(-(t/beta)^alpha), §6.3 -------------------
SCENARIOS = {
    "AU_RES": {"beta": 17.0, "alpha": 2.4928},  # UNSW, Tan et al. 2022, Australian residential [11]
    "INTL_EARLY": {"beta": 30.0, "alpha": 2.4928},  # IRENA/IEA-PVPS 2016, early loss [13]
    "INTL_REGULAR": {"beta": 30.0, "alpha": 5.3759},  # IRENA/IEA-PVPS 2016, regular loss [13]
    "FITTED": {"beta": None, "alpha": 2.4928},  # beta fitted in step 6 (§6.4); alpha from [11]
}
FALLBACK_SCENARIO = "AU_RES"  # used where FITTED is not available yet, §6.5

# --- Panel watts and mass by install year, §7 ---------------------------------
# (last install year inclusive, watts per panel, kg per panel). Starting estimates
# anchored on 58-65 t/MW for 2018-era panels [22]. TODO: verify each row.
# kg per kW = kg per panel * 1000 / watts -> 91, 84, 80, 73, 70, 62, 58, 54, 50, 49.
PANEL_TABLE = [
    (2008, 170, 15.5),
    (2010, 185, 15.5),
    (2012, 200, 16.0),
    (2014, 240, 17.5),
    (2016, 265, 18.5),
    (2018, 300, 18.5),
    (2020, 330, 19.0),
    (2022, 390, 21.0),
    (2024, 430, 21.5),
    (9999, 450, 22.0),  # 2025 onward
]

# --- Forecast years, §7 -------------------------------------------------------
FORECAST_YEARS = (2015, 2035)  # inclusive
DEMAND_YEARS = (2026, 2030)  # inclusive; tonnes in this window weight the optimiser demand
PROVISIONAL_MONTHS = 12  # recent CER months are incomplete (late registrations), §6.4 caveats

# --- Lifetime fit, §6.4 and §7 --------------------------------------------------
FIT_CUTOFF = date(2021, 8, 10)  # Census night 2021
FIT_BETA_GRID = (10.0, 35.0, 0.25)  # start, stop (inclusive), step
FIT_MIN_HOUSES = 500
FIT_MAX_MEAN_KW = 15.0  # drop business-heavy POAs above this mean system size
FIT_MEAN_KW_YEARS = (2016, 2021)  # window for the mean system size filter
FIT_SENSITIVITY_MAX_MEAN_KW = (10.0, 20.0)  # BUILD_PLAN step 6

# --- Site optimiser, §6.5 and §7 ------------------------------------------------
COVERAGE_RADIUS_KM = 30.0
N_SITES = 100  # pilot target of about 100 sites [6]
MIN_SITES_PER_STATE = 2
SITE_DEDUPE_M = 100.0  # merge candidate facilities closer than this, BUILD_PLAN step 7
EXACT_SOLVER_TIME_LIMIT_S = 120

# --- Web data budget (CLAUDE.md code style) -------------------------------------
WEB_DATA_MAX_MB = 15.0
POA_GEOJSON_MAX_MB = 5.0
