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
    # IRENA and IEA-PVPS 2016 [13]: silver's share of panel material value (Figure 24) for the materials layer.
    "irena_ieapvps_end_of_life_pv_2016.pdf":
        "https://www.irena.org/-/media/Files/IRENA/Agency/Publication/2016/IRENA_IEAPVPS_End-of-Life_Solar_PV_Panels_2016.pdf",
}

# --- Data sources and licences, checked 2026-10-03 on each publisher's copyright page or product readme ----------
DATA_SOURCES = [
    {"name": "Small-scale installation postcode data (SGU solar installations and capacity)",
     "publisher": "Clean Energy Regulator", "url": SOURCE_PAGES["cer_postcode"], "licence": "CC BY 4.0",
     "attribution": "Based on Clean Energy Regulator material licensed under a Creative Commons Attribution 4.0 licence",
     "used_for": "Install cohorts: systems and kW by postcode and month since April 2001"},
    {"name": "ASGS Edition 3 digital boundary files: POA, GCCSA and STE 2021 (GDA2020)",
     "publisher": "Australian Bureau of Statistics", "url": SOURCE_PAGES["abs_asgs"], "licence": "CC BY 4.0",
     "attribution": "Based on Australian Bureau of Statistics data",
     "used_for": "Postcode polygons and centroids, states, capital-city areas"},
    {"name": "Census 2021 General Community Profile DataPack, Postal Areas, table G36 Dwelling Structure",
     "publisher": "Australian Bureau of Statistics", "url": SOURCE_PAGES["abs_datapacks"], "licence": "CC BY 4.0",
     "attribution": "Based on Australian Bureau of Statistics data",
     "used_for": "Occupied separate houses and semis per postcode (lifetime fit)"},
    {"name": "Waste Management Facilities Database (eCat 147594)", "publisher": "Geoscience Australia",
     "url": SOURCE_PAGES["ga_waste_ecat"],
     "licence": "CC BY 4.0; incorporates G-NAF © Geoscape Australia under the G-NAF End User Licence Agreement",
     "attribution": "© Commonwealth of Australia (Geoscience Australia) 2025",
     "used_for": "Candidate collection sites"},
]
# Works cited by number in charts, config and the method page (docs/CONTEXT.md §13).
REFERENCES = {
    1: ("DCCEEW, National Solar Panel Recycling Pilot",
        "https://www.dcceew.gov.au/environment/protection/waste/solar-panels"),
    7: ("Report on Senate committee evidence (panel age, 17% recycled, 59 kt to 91 kt)",
        "https://www.theepochtimes.com/world/call-for-nationwide-ban-on-sending-solar-panels-to-landfill-amid-vast-waste-concerns-6070508"),
    8: ("NSW Government release on panel waste volumes",
        "https://www.nsw.gov.au/ministerial-releases/nsw-leads-way-towards-national-solar-panel-reuse-and-recycling-scheme"),
    11: ("Tan, Dias, Chang and Deng (UNSW), Sustainability 14(9):5336, 2022",
         "https://www.mdpi.com/2071-1050/14/9/5336"),
    12: ("RenewEconomy, pilot announcement and replacement share, Jan 2026",
         "https://reneweconomy.com.au/too-valuable-to-throw-out-labor-announces-first-national-solar-panel-recycling-pilot-program/"),
    13: ("IRENA and IEA-PVPS, End-of-Life Management: Solar PV Panels, 2016",
         "https://www.irena.org/-/media/Files/IRENA/Agency/Publication/2016/IRENA_IEAPVPS_End-of-Life_Solar_PV_Panels_2016.pdf"),
    20: ("EU Climate Dialogues, PV Circularity Policy Recommendations (Overview), 2024",
         "https://www.eeas.europa.eu/sites/default/files/documents/2024/23039%20-%20GIZ%20Solar%20PV%20Circularity%20Report%20Overview.pdf"),
    21: ("Composition of a crystalline silicon panel (table citing IEA-PVPS 2016)",
         "https://www.researchgate.net/figure/The-composition-of-a-crystalline-silicon-solar-panel_tbl2_376710187"),
    22: ("Panel mass per MW estimate", "https://freeingenergy.com/math/solar-panel-module-retired-waste-landfill-m134/"),
    23: ("Optimised PV waste collection network for South Australia, J. Environmental Management, 2022",
         "https://www.sciencedirect.com/science/article/abs/pii/S0301479722005801"),
    24: ("Mahmoudi, Huda and Behnia, PV waste forecasting for Australia, 2019",
         "https://opus.lib.uts.edu.au/handle/10453/140599"),
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
    "AU_RES": {"beta": 17.0, "alpha": 2.4928, "source": "UNSW (Tan et al. 2022), Australian residential [11]"},
    "INTL_EARLY": {"beta": 30.0, "alpha": 2.4928, "source": "IRENA/IEA-PVPS 2016, early loss [13]"},
    "INTL_REGULAR": {"beta": 30.0, "alpha": 5.3759, "source": "IRENA/IEA-PVPS 2016, regular loss [13]"},
    "FITTED": {"beta": None, "alpha": 2.4928,  # beta from the fit stage (fit_report.json); alpha from [11]
               "source": "Fitted from CER installs vs Census 2021 houses; shape α from UNSW [11]"},
}
# Optimiser demand weights. §6.5 defaults to FITTED, but the fit lands at 0.3-0.5x reported national waste while
# AU_RES matches it (step 5), so the team chose AU_RES on 2026-10-03. Every scenario gets its own site plan so
# the map's scenario toggle always has sites and coverage; FITTED vs AU_RES is the robustness check.
DEFAULT_SCENARIO = "AU_RES"
OPTIMISER_SCENARIOS = ("AU_RES", "FITTED", "INTL_EARLY", "INTL_REGULAR")

# --- Panel watts and mass by install year, §7 ---------------------------------
# (last install year inclusive, watts per panel, kg per panel). Starting estimates
# anchored on 58-65 t/MW for 2018-era panels [22]. TODO: verify each row.
# kg per kW = kg per panel * 1000 / watts -> 91, 84, 80, 73, 70, 62, 58, 54, 50, 49.
PANEL_TABLE_SOURCE = "Starting estimates anchored on 58-65 t/MW for 2018-era panels [22]; to verify"
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

# --- Validation targets, §9. Reported figures with varying year labels: a band, not exact targets. ---
VALIDATION_TARGETS = [
    {"metric": "annual_tonnes", "year": 2025, "value": 59_000, "label": "about 59 kt (reported for 2025)",
     "source": "[7][8]"},
    {"metric": "annual_tonnes", "year": 2030, "value": 91_000, "label": "more than 91 kt by 2030", "source": "[7][8]",
     "lower_bound": True},
    {"metric": "cumulative_tonnes", "year": 2035, "value": 1_000_000, "label": "around 1 Mt by 2035", "source": "[1]"},
    {"metric": "cumulative_panels", "year": 2035, "value": 50_000_000, "label": "about 50M panels by 2035",
     "source": "[1]"},
]
UNIT_ERROR_RATIO = 3.0  # §9: if every scenario is more than 3x off a target, suspect kW/MW or kg/t first

# Chart colours per scenario: dataviz reference categorical slots 1-4 (light), validated for CVD separation.
SCENARIO_COLORS = {"AU_RES": "#2a78d6", "INTL_EARLY": "#eb6834", "INTL_REGULAR": "#1baf7a", "FITTED": "#eda100"}

# --- Lifetime fit, §6.4 and §7 --------------------------------------------------
# §6.4 counts installs to Census night 2021, but then only 3 POAs (all SA) have more installs than houses
# (national penetration was 43.5%). Team decision 2026-10-03: the main fit counts installs to the end of the
# last non-provisional CER month (None below) against 2021 dwellings; Census night is kept as a sensitivity.
# This adds post-2021 new homes to the excess, which biases beta down (CONTEXT §6.4 caveats).
FIT_CUTOFF = None  # None = end of the last non-provisional CER month
FIT_SENSITIVITY_CUTOFFS = (date(2021, 8, 10), date(2023, 8, 10))  # Census night 2021, and two years on
FIT_ALPHA = 2.4928  # shape held fixed at the UNSW value [11], §6.4
FIT_BETA_GRID = (10.0, 35.0, 0.25)  # start, stop (inclusive), step
FIT_MIN_HOUSES = 500  # applied to the denominator (houses, or houses + semis in the sensitivity run)
FIT_MAX_MEAN_KW = 15.0  # drop business-heavy POAs above this mean system size
FIT_MEAN_KW_YEARS = (2016, 2021)  # window for the mean system size filter
FIT_SENSITIVITY_MAX_MEAN_KW = (10.0, 20.0)  # BUILD_PLAN step 6
FIT_CROSS_CHECK_YEARS = (2024, 2025)  # implied replacement share of installs, vs "over a third in some states" [12]

# --- Site optimiser, §6.5 and §7 ------------------------------------------------
COVERAGE_RADIUS_KM = 30.0
N_SITES = 100  # pilot target of about 100 sites [6]
MIN_SITES_PER_STATE = 2
SITE_DEDUPE_M = 100.0  # merge candidate facilities closer than this, BUILD_PLAN step 7
EXACT_SOLVER_TIME_LIMIT_S = 120
SITE_YEARS = (2026, 2035)  # inclusive; per-site tonnes and panels reported for these years, §6.5
# GA FACILITY_INFRASTRUCTURE_TYPE values where a household could plausibly drop off panels (definitions from the
# GA metadata PDF, eCat 147594). Transfer stations and putrescible landfills are council drop-off sites (the EU
# study [20] recommends co-locating with council facilities); e-waste drop-offs include retailers it also
# recommends. Excluded: soft-plastics bins, container deposit depots, MRFs, reprocessors, inert landfills.
CANDIDATE_TYPES = ("TRANSFER STATION", "LANDFILL – PUTRESCIBLE", "E-WASTE DROP-OFF FACILITY",
                   "E-WASTE RECYCLING FACILITY")

# --- Materials layer (stretch), §6.6 --------------------------------------------------
# c-Si panel composition by mass from [21], the table "The composition of a crystalline silicon solar panel".
# We use its column [40]: the only column that matches CONTEXT's silver ~0.05% and sums to 100% (99.99%);
# column [4] sums to 100.93%, and [41] and [12] have gaps. Transcribed from a browser screenshot the team saved
# on 2026-10-03 (data/raw/researchgate_pv_composition_table.png; ResearchGate blocks automated access).
# Groups: aluminium = frame 18% + cell 0.53%; polymer = EVA 5.1% + backing film 1.5% + junction-box plastic 0.67%;
# copper = cell 0.11% + junction box 0.33%; tin and lead are one merged cell (0.05%) in the table.
# Assumes every panel is crystalline silicon (thin film is a negligible share of Australian rooftops; TODO: verify).
MATERIAL_SHARES = {"glass": 0.70, "aluminium": 0.1853, "polymer": 0.0727, "silicon": 0.0365, "copper": 0.0044,
                   "tin_lead": 0.0005, "silver": 0.0005}
SILVER_VALUE_SHARE = 0.47  # silver's share of a c-Si panel's material value, IRENA/IEA-PVPS 2016 [13] Figure 24 p.78
MATERIALS_SOURCE = "Composition: table in [21] (its column [40]). Silver's value share: IRENA and IEA-PVPS 2016 [13]"

# --- Web data budget (CLAUDE.md code style) -------------------------------------
WEB_DATA_MAX_MB = 15.0
POA_GEOJSON_MAX_MB = 5.0
