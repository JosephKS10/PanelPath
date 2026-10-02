# PanelPath: project context

Read this once at the start of a session. It covers why we are building PanelPath, how the model works, where every number comes from and how we will pitch it. Source numbers in brackets refer to the list in section 13.

## 1. The short version

Australia's rooftop solar boom is turning into a waste wave. Around a million tonnes of panels, roughly 50 million panels, are expected by 2035 [1]. Yet there is no national dataset showing how many are landfilled versus recycled [2]. The national pilot meant to set up about 100 collection sites has also been frozen since May 2026 [3][5].

PanelPath does three things:
1. Forecasts where and when panels will come off roofs, postcode by postcode.
2. Infers how long panels really last from installation data, instead of assuming a lifetime.
3. Chooses where 100 collection sites should go to catch the most waste.

The users are whoever restarts the national pilot, state regulators designing their own schemes (NSW, WA) and councils.



# Task
- **Track.** Green Industrialisation. COP31 is in Antalya, 9 to 20 November 2026. Its Action Agenda targets a global circular material use rate of at least 15% by 2035 [29].
- **Judging.** COP31 alignment 30%, build quality 30% (a working build, validated), creativity 20%, presentation 20%. Ties go to COP31 alignment.
- **Submission.** We need:
  - a public repo
  - a demo video of 2 minutes or less
  - team roles
  - the problem and its users
  - the solution and its impact
  - a written pitch
  - a full list of the datasets, libraries  used


## 3. The problem, in numbers

- **Volume.** Around 1 million tonnes of solar panel waste, roughly 50 million panels, is expected by 2035 [1].
- **No data.** No national dataset tracks how many panels are landfilled versus recycled [2].
- **Low recycling.** Only about 17% of panels are recycled today, according to the Energy Minister [7].
- **Early retirement.** A recycler told a Senate committee that the average decommissioned panel is only about eight years old [7].
- **Cost gap.** Recycling costs about $28 per panel, against about $4.50 to landfill, before transport. Only 15 to 17% of panel materials are recovered today [10].
- **Lifetimes.**
  - UNSW estimates residential panels in Australia last about 15 years, mostly because owners upgrade to bigger systems.
  - There is no public record of panel age at removal.
  - Installations peaked in 2011/12 [11].
  - In some states more than a third of new installs replace an older system [12].
- **Scale.** More than 4.3 million homes have rooftop solar [4].
- **Hazards.** Panels contain lead and antimony, and about 5% of panels contain cadmium [20].
- **Export.** Some panels leave the country. Queensland alone was exporting up to 800,000 panels a year in 2024 [27].

## 4. Why now

- **The pilot.** The $24.7M national pilot was announced in January 2026 [1]. It was meant to collect up to 250,000 panels from about 100 sites and produce the national data a mandatory scheme would be designed on [6].
- **The suspension.** The administrator tender closed on 26 April 2026, and procurement was suspended about three weeks later after a complaint [6]. As of mid-September it was still suspended, and the industry is asking for a restart before the end of 2026 [5]. Recyclers are losing money and laying off staff [4].
- **WA.** Western Australia has committed $13M to build its own end-of-life solar collection and recycling pathways [6].
- **NSW.** NSW is drafting its own mandatory PV panel regulation [9].
- **Parliament.** A House of Representatives committee is running an inquiry into solar panel reuse and recycling [30].
- **Timing.** The 2011/12 install boom turns 15 this year.

## 5. Who uses it, and the decision it informs

The core decision: **where should collection sites go, and how many tonnes will each handle each year from 2026 to 2035?**

- **The pilot administrator (once appointed) and DCCEEW:** where to put up to 100 sites, and the expected tonnes and panels per site per year.
- **NSW EPA and WA's program:** sizing state schemes.
- **Councils:** expected waste in their area, and whether to host a drop-off.
- **Recyclers and installers:** feedstock forecasts by region.

## 6. Method

### 6.1 Install cohorts

The Clean Energy Regulator's postcode data gives small-scale solar installations, as a count and as kW, by postcode and month since 2001 [14]. Treat each postcode × install month as a cohort.

Small-scale means up to 100 kW, so solar farms are not included. Battery installs have also been reported since July 2025; ignore them in the MVP.

### 6.2 Panels and tonnes

Convert each cohort with tables keyed by install year (section 7):
- panels = kW × 1000 / watts per panel
- tonnes = kW × kg-per-kW / 1000

Mass per kW has fallen over time. Panels from around 2018 weigh about 58 to 65 tonnes per MW [22]. A single fixed ratio would overstate recent installs and understate old ones, so keep it year-dependent and visible in the UI.

### 6.3 Retirement model

The share of a cohort retired by age t is the Weibull curve F(t) = 1 - exp(-(t/β)^α). β is roughly the typical lifetime, and α sets how spread out retirements are. Retirements in calendar year Y = N × (F(age at end of Y) - F(age at start of Y)).

Scenarios:
- `AU_RES`: β 17, α 2.4928, the Australian residential fit [11]
- `INTL_EARLY`: β 30, α 2.4928, international early loss [13]
- `INTL_REGULAR`: β 30, α 5.3759, international regular loss [13]
- `FITTED`: β from section 6.4, with α 2.4928

These assumptions disagree enormously. By age 15, the share of a 2011 cohort retired is about 52% under `AU_RES`, 16% under `INTL_EARLY` and 2% under `INTL_REGULAR`. That 20x spread is why section 6.4 matters.

### 6.4 Measuring lifetimes from data (the creative twist)

APVI estimates solar penetration using the ABS count of suitable dwellings in each postcode [19]. Where cumulative installs exceed the dwellings available, the excess is mostly replacements. We use that to fit β:

1. **Align dates.** Count cumulative installs per POA up to Census night (10 August 2021), so they line up with the 2021 dwelling counts.
2. **Choose a denominator.** Use separate houses by default. As a sensitivity check, add semi-detached, row and terrace houses.
3. **Filter postcodes.** Keep POAs with at least 500 houses. Drop business-heavy POAs, where the mean system size from 2016 to 2021 is above 15 kW (configurable). Keep only full POAs, where installs exceed houses.
4. **Observed excess.** E = installs - houses.
5. **Modelled replacements.** R(β) = sum over cohorts of installs × F(age on 10 Aug 2021; β, α = 2.4928). This assumes each retirement triggers one new install.
6. **Fit.** Grid-search β from 10 to 35 years in 0.25 steps, minimising the sum of (E - R)². Report β, the number of POAs, RMSE and the fitted F(15).
7. **Cross-check.** Compute the implied national replacement share of installs for 2024 and 2025, by state. Compare it with industry's "over a third of new installs in some states" [12].

Caveats to state openly:
- Some excess is homes built after the 2021 Census.
- Some installs add a second system rather than replace the first.
- Small business systems inflate counts.
- Only full postcodes reveal replacements, so the fit comes from full postcodes and is applied nationally.
- The most recent months are incomplete because registrations lag, so exclude the last 12 months from any fit.

### 6.5 Site optimiser (maximal covering location problem)

**Inputs.**
- **Demand points:** POA centroids, each weighted by the tonnes retiring there from 2026 to 2030 under the chosen scenario (default `FITTED`, falling back to `AU_RES`).
- **Candidate sites:** facilities from Geoscience Australia's Waste Management Facilities Database where a public drop-off is plausible [17][18]. Inspect the facility-type field first, then record the chosen types in config.
- **Coverage rule:** a site covers a POA if the centroid distance is 30 km or less (configurable), measured in EPSG:3577.

**Objective.** Choose exactly 100 sites to maximise covered tonnes, with at least 2 sites in each state or territory that has candidates.

**Solver.**
- **Greedy:** seed each state with its best site, then repeatedly add the site that covers the most still-uncovered tonnes. This is guaranteed at least 63% of the optimum and usually far closer.
- **Exact (optional):** PuLP with CBC and a 120 s time limit. Report the gap against greedy.

**Baseline.** Run the same algorithm with candidates restricted to capital-city areas (ABS GCCSA). The pitch claim is coverage %, optimised vs capitals-only.

**Outputs.** For each site: expected tonnes and panels per year from 2026 to 2035, and the POAs covered. Nationally: % of 2026 to 2030 tonnes covered, and mean distance to the nearest site.

### 6.6 Materials layer (stretch)

Silver is only about 0.05% of a panel's mass but about 47% of the value of its recoverable materials [21]. Take the rest of the composition shares from the same source table.

Show each POA and each site its rooftop "urban mine": tonnes of glass, aluminium, silicon, copper and silver.

## 7. Starting assumptions (copy into pipeline/config.py)

Panel watts and mass by install year are **starting estimates to verify**, anchored on 58 to 65 t/MW for 2018-era panels [22]. Make both visible settings in the UI.

| Install years | Watts per panel | kg per panel | kg per kW (derived) |
|---|---|---|---|
| up to 2008 | 170 | 15.5 | 91 |
| 2009 to 2010 | 185 | 15.5 | 84 |
| 2011 to 2012 | 200 | 16.0 | 80 |
| 2013 to 2014 | 240 | 17.5 | 73 |
| 2015 to 2016 | 265 | 18.5 | 70 |
| 2017 to 2018 | 300 | 18.5 | 62 |
| 2019 to 2020 | 330 | 19.0 | 58 |
| 2021 to 2022 | 390 | 21.0 | 54 |
| 2023 to 2024 | 430 | 21.5 | 50 |
| 2025 onward | 450 | 22.0 | 49 |

Other defaults:
- **Optimiser:** coverage radius 30 km; 100 sites; at least 2 sites per state.
- **Years:** forecast 2015 to 2035; demand weights from 2026 to 2030.
- **Fit filters:** fit cut-off date 10 Aug 2021; minimum 500 houses per POA; maximum mean system size 15 kW.

## 8. Data sources

| Dataset | Publisher | Used for | Notes |
|---|---|---|---|
| Small-scale installation postcode data [14] | Clean Energy Regulator | Cohorts | Monthly, by postcode, since 2001. Inspect the file layout before parsing; it may be split by year or sheet. Solar PV only for the MVP. Recent months are provisional. |
| ASGS Edition 3 digital boundary files [15] | ABS | POA 2021 polygons, GCCSA (capital cities), STE (states) | GDA2020. Simplify for the web. |
| Census 2021 DataPacks, General Community Profile, POA level [16] | ABS | Suitable dwellings | Find the dwelling-structure table code in the DataPack metadata. |
| Waste Management Facilities Database, 2022 update [17][18] | Geoscience Australia | Candidate sites | CSV or GeoJSON. Record the facility types we keep. |
| Mapping Australian PV installations [19] | APVI | Method reference only | Do not scrape. |

Licences: Australian government data is usually CC BY 4.0, but check each page and record the licence in the README.

## 9. Validation targets

- **Annual national waste.** About 59,000 t now (reported for 2025), rising to more than 91,000 t by 2030 [7][8].
- **Cumulative.** Around 1 Mt, or about 50M panels, by 2035 [1].
- **Replacements.** Over a third of new installs in some states [12].

These are reported figures, and their year labels vary slightly between sources. Treat them as a band, not exact targets. Do not tune parameters silently to hit them; report which scenario lands closest and by how much. If every scenario is more than 3x off, suspect a unit error first.

## 10. Prior work, and our edge (say this upfront in the pitch)

**What exists:**
- **National projections.** A 2019 study projected about 0.8 Mt of cumulative waste by 2047 from installs up to 2018 [24]. UNSW has published projections for 2022 to 2050 (Tan, Deng and Egan, 2024).
- **South Australia.** A study forecast panel waste by postcode and optimised a collection network for SA [23].
- **Commercial reports.** A private firm sells per-postcode projection reports to councils.

**Our edge:**
- national and postcode-level
- open, and refreshed monthly from CER data
- lifetimes inferred from data, not assumed
- built around the siting decision the pilot actually faces
- validation shown on screen

## 11. Pitch essentials (for README and UI copy)

- **Hook.** "Four million homes have rooftop solar. The panels coming off them are, by one recycler's estimate, about eight years old, and the national collection pilot has been frozen since May. Whoever restarts it needs to know where the panels are. We built that map."
- **Demo moment.** A year slider turns the 2011/12 install boom into a waste wave spreading across suburbs. Then the optimiser drops 100 pins and the coverage figure jumps against capitals-only.
- **Money.**
  - Recycling costs about $28 per panel against $4.50 for landfill [10].
  - Every $1 per panel cut from logistics, across about 50M panels, is worth about $50M (our arithmetic).
  - The materials are expected to be worth over $1B cumulatively by 2035 [25].
  - The government estimates a full scheme could unlock up to $7.3B in benefits [26].
- **Harm.**
  - It keeps lead, antimony and cadmium out of landfill [20].
  - It cuts illegal exports [27].
  - It keeps a struggling recycling industry alive [4].
- **EU link.** An EU Climate Dialogues study for Australia recommended spreading collection points nationally, co-locating them with council facilities, adding retailer drop-offs and educating owners against premature retirement. It also found about 70% of waste expected by 2030 lies within 150 km of the five biggest cities [20]. PanelPath turns that recommendation into an operational plan.
- **Your edge in Q&A.** The materials layer is where a materials-characterisation background makes the team most credible.

## 12. Known risks and caveats

- **Solar farms.** Utility-scale solar is not in the postcode data. Say so, and optionally add a national top-up.
- **Mass per kW.** This is the biggest single assumption after lifetime. Show a sensitivity check.
- **Postcode mismatches.** CER postcodes and ABS POAs don't match perfectly (PO box postcodes, for example). Log the share of kW lost.
- **Fit confounders.** Business systems, new dwellings and add-on systems all bias the lifetime fit (section 6.4).
- **Late registrations.** Recent months are provisional. Flag them in the UI.
- **Distances.** These are straight-line distances, not road distances. Say so; road distance is a stretch goal.

## 13. Sources

1. DCCEEW, National Solar Panel Recycling Pilot: https://www.dcceew.gov.au/environment/protection/waste/solar-panels
2. ABC News, 1 Apr 2026: https://www.abc.net.au/news/2026-04-01/australians-solar-panel-waste-expectations-outlined/106520652
3. RenewEconomy, pilot suspended, Jul 2026: https://reneweconomy.com.au/australias-solar-pv-recycling-plans-on-hold-after-flagship-pilot-project-suspended/
4. RenewEconomy, recyclers shedding staff, Sep 2026: https://reneweconomy.com.au/solar-recycler-losing-insane-amount-of-money-and-about-to-shed-staff-as-pv-pilot-program-remains-suspended/
5. RenewEconomy, industry calls for a restart, Sep 2026: https://reneweconomy.com.au/solar-recycling-industry-calls-on-government-to-unpause-pilot-reboot-it-before-end-of-year/
6. WA solar recycling pathway and pilot timeline, 2026: https://mckerchercorporation.com/wa-solar-recycling-pathway-market-consultation-2026/
7. Report on Senate committee evidence (panel age, 17% recycled, 59 kt to 91 kt): https://www.theepochtimes.com/world/call-for-nationwide-ban-on-sending-solar-panels-to-landfill-amid-vast-waste-concerns-6070508
8. NSW Government release on panel waste volumes: https://www.nsw.gov.au/ministerial-releases/nsw-leads-way-towards-national-solar-panel-reuse-and-recycling-scheme
9. NSW draft PV regulation, Sep 2026: https://lenergy.com.au/nsw-leads-push-for-mandatory-solar-panel-recycling/
10. pv magazine Australia, recycling costs, May 2026: https://www.pv-magazine-australia.com/2026/05/13/recycling-is-missing-piece-in-australias-solar-success-story/
11. Tan, Dias, Chang and Deng (UNSW), Sustainability 14(9):5336, 2022: https://www.mdpi.com/2071-1050/14/9/5336
12. RenewEconomy, pilot announcement and replacement share, Jan 2026: https://reneweconomy.com.au/too-valuable-to-throw-out-labor-announces-first-national-solar-panel-recycling-pilot-program/
13. IRENA and IEA-PVPS, End-of-Life Management: Solar PV Panels, 2016: https://www.irena.org/-/media/Files/IRENA/Agency/Publication/2016/IRENA_IEAPVPS_End-of-Life_Solar_PV_Panels_2016.pdf
14. Clean Energy Regulator, small-scale installation postcode data: https://cer.gov.au/markets/reports-and-data/small-scale-installation-postcode-data
15. ABS, ASGS Edition 3 digital boundary files: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files
16. ABS, Census DataPacks: https://www.abs.gov.au/census/find-census-data/datapacks
17. Geoscience Australia, Waste Management Facilities Database (eCat): https://ecat.ga.gov.au/geonetwork/srv/api/records/495820b9-4a56-4409-9d1b-950589b50936
18. Geoscience Australia, Digital Atlas layer: https://digital.atlas.gov.au/datasets/waste-management-facilities-1
19. APVI, Mapping Australian PV installations: https://pv-map.apvi.org.au/historical
20. EU Climate Dialogues, PV Circularity Policy Recommendations (Overview), 2024: https://www.eeas.europa.eu/sites/default/files/documents/2024/23039%20-%20GIZ%20Solar%20PV%20Circularity%20Report%20Overview.pdf
21. Composition of a crystalline silicon panel (table citing IEA-PVPS 2016): https://www.researchgate.net/figure/The-composition-of-a-crystalline-silicon-solar-panel_tbl2_376710187
22. Panel mass per MW estimate: https://freeingenergy.com/math/solar-panel-module-retired-waste-landfill-m134/
23. Optimised PV waste collection network for South Australia, J. Environmental Management, 2022: https://www.sciencedirect.com/science/article/abs/pii/S0301479722005801
24. Mahmoudi, Huda and Behnia, PV waste forecasting for Australia, 2019: https://opus.lib.uts.edu.au/handle/10453/140599
25. Report on the ATSE submission (materials value): https://www.theepochtimes.com/world/australia-eyeing-1-million-tonnes-of-solar-panel-waste-by-2035-with-90-percent-destined-for-landfill-6070485
26. Pilot explainer citing scheme benefits of up to $7.3B: https://www.pscenergy.com.au/blog/solar-panel-recycling-australia-governments-pilot/
27. RenewEconomy, illegal exports of broken panels, Jul 2026: https://reneweconomy.com.au/solar-waste-smuggling-the-pv-recycling-problem-that-is-kicking-the-industry-while-its-down/
28. EU Delegation to Australia, hackathon announcement: https://www.eeas.europa.eu/delegations/australia/climate-hacktion-brings-students-together-build-climate-solutions-ahead-cop31_en
29. UNFCCC, COP31 Presidency targets: https://unfccc.int/news/cop31-presidency-announces-new-targets-on-global-electrification-cutting-waste-resilient-cities
30. RenewEconomy, pilot stalled and parliamentary hearing: https://reneweconomy.com.au/three-months-and-still-no-sign-of-life-but-government-says-it-is-committed-to-solar-recycling-pilot/amp/
